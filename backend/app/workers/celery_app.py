"""Celery application — replaces APScheduler + arq (App Flow §14.9).

Run worker (Windows/Upstash optimized):  
celery -A app.workers.celery_app worker --loglevel=info --pool=solo --without-gossip --without-mingle --without-heartbeat

Run beat:    
celery -A app.workers.celery_app beat --loglevel=info
"""

import os
from celery import Celery
from celery.schedules import crontab
from app.core.config import settings

CELERY_BROKER_URL = os.getenv("CELERY_BROKER_URL", settings.REDIS_URL)

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

celery_app.conf.beat_schedule = {
    "process-outbox-every-10-seconds": {
        "task": "app.workers.celery_tasks.process_outbox_task",
        "schedule": 10.0,
    },
    "scan-planner-reminders-hourly": {
        "task": "app.workers.celery_tasks.scan_planner_reminders_task",
        "schedule": crontab(minute=0),
    },
}

celery_app.autodiscover_tasks(["app.workers"], related_name="celery_tasks")
