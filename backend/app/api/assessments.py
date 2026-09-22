"""
assessments.py - API for reading and updating user skill confidence scores.
Provides a read path for the Dashboard subject card and a write path
for re-rating confidence as the student improves over time.
"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field

from app.api import deps
from app.db.session import get_db
from app.models.user import User
from app.models.assessment import UserSkillAssessment
from app.core.role_skills import (
    ROLE_ASSESSMENT_SKILLS,
    get_valid_keys,
    get_key_to_label,
    get_category_for_key,
    get_common_keys,
)

router = APIRouter()

CONFIDENT_THRESHOLD = 75
WEAK_THRESHOLD = 50
DEFAULT_CONFIDENCE = 25


class SkillOut(BaseModel):
    skill_key: str
    label: str
    confidence: int


class CategoryOut(BaseModel):
    name: str
    skills: list[SkillOut]


class SubjectsResponse(BaseModel):
    role: str
    categories: list[CategoryOut]
    confident_count: int
    weak_count: int
    total: int
    weak_areas: list[str]
    strong_areas: list[str]


class SubjectBatchItem(BaseModel):
    skill_key: str
    confidence: int = Field(ge=0, le=100)


class SubjectBatchRequest(BaseModel):
    role: str
    updates: list[SubjectBatchItem]


class RoleChangeRequest(BaseModel):
    new_role: str


@router.get("/subjects", response_model=SubjectsResponse)
def get_subjects(
    current_user: User = Depends(deps.get_current_active_user),
    db: Session = Depends(get_db),
):
    """Return the user's skill profile for their current target_role grouped by category."""
    role = current_user.target_role or "Software Engineer"
    role_taxonomy = ROLE_ASSESSMENT_SKILLS.get(role, {})

    db_rows = (
        db.query(UserSkillAssessment)
        .filter(
            UserSkillAssessment.user_id == current_user.id,
            UserSkillAssessment.role == role,
        )
        .all()
    )
    confidence_map: dict[str, int] = {
        row.skill_key: int(row.self_rated_confidence) for row in db_rows
    }

    # --- Auto-carry-over fix for existing users ---
    # If all role-specific rows are missing or stuck at 25, check for universal (role=NULL) rows
    # from onboarding and promote them. This is safe and idempotent.
    all_at_default = all(v <= 25 for v in confidence_map.values()) if confidence_map else True
    if all_at_default:
        universal_rows = (
            db.query(UserSkillAssessment)
            .filter(
                UserSkillAssessment.user_id == current_user.id,
                UserSkillAssessment.role == None,  # noqa: E711
            )
            .all()
        )
        universal_map = {r.skill_key: int(r.self_rated_confidence) for r in universal_rows}
        if any(v > 25 for v in universal_map.values()):
            # Merge: prefer existing role row, fall back to universal, fall back to 25
            for key, val in universal_map.items():
                if key not in confidence_map or confidence_map[key] <= 25:
                    confidence_map[key] = val
            # Persist the upgrade to role-specific rows so next call is fast
            existing_keys = {r.skill_key for r in db_rows}
            role_taxonomy = ROLE_ASSESSMENT_SKILLS.get(role, {})
            for cat_name, skills in role_taxonomy.items():
                for s in skills:
                    sk = s["key"]
                    promoted_conf = confidence_map.get(sk, DEFAULT_CONFIDENCE)
                    if sk in existing_keys:
                        # Update existing row if still at 25
                        for row in db_rows:
                            if row.skill_key == sk and row.self_rated_confidence <= 25 and promoted_conf > 25:
                                row.self_rated_confidence = promoted_conf
                    else:
                        skill_type = "subject" if cat_name == "Core Subjects" else ("dsa" if cat_name == "DSA" else "role_specific")
                        db.add(UserSkillAssessment(
                            user_id=current_user.id,
                            skill_key=sk,
                            skill_type=skill_type,
                            category=cat_name,
                            role=role,
                            self_rated_confidence=promoted_conf,
                        ))
            try:
                db.commit()
                # Refresh confidence_map from DB
                db_rows = (
                    db.query(UserSkillAssessment)
                    .filter(UserSkillAssessment.user_id == current_user.id, UserSkillAssessment.role == role)
                    .all()
                )
                confidence_map = {row.skill_key: int(row.self_rated_confidence) for row in db_rows}
            except Exception:
                db.rollback()
    # --- end auto-carry-over ---


    categories_out: list[CategoryOut] = []
    all_skills: list[SkillOut] = []

    for category_name, skills in role_taxonomy.items():
        skill_items: list[SkillOut] = []
        for s in skills:
            conf = confidence_map.get(s["key"], DEFAULT_CONFIDENCE)
            item = SkillOut(skill_key=s["key"], label=s["label"], confidence=conf)
            skill_items.append(item)
            all_skills.append(item)
        categories_out.append(CategoryOut(name=category_name, skills=skill_items))

    confident_count = sum(1 for s in all_skills if s.confidence >= CONFIDENT_THRESHOLD)
    weak_count = sum(1 for s in all_skills if s.confidence < WEAK_THRESHOLD)
    weak_areas = [s.label for s in all_skills if s.confidence < WEAK_THRESHOLD]
    strong_areas = [s.label for s in all_skills if s.confidence >= CONFIDENT_THRESHOLD]

    return SubjectsResponse(
        role=role,
        categories=categories_out,
        confident_count=confident_count,
        weak_count=weak_count,
        total=len(all_skills),
        weak_areas=weak_areas,
        strong_areas=strong_areas,
    )


