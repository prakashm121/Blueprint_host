"""Celery tasks — clean wrappers around existing business logic.

No asyncio.to_thread needed: Celery workers run synchronously
in their own isolated processes.

Run worker (Windows/Upstash optimized):
celery -A app.workers.celery_app worker --loglevel=info --pool=solo --without-gossip --without-mingle --without-heartbeat

Run beat:
celery -A app.workers.celery_app beat --loglevel=info
"""

import logging
from app.workers.celery_app import celery_app
from app.workers.outbox import process_outbox_events
from app.workers.scheduler_jobs import scan_due_planner_tasks

logger = logging.getLogger("placementos.celery")


@celery_app.task(
    name="app.workers.celery_tasks.process_outbox_task",
    bind=True,
    max_retries=3,
    default_retry_delay=15,
)
def process_outbox_task(self):
    try:
        n = process_outbox_events()
        if n:
            logger.info("Celery outbox processed %d events", n)
    except Exception as exc:
        raise self.retry(exc=exc)


@celery_app.task(name="app.workers.celery_tasks.scan_planner_reminders_task")
def scan_planner_reminders_task():
    scan_due_planner_tasks()
