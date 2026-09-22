from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional

from app.api import deps
from app.db.session import get_db
from app.models.user import User
from app.models.notification import Notification
from app.services.notification_service import get_unread_count, mark_read, mark_all_read

router = APIRouter()


class NotificationItem(BaseModel):
    id: int
    notification_type: str
    title: str
    body: str
    priority: str
    action_url: Optional[str]
    read_at: Optional[str]
    created_at: str

    class Config:
        from_attributes = True


class UnreadCountResponse(BaseModel):
    unread_count: int


@router.get("/unread-count", response_model=UnreadCountResponse)
def unread_count(
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_active_user),
):
    return UnreadCountResponse(unread_count=get_unread_count(db, current_user.id))


@router.get("/", response_model=list[NotificationItem])
def list_notifications(
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_active_user),
):
    rows = (
        db.query(Notification)
        .filter(Notification.user_id == current_user.id)
        .order_by(Notification.created_at.desc())
        .limit(50)
        .all()
    )
    return [
        NotificationItem(
            id=n.id,
            notification_type=n.notification_type,
            title=n.title,
            body=n.body,
            priority=n.priority,
            action_url=n.action_url,
            read_at=n.read_at.isoformat() if n.read_at else None,
            created_at=n.created_at.isoformat() if n.created_at else "",
        )
        for n in rows
    ]


@router.patch("/{notification_id}/read")
def read_notification(
    notification_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_active_user),
):
    n = mark_read(db, notification_id, current_user.id)
    if not n:
        raise HTTPException(status_code=404, detail="Notification not found")
    return {"success": True}


@router.post("/read-all")
def read_all(
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_active_user),
):
    count = mark_all_read(db, current_user.id)
    return {"success": True, "marked_read": count}
