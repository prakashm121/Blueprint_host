"""
profile.py — User profile read/write API.

GET  /api/v1/profile/   — fetch full profile
PATCH /api/v1/profile/  — update profile fields (including target_role, preparation_status)

Note: The old GET /api/v1/profile/roadmap endpoint was removed in Phase 4.
      Use GET /api/v1/roadmap instead — it reads from RoleRoadmap + RoadmapMilestone tables.
"""
import json
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from typing import Optional, List

from app.api import deps
from app.db.session import get_db
from app.models.user import User
from app.models.profile import Profile as ProfileModel
from app.core.cache import delete_cache

router = APIRouter()


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

class ProfileUpdateRequest(BaseModel):
    # Academic
    full_name: Optional[str] = None
    college_name: Optional[str] = None
    degree: Optional[str] = None
    specialization: Optional[str] = None
    graduation_year: Optional[int] = None
    cgpa: Optional[float] = Field(None, ge=0.0, le=10.0)

    # Career goals — these live on the User model, not Profile
    target_role: Optional[str] = None
    target_companies: Optional[List[str]] = None   # replaces the full list
    preparation_status: Optional[str] = None       # not_started | early | mid | final_stretch

    # Contact / social
    phone_number: Optional[str] = None
    linkedin_url: Optional[str] = None
    github_username: Optional[str] = None
    bio: Optional[str] = None
    avatar_url: Optional[str] = None


def _profile_response(profile: ProfileModel, user: User) -> dict:
    return {
        "full_name":          profile.full_name,
        "college_name":       profile.college_name,
        "degree":             profile.degree,
        "specialization":     profile.specialization,
        "graduation_year":    profile.graduation_year,
        "cgpa":               float(profile.cgpa) if profile.cgpa else None,
        "phone_number":       profile.phone_number,
        "linkedin_url":       profile.linkedin_url,
        "github_username":    profile.github_username,
        "bio":                profile.bio,
        "avatar_url":         profile.avatar_url,
        "target_role":        user.target_role,
        "target_companies":   json.loads(user.target_companies or "[]"),
        "preparation_status": user.preparation_status or "early",
    }


# ---------------------------------------------------------------------------
# GET /api/v1/profile/
# ---------------------------------------------------------------------------

@router.get("/")
def get_profile(
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_active_user),
):
    profile = current_user.profile
    if not profile:
        # Auto-create empty profile so frontend always gets a shape
        profile = ProfileModel(user_id=current_user.id)
        db.add(profile)
        db.commit()
        db.refresh(profile)
    return _profile_response(profile, current_user)


# ---------------------------------------------------------------------------
# PATCH /api/v1/profile/
# ---------------------------------------------------------------------------

VALID_PREPARATION_STATUSES = {"not_started", "early", "mid", "final_stretch"}

@router.patch("/")
def update_profile(
    body: ProfileUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_active_user),
):
    profile = current_user.profile
    if not profile:
        profile = ProfileModel(user_id=current_user.id)
        db.add(profile)

    # Update Profile table fields
    profile_fields = [
        "full_name", "college_name", "degree", "specialization",
        "graduation_year", "cgpa", "phone_number", "linkedin_url",
        "github_username", "bio", "avatar_url",
    ]
    for field in profile_fields:
        val = getattr(body, field, None)
        if val is not None:
            setattr(profile, field, val)

    # Update User table fields
    if body.target_role is not None:
        current_user.target_role = body.target_role

    if body.target_companies is not None:
        if len(body.target_companies) > 10:
            raise HTTPException(400, "Maximum 10 target companies allowed.")
        current_user.target_companies = json.dumps(body.target_companies)

    if body.preparation_status is not None:
        if body.preparation_status not in VALID_PREPARATION_STATUSES:
            raise HTTPException(400, f"preparation_status must be one of {VALID_PREPARATION_STATUSES}")
        current_user.preparation_status = body.preparation_status

    # Advance onboarding step if still on profile stage
    if profile.college_name and current_user.onboarding_step == "profile":
        current_user.onboarding_step = "assessment"

    profile.version = (profile.version or 1) + 1
    db.commit()
    db.refresh(profile)

    # Invalidate all user-specific caches that depend on profile data
    delete_cache(f"dashboard:{current_user.id}")
    delete_cache(f"mentor:context:{current_user.id}")

    return _profile_response(profile, current_user)
