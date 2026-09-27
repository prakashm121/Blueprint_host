"""
assessment.py — Stores user self-assessment scores per skill (0-100).
self_rated_confidence < 50 = weak area; >= 75 = strong area.
"""
from sqlalchemy import Column, Integer, String, SmallInteger, ForeignKey, DateTime, Index, UniqueConstraint
from sqlalchemy.sql import func
from app.db.session import Base


class Skill(Base):
    __tablename__ = "skills"

    id = Column(Integer, primary_key=True, index=True)
    skill_key = Column(String(80), unique=True, nullable=False)
    skill_type = Column(String(20), nullable=False)
    category = Column(String(60), nullable=True)

class UserSkillAssessment(Base):
    __tablename__ = "user_skill_assessments"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    skill_id = Column(Integer, ForeignKey("skills.id", ondelete="CASCADE"), index=True, nullable=False)
    role = Column(String(80), nullable=True)
    self_rated_confidence = Column(SmallInteger, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (
        Index("ix_usa_user_confidence", "user_id", "self_rated_confidence"),
        Index("ix_usa_user_role", "user_id", "role"),
        UniqueConstraint("user_id", "skill_id", "role", name="uq_usa_user_skill_role"),
    )
