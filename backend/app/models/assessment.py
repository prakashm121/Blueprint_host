"""
assessment.py — Stores user self-assessment scores per skill (0-100).
self_rated_confidence < 50 = weak area; >= 75 = strong area.
"""
from sqlalchemy import Column, Integer, String, SmallInteger, ForeignKey, DateTime, Index, UniqueConstraint
from sqlalchemy.sql import func
from app.db.session import Base


class UserSkillAssessment(Base):
    __tablename__ = "user_skill_assessments"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=False)
    skill_key = Column(String(80), nullable=False)
    skill_type = Column(String(20), nullable=False)  # subject | dsa | role_specific
    category = Column(String(60), nullable=True)     # e.g. "Backend", "Database", "Core Subjects"
    role = Column(String(80), nullable=True)          # e.g. "Backend Engineer" — NULL for universal skills
    self_rated_confidence = Column(SmallInteger, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (
        Index("ix_usa_user_confidence", "user_id", "self_rated_confidence"),
        Index("ix_usa_user_role", "user_id", "role"),
        UniqueConstraint("user_id", "role", "skill_key", name="uq_usa_user_role_skill"),
    )
