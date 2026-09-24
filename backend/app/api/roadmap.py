"""
roadmap.py â€” API for fetching and updating a user's role roadmap.
The roadmap is created inline during onboarding (no background task).
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.api import deps
from app.db.session import get_db
from app.models.user import User
from app.models.roadmap import RoleRoadmap, RoadmapMilestone

router = APIRouter()


class MilestoneOut(BaseModel):
    id: int
    title: str
    description: str | None
    category: str
    priority_order: int
    status: str

    class Config:
        from_attributes = True


class RoadmapOut(BaseModel):
    roadmap_id: int
    role: str
    milestones: list[MilestoneOut]


class MilestoneStatusUpdate(BaseModel):
    status: str  # pending | in_progress | completed


VALID_STATUSES = {"pending", "in_progress", "completed"}


@router.get("", response_model=RoadmapOut)
def get_roadmap(
    current_user: User = Depends(deps.get_current_active_user),
    db: Session = Depends(get_db),
):
    """Fetch the user's current role roadmap with all milestones."""
    roadmap = (
        db.query(RoleRoadmap)
        .order_by(RoleRoadmap.created_at.desc())
        .first()
    )
    if not roadmap:
        raise HTTPException(status_code=404, detail="No roadmap found. Complete onboarding first.")

    milestones = [
        MilestoneOut(
            id=m.id,
            title=m.title,
            description=m.description,
            category=m.category,
            priority_order=m.priority_order,
            status=m.status,
        )
        for m in roadmap.milestones
    ]
    return RoadmapOut(roadmap_id=roadmap.id, role=roadmap.role, milestones=milestones)


@router.patch("/milestones/{milestone_id}")
def update_milestone_status(
    milestone_id: int,
    body: MilestoneStatusUpdate,
    current_user: User = Depends(deps.get_current_active_user),
    db: Session = Depends(get_db),
):
    """Update the status of a single milestone (pending â†’ in_progress â†’ completed)."""
    if body.status not in VALID_STATUSES:
        raise HTTPException(status_code=422, detail=f"status must be one of {VALID_STATUSES}")

    milestone = (
        db.query(RoadmapMilestone)
        .filter(RoadmapMilestone.id == milestone_id)
        .first()
    )
    if not milestone:
        raise HTTPException(status_code=404, detail="Milestone not found")

    milestone.status = body.status
    db.commit()
    return {"success": True, "milestone_id": milestone_id, "status": body.status}

