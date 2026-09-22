from sqlalchemy import Column, Integer, String, Text, ForeignKey, DateTime
from sqlalchemy.sql import func
from app.db.session import Base


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=False)
    notification_type = Column(String(30), nullable=False, default="System")
    title = Column(String(255), nullable=False)
    body = Column(Text, nullable=False)
    priority = Column(String(20), nullable=False, default="normal")
    action_url = Column(String(500), nullable=True)
    read_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
