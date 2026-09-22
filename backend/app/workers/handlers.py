"""
handlers.py - Outbox event handlers (notification-only, no email).
"""
import logging
from datetime import datetime, timezone

from app.db.session import SessionLocal
from app.models.user import User
from app.models.planner import PlannerTask
from app.services.notification_service import (
    notify_welcome,
    notify_roadmap_ready,
    notify_planner_reminder,
    notify_resume_ready,
)
from app.workers import event_types as ET

logger = logging.getLogger("blueprint.handlers")


def handle_notification_welcome(payload: dict) -> None:
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == payload["user_id"]).first()
        if user:
            notify_welcome(db, user)
    finally:
        db.close()


def handle_notification_roadmap_ready(payload: dict) -> None:
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == payload["user_id"]).first()
        if user:
            notify_roadmap_ready(db, user)
    finally:
        db.close()


def handle_notification_planner_reminder(payload: dict) -> None:
    db = SessionLocal()
    try:
        notify_planner_reminder(
            db,
            payload["user_id"],
            payload["task_title"],
            payload["due_label"],
        )
    finally:
        db.close()


def handle_notification_resume_ready(payload: dict) -> None:
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == payload["user_id"]).first()
        if user:
            notify_resume_ready(db, user)
    finally:
        db.close()


def handle_planner_task_completed(payload: dict) -> None:
    db = SessionLocal()
    try:
        task = db.query(PlannerTask).filter(PlannerTask.id == payload["task_id"]).first()
        if not task:
            return
        task.status = "completed"
        task.completed_at = datetime.now(timezone.utc)
        db.commit()
    finally:
        db.close()


HANDLERS: dict[str, callable] = {
    ET.NOTIFICATION_WELCOME: handle_notification_welcome,
    ET.NOTIFICATION_ROADMAP_READY: handle_notification_roadmap_ready,
    ET.NOTIFICATION_PLANNER_REMINDER: handle_notification_planner_reminder,
    ET.NOTIFICATION_RESUME_READY: handle_notification_resume_ready,
    ET.PLANNER_TASK_COMPLETED: handle_planner_task_completed,
}
