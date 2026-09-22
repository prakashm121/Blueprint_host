from sqlalchemy import Column, Integer, Numeric, DateTime, ForeignKey
from sqlalchemy.sql import func
from app.db.session import Base


class DashboardStatistics(Base):
    __tablename__ = "dashboard_statistics"

    user_id = Column(Integer, ForeignKey("users.id"), primary_key=True)
    planner_completion = Column(Numeric(5, 2), default=0)
    dsa_solved = Column(Integer, default=0)
    subjects_completed = Column(Integer, default=0)
    github_score = Column(Numeric(5, 2), default=0)
    resume_score = Column(Numeric(5, 2), default=0)
    applications_sent = Column(Integer, default=0)
    interviews_completed = Column(Integer, default=0)
    readiness_score = Column(Numeric(5, 2), default=0)
    last_calculated_at = Column(DateTime(timezone=True), server_default=func.now())
