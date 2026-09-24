"""Celery application — handles the resume-analysis background job only.

No Celery Beat: the one genuine periodic job (planner reminders) is
triggered by an external scheduler (GitHub Actions) hitting
POST /api/v1/internal/scan-planner-reminders directly, not by Beat.

Run worker (Windows/Upstash optimized):
celery -A app.workers.celery_app worker --loglevel=info --pool=solo --without-gossip --without-mingle --without-heartbeat
"""

import os
from celery import Celery
from app.core.config import settings

CELERY_BROKER_URL = os.getenv("CELERY_BROKER_URL", settings.REDIS_URL)
if CELERY_BROKER_URL and CELERY_BROKER_URL.startswith("rediss://") and "?" not in CELERY_BROKER_URL:
    CELERY_BROKER_URL += "?ssl_cert_reqs=CERT_NONE"

celery_app = Celery(
    "placementos_workers",
    broker=CELERY_BROKER_URL,
    backend=CELERY_BROKER_URL,
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    worker_prefetch_multiplier=1,
    broker_transport_options={
        "polling_interval": 1.5,
    }
)

celery_app.autodiscover_tasks(['app.workers.tasks'], related_name='ai_tasks')