@router.patch("/subjects")
def update_subjects(
    body: SubjectBatchRequest,
    current_user: User = Depends(deps.get_current_active_user),
    db: Session = Depends(get_db),
):
    """Upsert confidence scores for skills belonging to the given role. Unknown keys are silently skipped."""
    valid_keys = get_valid_keys(body.role)
    updated = 0

    for item in body.updates:
        if item.skill_key not in valid_keys:
            continue

        category = get_category_for_key(body.role, item.skill_key)
        skill_type = "role_specific"
        if category == "Core Subjects":
            skill_type = "subject"
        elif category == "DSA":
            skill_type = "dsa"

        existing = (
            db.query(UserSkillAssessment)
            .filter(
                UserSkillAssessment.user_id == current_user.id,
                UserSkillAssessment.role == body.role,
                UserSkillAssessment.skill_key == item.skill_key,
            )
            .first()
        )
        if existing:
            existing.self_rated_confidence = item.confidence
        else:
            db.add(UserSkillAssessment(
                user_id=current_user.id,
                skill_key=item.skill_key,
                skill_type=skill_type,
                category=category,
                role=body.role,
                self_rated_confidence=item.confidence,
            ))
        updated += 1

    db.commit()
    return {"success": True, "updated": updated}


@router.patch("/role")
def change_role(
    body: RoleChangeRequest,
    current_user: User = Depends(deps.get_current_active_user),
    db: Session = Depends(get_db),
):
    """
    Switch the user target_role.
    Skills common to both roles have confidence preserved.
    Skills only in the new role are seeded at DEFAULT_CONFIDENCE (25).
    Old role rows stay in DB but are invisible to new queries.
    """
    old_role = current_user.target_role or "Software Engineer"
    new_role = body.new_role

    if old_role == new_role:
        return {"success": True, "message": "Role unchanged"}

    common_keys = get_common_keys(old_role, new_role)
    new_valid_keys = get_valid_keys(new_role)

    existing_new_role_rows = (
        db.query(UserSkillAssessment)
        .filter(
            UserSkillAssessment.user_id == current_user.id,
            UserSkillAssessment.role == new_role,
        )
        .all()
    )
    existing_new_role_keys = {row.skill_key for row in existing_new_role_rows}

    old_role_rows = (
        db.query(UserSkillAssessment)
        .filter(
            UserSkillAssessment.user_id == current_user.id,
            UserSkillAssessment.role == old_role,
            UserSkillAssessment.skill_key.in_(common_keys),
        )
        .all()
    )
    old_confidence_map = {row.skill_key: int(row.self_rated_confidence) for row in old_role_rows}

    seeded = 0
    for skill_key in new_valid_keys:
        if skill_key in existing_new_role_keys:
            continue
        confidence = old_confidence_map.get(skill_key, DEFAULT_CONFIDENCE)
        category = get_category_for_key(new_role, skill_key)
        skill_type = "role_specific"
        if category == "Core Subjects":
            skill_type = "subject"
        elif category == "DSA":
            skill_type = "dsa"
        db.add(UserSkillAssessment(
            user_id=current_user.id,
            skill_key=skill_key,
            skill_type=skill_type,
            category=category,
            role=new_role,
            self_rated_confidence=confidence,
        ))
        seeded += 1

    current_user.target_role = new_role
    db.commit()

    return {
        "success": True,
        "old_role": old_role,
        "new_role": new_role,
        "common_skills_preserved": len(common_keys),
        "new_skills_seeded": seeded,
    }