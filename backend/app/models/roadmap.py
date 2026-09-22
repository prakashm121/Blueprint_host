"""
roadmap.py — Role roadmap + milestone models.
One roadmap per user (upserted on re-onboard).
Milestones are ordered by priority_order.
"""
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Index
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.session import Base


class RoleRoadmap(Base):
    __tablename__ = "role_roadmaps"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    role = Column(String(100), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    milestones = relationship(
        "RoadmapMilestone",
        back_populates="roadmap",
        order_by="RoadmapMilestone.priority_order",
        cascade="all, delete-orphan",
    )

    __table_args__ = (
        Index("idx_rr_user_id", "user_id"),
    )


class RoadmapMilestone(Base):
    __tablename__ = "roadmap_milestones"

    id = Column(Integer, primary_key=True, index=True)
    roadmap_id = Column(Integer, ForeignKey("role_roadmaps.id", ondelete="CASCADE"), nullable=False)
    title = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    category = Column(String(50), nullable=False)
    priority_order = Column(Integer, nullable=False, default=0)
    status = Column(String(20), nullable=False, default="pending")  # pending | in_progress | completed
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    roadmap = relationship("RoleRoadmap", back_populates="milestones")

    __table_args__ = (
        Index("idx_rm_roadmap_id", "roadmap_id"),
    )
