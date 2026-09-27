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
from app.models.assessment import UserSkillAssessment, Skill
from app.core.role_skills import (
    ROLE_ASSESSMENT_SKILLS,
    get_valid_keys,
    get_category_for_key,
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


def _get_or_create_skill(db: Session, skill_key: str, category: str = None) -> Skill:
    skill = db.query(Skill).filter(Skill.skill_key == skill_key).first()
    if not skill:
        skill_type = "role_specific"
        if category == "Core Subjects":
            skill_type = "subject"
        elif category == "DSA":
            skill_type = "dsa"
        skill = Skill(skill_key=skill_key, skill_type=skill_type, category=category)
        db.add(skill)
        db.flush()
    return skill


@router.get("/subjects", response_model=SubjectsResponse)
def get_subjects(
    current_user: User = Depends(deps.get_current_active_user),
    db: Session = Depends(get_db),
):
    """Return the user's skill profile for their current target_role grouped by category."""
    role = current_user.target_role or "Software Engineer"
    role_taxonomy = ROLE_ASSESSMENT_SKILLS.get(role, {})

    db_rows = (
        db.query(UserSkillAssessment, Skill)
        .join(Skill, UserSkillAssessment.skill_id == Skill.id)
        .filter(
            UserSkillAssessment.user_id == current_user.id,
            UserSkillAssessment.role == role,
        )
        .all()
    )
    confidence_map: dict[str, int] = {
        skill.skill_key: int(usa.self_rated_confidence) for usa, skill in db_rows
    }

    # --- Auto-carry-over fix for existing users ---
    all_at_default = all(v <= 25 for v in confidence_map.values()) if confidence_map else True
    if all_at_default:
        universal_rows = (
            db.query(UserSkillAssessment, Skill)
            .join(Skill, UserSkillAssessment.skill_id == Skill.id)
            .filter(
                UserSkillAssessment.user_id == current_user.id,
                UserSkillAssessment.role == None,  # noqa: E711
            )
            .all()
        )
        universal_map = {skill.skill_key: int(usa.self_rated_confidence) for usa, skill in universal_rows}
        if any(v > 25 for v in universal_map.values()):
            for key, val in universal_map.items():
                if key not in confidence_map or confidence_map[key] <= 25:
                    confidence_map[key] = val
                    
            existing_keys = {skill.skill_key for usa, skill in db_rows}
            for cat_name, skills in role_taxonomy.items():
                for s in skills:
                    sk = s["key"]
                    promoted_conf = confidence_map.get(sk, DEFAULT_CONFIDENCE)
                    if sk in existing_keys:
                        for usa, skill in db_rows:
                            if skill.skill_key == sk and usa.self_rated_confidence <= 25 and promoted_conf > 25:
                                usa.self_rated_confidence = promoted_conf
                    else:
                        if promoted_conf > 25:
                            skill_obj = _get_or_create_skill(db, sk, cat_name)
                            db.add(UserSkillAssessment(
                                user_id=current_user.id,
                                skill_id=skill_obj.id,
                                role=role,
                                self_rated_confidence=promoted_conf,
                            ))
            try:
                db.commit()
                db_rows = (
                    db.query(UserSkillAssessment, Skill)
                    .join(Skill, UserSkillAssessment.skill_id == Skill.id)
                    .filter(UserSkillAssessment.user_id == current_user.id, UserSkillAssessment.role == role)
                    .all()
                )
                confidence_map = {skill.skill_key: int(usa.self_rated_confidence) for usa, skill in db_rows}
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
        skill_obj = _get_or_create_skill(db, item.skill_key, category)

        existing = (
            db.query(UserSkillAssessment)
            .filter(
                UserSkillAssessment.user_id == current_user.id,
                UserSkillAssessment.role == body.role,
                UserSkillAssessment.skill_id == skill_obj.id,
            )
            .first()
        )
        if existing:
            existing.self_rated_confidence = item.confidence
        else:
            db.add(UserSkillAssessment(
                user_id=current_user.id,
                skill_id=skill_obj.id,
                role=body.role,
                self_rated_confidence=item.confidence,
            ))
        updated += 1

    db.commit()
    return {"success": True, "updated": updated}
