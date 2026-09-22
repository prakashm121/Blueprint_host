from sqlalchemy import Column, Integer, String, Text, ForeignKey, DateTime, Index
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.session import Base


class MentorConversation(Base):
    __tablename__ = "mentor_conversations"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=False)
    title = Column(String(200), nullable=False, default="New conversation")
    
    # Conversation State
    agent_mode = Column(String(20), nullable=True)  # teacher, mentor, or null for unknown
    active_topic = Column(String(200), nullable=True)  # The current teaching subject
    current_task = Column(String(50), nullable=False, default="general")
    
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    messages = relationship("MentorMessage", back_populates="conversation", cascade="all, delete-orphan")


class MentorMessage(Base):
    __tablename__ = "mentor_messages"

    id = Column(Integer, primary_key=True, index=True)
    conversation_id = Column(Integer, ForeignKey("mentor_conversations.id"), index=True, nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=False)
    role = Column(String(20), nullable=False)  # user | assistant
    content = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (
        Index("ix_mm_conv_created", "conversation_id", "created_at"),
    )

    conversation = relationship("MentorConversation", back_populates="messages")
