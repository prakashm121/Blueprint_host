"""
planner.py — Models for the weekly learning plan and individual tasks.
"""
from sqlalchemy import (
    Column, Integer, String, SmallInteger, Text, Boolean,
    Numeric, Date, DateTime, ForeignKey, Index
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.session import Base


class WeeklyPlan(Base):
    __tablename__ = "weekly_plans"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=False)
    title = Column(String(150), nullable=False)
    description = Column(Text, nullable=True)
    week_number = Column(SmallInteger, nullable=False)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    generation_source = Column(String(20), nullable=False, default="manual")  # ai / manual
    status = Column(String(20), nullable=False, default="active")  # draft, active, completed, archived
    completion_percentage = Column(Numeric(5, 2), default=0)
    total_tasks = Column(Integer, default=0)
    completed_tasks = Column(Integer, default=0)
    version = Column(Integer, default=1)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    tasks = relationship(
        "PlannerTask",
        back_populates="weekly_plan",
        order_by="PlannerTask.display_order",
        cascade="all, delete-orphan"
    )


class PlannerTask(Base):
    __tablename__ = "planner_tasks"

    id = Column(Integer, primary_key=True, index=True)
    weekly_plan_id = Column(Integer, ForeignKey("weekly_plans.id"), index=True, nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=False)
    title = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    category = Column(String(50), nullable=False, default="Custom")
    priority = Column(String(20), nullable=False, default="Medium")
    status = Column(String(20), nullable=False, default="Pending")
    due_date = Column(DateTime(timezone=True), nullable=True)
    estimated_minutes = Column(Integer, nullable=True)
    actual_minutes = Column(Integer, nullable=True)
    reminder_sent = Column(Boolean, default=False)
    display_order = Column(Integer, nullable=False, default=0)
    version = Column(Integer, default=1)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    __table_args__ = (
        Index("ix_pt_user_due", "user_id", "due_date"),
        Index("ix_pt_plan_status", "weekly_plan_id", "status"),
    )

    weekly_plan = relationship("WeeklyPlan", back_populates="tasks")
