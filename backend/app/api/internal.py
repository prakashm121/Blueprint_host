"""
internal.py — Endpoints for external schedulers (e.g. GitHub Actions cron)
to trigger time-based jobs that used to run on Celery Beat.

Not part of the public API surface: every route here is guarded by a
shared secret (X-Internal-Secret header) checked against
settings.INTERNAL_TRIGGER_SECRET, not by user auth.
"""
import hmac
import logging

from fastapi import APIRouter, Header, HTTPException

from app.core.config import settings
from app.workers.scheduler_jobs import scan_due_planner_tasks

logger = logging.getLogger("placementos.api.internal")

router = APIRouter()


def _verify_internal_secret(x_internal_secret: str | None) -> None:
    if not settings.INTERNAL_TRIGGER_SECRET:
        raise HTTPException(status_code=503, detail="Internal trigger secret is not configured")
    if not x_internal_secret or not hmac.compare_digest(
        x_internal_secret.encode(), settings.INTERNAL_TRIGGER_SECRET.encode()
    ):
        raise HTTPException(status_code=401, detail="Invalid or missing internal secret")


@router.post("/scan-planner-reminders")
def trigger_scan_planner_reminders(
    x_internal_secret: str | None = Header(default=None),
):
    _verify_internal_secret(x_internal_secret)
    sent = scan_due_planner_tasks()
    return {"success": True, "reminders_sent": sent}
