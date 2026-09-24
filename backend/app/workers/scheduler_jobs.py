"""
scheduler_jobs.py — Background scan jobs for scheduled events.

scan_due_planner_tasks(): hourly job — finds tasks that are due and writes
an in-app reminder notification directly (no outbox/Celery — this is a
plain synchronous DB write, triggered by an external scheduler hitting
POST /api/v1/internal/scan-planner-reminders; see app/api/internal.py).

Note: reconcile_stuck_generations() was removed in Phase 4 — planner generation
is now inline (synchronous), so there are no background jobs that can get stuck.
"""
import logging
from datetime import datetime, timezone

from app.db.session import SessionLocal
from app.models.planner import PlannerTask
from app.models.user import User
from app.services.notification_service import notify_planner_reminder
from zoneinfo import ZoneInfo

logger = logging.getLogger("placementos.scheduler_jobs")


def scan_due_planner_tasks() -> int:
    """Find tasks that are due today (after 20:00 IST) or overdue, write reminder notifications.

    Returns the number of reminders sent.
    """
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

        sent = 0
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

            # Overdue or today-after-20:00 — write the reminder
            user = db.query(User).filter(User.id == task.user_id).first()
            if not user:
                continue

            due_label = "today" if due_date == today_ist else "overdue"

            notify_planner_reminder(db, user.id, task.title, due_label)

            task.reminder_sent = True
            db.add(task)
            sent += 1

        if sent:
            db.commit()
            logger.info("Planner reminders sent: %d", sent)
        return sent
    except Exception:
        logger.exception("Planner reminder scan failed")
        db.rollback()
        raise
    finally:
        db.close()
