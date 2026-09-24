from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models.notification import Notification
from app.models.user import User


def create_notification(
    db: Session,
    *,
    user_id: int,
    notification_type: str,
    title: str,
    body: str,
    priority: str = "normal",
    action_url: str | None = None,
) -> Notification:
    """App Flow Â§13.2 â€” unified notification write path."""
    notification = Notification(
        user_id=user_id,
        notification_type=notification_type,
        title=title,
        body=body,
        priority=priority,
        action_url=action_url,
    )
    db.add(notification)
    db.commit()
    db.refresh(notification)
    return notification


def get_unread_count(db: Session, user_id: int) -> int:
    return (
        db.query(Notification)
        .filter(Notification.user_id == user_id, Notification.read_at.is_(None))
        .count()
    )


def mark_read(db: Session, notification_id: int, user_id: int) -> Notification | None:
    notification = (
        db.query(Notification)
        .filter(Notification.id == notification_id, Notification.user_id == user_id)
        .first()
    )
    if notification and notification.read_at is None:
        notification.read_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(notification)
    return notification


def mark_all_read(db: Session, user_id: int) -> int:
    now = datetime.now(timezone.utc)
    count = (
        db.query(Notification)
        .filter(Notification.user_id == user_id, Notification.read_at.is_(None))
        .update({Notification.read_at: now}, synchronize_session=False)
    )
    db.commit()
    return count


def notify_welcome(db: Session, user: User) -> Notification:
    return create_notification(
        db,
        user_id=user.id,
        notification_type="System",
        title="Welcome to PlacementOS!",
        body="Your onboarding is complete. Check your weekly planner to start preparing.",
        action_url="/planner",
    )


def notify_roadmap_ready(db: Session, user: User) -> Notification:
    return create_notification(
        db,
        user_id=user.id,
        notification_type="Planner",
        title="Your weekly roadmap is ready",
        body="Your personalized plan has been generated. Open the planner to see your tasks.",
        action_url="/planner",
    )


def notify_planner_reminder(db: Session, user_id: int, task_title: str, due_label: str) -> Notification:
    return create_notification(
        db,
        user_id=user_id,
        notification_type="Planner",
        title=f"Task due {due_label}",
        body=task_title,
        priority="normal",
        action_url="/planner",
    )


def notify_resume_ready(db: Session, user: User) -> Notification:
    return create_notification(
        db,
        user_id=user.id,
        notification_type="System",
        title="Resume Analysis Complete",
        body="Your resume has been successfully analysed. View your ATS score and feedback now.",
        action_url="/vault",
    )

