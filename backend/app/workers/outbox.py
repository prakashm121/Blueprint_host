import json
import logging
from datetime import datetime, timezone

from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from app.core.config import settings
from app.db.session import SessionLocal, engine
from app.models.outbox_event import OutboxEvent
from app.workers.handlers import HANDLERS

logger = logging.getLogger("placementos.outbox")


def enqueue_outbox(
    db: Session,
    event_type: str,
    payload: dict,
    *,
    idempotency_key: str | None = None,
    max_attempts: int | None = None,
) -> OutboxEvent | None:
    """Insert outbox row in the caller's transaction — App Flow §14.5.1."""
    if idempotency_key:
        existing = (
            db.query(OutboxEvent)
            .filter(
                OutboxEvent.idempotency_key == idempotency_key,
                OutboxEvent.status.in_(("pending", "processed")),
            )
            .first()
        )
        if existing:
            return existing

    # Flush any pending changes from the parent transaction BEFORE establishing the savepoint
    # so we don't accidentally catch their IntegrityErrors when establishing the savepoint.
    db.flush()

    event = OutboxEvent(
        event_type=event_type,
        payload=json.dumps(payload),
        status="pending",
        max_attempts=max_attempts or settings.OUTBOX_MAX_ATTEMPTS,
        idempotency_key=idempotency_key,
    )
    
    try:
        with db.begin_nested():
            db.add(event)
            db.flush()
    except IntegrityError:
        if idempotency_key:
            return (
                db.query(OutboxEvent)
                .filter(OutboxEvent.idempotency_key == idempotency_key)
                .first()
            )
        raise
    return event


def _claim_pending_events(db: Session, limit: int) -> list[OutboxEvent]:
    query = (
        db.query(OutboxEvent)
        .filter(OutboxEvent.status == "pending")
        .order_by(OutboxEvent.created_at.asc())
        .limit(limit)
    )
    if engine.dialect.name == "postgresql":
        query = query.with_for_update(skip_locked=True)
    events = query.all()

    for event in events:
        event.status = "in_progress"
    db.commit()
    return events


def process_outbox_events() -> int:
    claim_db = SessionLocal()
    try:
        events = _claim_pending_events(claim_db, settings.OUTBOX_BATCH_SIZE)
    finally:
        claim_db.close()

    if not events:
        return 0

    processed = 0
    db = SessionLocal()
    try:
        for event in events:
            # re-attach event to this fresh session
            event = db.merge(event)
            handler = HANDLERS.get(event.event_type)
            if not handler:
                event.status = "dead_letter"
                event.last_error = f"No handler for {event.event_type}"
                event.attempt_count += 1
                continue

            try:
                payload = json.loads(event.payload)
                start = datetime.now(timezone.utc)
                handler(payload)
                event.status = "processed"
                event.processed_at = datetime.now(timezone.utc)
                processed += 1
                logger.info(
                    "outbox processed id=%s type=%s duration_ms=%d",
                    event.id, event.event_type,
                    int((event.processed_at - start).total_seconds() * 1000),
                )
            except Exception as exc:
                event.attempt_count += 1
                event.last_error = str(exc)[:500]
                if event.attempt_count >= event.max_attempts:
                    event.status = "dead_letter"
                    logger.error("outbox dead_letter id=%s type=%s error=%s", event.id, event.event_type, event.last_error)
                else:
                    event.status = "pending"
                    logger.warning("outbox retry id=%s type=%s attempt=%s", event.id, event.event_type, event.attempt_count)

            db.commit()  # commit after EACH event, not the whole batch

        return processed
    except Exception:
        logger.exception("outbox processor failed")
        db.rollback()
        return processed
    finally:
        db.close()

def outbox_stats() -> dict:
    db = SessionLocal()
    try:
        rows = db.query(OutboxEvent.status, OutboxEvent.id).all()
        counts: dict[str, int] = {}
        for status, _ in rows:
            counts[status] = counts.get(status, 0) + 1
        return {
            "outbox": counts,
            "worker_mode": settings.WORKER_MODE,
            "uses_celery": settings.uses_celery,
        }
    finally:
        db.close()
