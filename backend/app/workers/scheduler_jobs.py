"""
scheduler_jobs.py — Background scan jobs for scheduled events.

scan_due_planner_tasks(): hourly job — finds tasks that are due and enqueues
reminder notifications + emails via the outbox pattern.

Note: reconcile_stuck_generations() was removed in Phase 4 — planner generation
is now inline (synchronous), so there are no background jobs that can get stuck.
"""
import logging
from datetime import datetime, timedelta, timezone

from app.db.session import SessionLocal
from app.models.planner import PlannerTask
from app.models.user import User
from app.workers import event_types as ET
from app.workers.outbox import enqueue_outbox
from zoneinfo import ZoneInfo

logger = logging.getLogger("placementos.scheduler_jobs")


def scan_due_planner_tasks() -> None:
    """Find tasks that are due today (after 20:00 IST) or overdue, enqueue notification + email."""
    db = SessionLocal()
    try:
        now_utc = datetime.now(timezone.utc)
        now_ist = now_utc.astimezone(ZoneInfo("Asia/Kolkata"))
        today_ist = now_ist.date()

        # Fetch all Pending tasks that have a due date and haven't had a reminder sent
        tasks = (
            db.query(PlannerTask)
            .filter(
                PlannerTask.status == "Pending",
                PlannerTask.reminder_sent.is_(False),
                PlannerTask.due_date.isnot(None),
            )
            .all()
        )

        enqueued = 0
        for task in tasks:
            due = task.due_date
            if due.tzinfo is None:
                due = due.replace(tzinfo=timezone.utc)

            # Convert to IST so 'today' matches local Indian time
            due_date = due.astimezone(ZoneInfo("Asia/Kolkata")).date()

            # Ignore future tasks
            if due_date > today_ist:
                continue

            # If due today: only fire after 20:00 IST (gives students the full day)
            if due_date == today_ist and now_ist.hour < 20:
                continue

            # Overdue or today-after-20:00 — enqueue reminder
            user = db.query(User).filter(User.id == task.user_id).first()
            if not user:
                continue

            due_label = "today" if due_date == today_ist else "overdue"
            name = user.profile.full_name if user.profile else user.full_name
            base_key = f"planner-reminder:{task.id}:{due_date.isoformat()}"

            enqueue_outbox(
                db,
                ET.NOTIFICATION_PLANNER_REMINDER,
                {"user_id": user.id, "task_title": task.title, "due_label": due_label},
                idempotency_key=f"{base_key}:notification",
            )
            enqueue_outbox(
                db,
                ET.EMAIL_PLANNER_REMINDER,
                {
                    "email": user.email,
                    "full_name": name,
                    "task_title": task.title,
                    "due_label": due_label,
                },
                idempotency_key=f"{base_key}:email",
            )

            task.reminder_sent = True
            db.add(task)
            enqueued += 1

        if enqueued:
            db.commit()
            logger.info("Planner reminder events enqueued: %d", enqueued)
    except Exception:
        logger.exception("Planner reminder scan failed")
        db.rollback()
    finally:
        db.close()
