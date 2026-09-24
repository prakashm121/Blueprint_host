"""
onboarding.py â€” Four-step onboarding flow.
Step 4 now generates the role roadmap inline (synchronous AI call) instead
of firing a background task. This eliminates the polling loop and the
UI freeze bug caused by navigate() firing before the job completed.
"""
from datetime import datetime, timezone
import json

from fastapi import APIRouter, Depends
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field

from app.api import deps
from app.db.session import get_db
from app.models.user import User
from app.models.assessment import UserSkillAssessment
from app.models.roadmap import RoleRoadmap, RoadmapMilestone
from app.core.config import settings
from app.core.rate_limit import enforce_daily
from app.services.notification_service import notify_welcome
from app.services.roadmap.service import generate_role_roadmap_async
from app.core.role_skills import ROLE_ASSESSMENT_SKILLS, get_key_to_label, get_category_for_key, get_valid_keys

router = APIRouter()

ASSESSMENT_SUBJECTS = [
    {"key": "operating_systems", "label": "Operating Systems"},
    {"key": "dbms", "label": "DBMS"},
    {"key": "computer_networks", "label": "Computer Networks"},
    {"key": "system_design", "label": "System Design"},
]

ASSESSMENT_DSA = [
    {"key": "arrays_strings", "label": "Arrays & Strings"},
    {"key": "trees_graphs", "label": "Trees & Graphs"},
    {"key": "dynamic_programming", "label": "Dynamic Programming"},
    {"key": "sorting_searching", "label": "Sorting & Searching"},
]

TARGET_ROLES = [
    # Engineering
    "Backend Engineer",
    "Frontend Engineer",
    "Full Stack Engineer",
    "Software Engineer",
    "DevOps Engineer",
    "QA Engineer",
    "Security Engineer",
    # Data & AI
    "Data Engineer",
    "Data Scientist",
    "ML Engineer",
    # Design & Management
    "UI/UX Designer",
    "HR",
]

SAMPLE_COMPANIES = [
    # FAANG / Big Tech
    "Google", "Meta", "Apple", "Amazon", "Microsoft", "Netflix",
    # Global Product
    "Atlassian", "Salesforce", "Adobe", "Oracle", "SAP",
    "Uber", "Airbnb", "LinkedIn", "Twitter / X", "Stripe",
    "Shopify", "Twilio", "Cloudflare", "Databricks", "Snowflake",
    # Indian Unicorns & Product
    "Flipkart", "Razorpay", "PhonePe", "Swiggy", "Zomato",
    "Paytm", "CRED", "Meesho", "Zepto", "Groww",
    "Zerodha", "Ola", "Nykaa", "ShareChat", "Freshworks",
    "Zoho", "InMobi", "Postman", "BrowserStack", "Chargebee",
    # Finance & Consulting
    "Goldman Sachs", "Morgan Stanley", "JPMorgan", "Deutsche Bank",
    "McKinsey", "Deloitte", "Accenture",
    # Indian IT Services
    "TCS", "Infosys", "Wipro", "HCL Technologies", "Tech Mahindra",
    "Cognizant", "Capgemini",
    # Others
    "DE Shaw", "Tower Research", "Nvidia", "Qualcomm", "Samsung",
]

# Fallback milestones used when the AI call fails entirely
_FALLBACK_MILESTONES = [
    {"title": "Strengthen DSA Foundations", "description": "Master arrays, strings, and linked lists with 20+ LeetCode problems.", "category": "DSA", "priority_order": 0},
    {"title": "Learn Sorting & Searching Algorithms", "description": "Implement and understand binary search, merge sort, and quick sort from scratch.", "category": "DSA", "priority_order": 1},
    {"title": "Master Trees & Graphs", "description": "Solve BFS, DFS, and tree traversal problems. Cover Dijkstra and Union-Find.", "category": "DSA", "priority_order": 2},
    {"title": "Conquer Dynamic Programming", "description": "Solve 30 DP problems: 0/1 knapsack, LCS, coin change, and matrix DP.", "category": "DSA", "priority_order": 3},
    {"title": "Revise Operating Systems", "description": "Cover process scheduling, memory management, deadlocks, and file systems.", "category": "Subjects", "priority_order": 4},
    {"title": "Revise DBMS Fundamentals", "description": "Study normalization, indexing, transactions, and write SQL query practice.", "category": "Subjects", "priority_order": 5},
    {"title": "Revise Computer Networks", "description": "Cover TCP/IP, DNS, HTTP/HTTPS, subnetting, and OSI layers.", "category": "Subjects", "priority_order": 6},
    {"title": "Learn System Design Basics", "description": "Study load balancers, caching, databases, and design 3 common systems.", "category": "System Design", "priority_order": 7},
    {"title": "Build a Capstone Project", "description": "Build and deploy a full-stack project that demonstrates your target role skills.", "category": "Projects", "priority_order": 8},
    {"title": "Polish Your Resume", "description": "Write a single-page resume with strong action verbs and quantified impact bullets.", "category": "Resume", "priority_order": 9},
    {"title": "Research Target Companies", "description": "Study interview processes, past questions, and company tech stacks for your shortlist.", "category": "Company Preparation", "priority_order": 10},
    {"title": "Take 5 Mock Interviews", "description": "Schedule mock interviews on Pramp or Interviewing.io. Focus on communication and time management.", "category": "Mock Interview", "priority_order": 11},
]



class AssessmentItem(BaseModel):
    skill_key: str
    skill_type: str
    category: str = "Core Subjects"
    self_rated_confidence: int = Field(ge=0, le=100)


class AssessmentRequest(BaseModel):
    responses: list[AssessmentItem]


class RoleSkillItem(BaseModel):
    skill_key: str
    confidence: int = Field(ge=0, le=100)


class RoleSkillsRequest(BaseModel):
    updates: list[RoleSkillItem]


class GoalsRequest(BaseModel):
    target_role: str
    target_companies: list[str] = []
    preparation_status: str = "early"  # beginner | early | mid | late


class StepResponse(BaseModel):
    onboarding_step: str


class RoadmapGenerationResponse(BaseModel):
    roadmap_id: int
    role: str
    milestone_count: int
    status: str


class AssessmentCatalog(BaseModel):
    subjects: list[dict]
    dsa_topics: list[dict]
    target_roles: list[str]
    sample_companies: list[str]


@router.get("/catalog", response_model=AssessmentCatalog)
def get_onboarding_catalog():
    return AssessmentCatalog(
        subjects=ASSESSMENT_SUBJECTS,
        dsa_topics=ASSESSMENT_DSA,
        target_roles=TARGET_ROLES,
        sample_companies=SAMPLE_COMPANIES,
    )


@router.get("/role-skills-catalog")
def get_role_skills_catalog(role: str):
    """Return the curated skill list for a given role, grouped by category."""
    taxonomy = ROLE_ASSESSMENT_SKILLS.get(role, {})
    return {
        "role": role,
        "categories": [
            {"name": cat, "skills": skills}
            for cat, skills in taxonomy.items()
        ],
    }


@router.get("/status")
def get_onboarding_status(
    current_user: User = Depends(deps.get_current_active_user),
):
    return {
        "onboarding_step": current_user.onboarding_step,
        "onboarding_completed": current_user.onboarding_step == "completed",
        "target_role": current_user.target_role,
    }


@router.post("/role-skills", response_model=StepResponse)
def submit_role_skills(
    body: RoleSkillsRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_active_user),
):
    """Step 4: save role-specific skill confidence ratings."""
    role = current_user.target_role or "Software Engineer"
    valid_keys = get_valid_keys(role)

    # Deduplicate: only keep the last confidence value per skill_key
    seen = {}
    for item in body.updates:
        if item.skill_key in valid_keys:
            seen[item.skill_key] = item.confidence

    for skill_key, conf in seen.items():
        category = get_category_for_key(role, skill_key)
        skill_type = "subject" if category == "Core Subjects" else ("dsa" if category == "DSA" else "role_specific")

        # Atomic upsert: concurrent/repeated submits must not race into the unique constraint.
        db.execute(
            pg_insert(UserSkillAssessment)
            .values(
                user_id=current_user.id,
                skill_key=skill_key,
                skill_type=skill_type,
                category=category,
                role=role,
                self_rated_confidence=conf,
            )
            .on_conflict_do_update(
                constraint="uq_usa_user_role_skill",
                set_={"self_rated_confidence": conf},
            )
        )

    current_user.onboarding_step = "generate_roadmap"
    db.commit()
    return StepResponse(onboarding_step="generate_roadmap")


@router.post("/goals", response_model=StepResponse)
def submit_goals(
    body: GoalsRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_active_user),
):
    current_user.target_role = body.target_role
    current_user.target_companies = json.dumps(body.target_companies[:5])
    if hasattr(current_user, "preparation_status"):
        current_user.preparation_status = body.preparation_status
    # New step order: goals (pick role) -> role_skills (assessment) -> generate_roadmap
    current_user.onboarding_step = "role_skills"
    db.commit()
    return StepResponse(onboarding_step="role_skills")



@router.post("/generate-roadmap", response_model=RoadmapGenerationResponse)
async def generate_roadmap(
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_active_user),
):
    """
    Inline roadmap generation â€” no background task, no polling.
    Calls the AI synchronously, persists milestones, marks onboarding complete,
    and returns the result in a single HTTP response.
    """
    enforce_daily(
        "roadmap_generation", current_user.id, settings.ROADMAP_GENERATIONS_PER_DAY,
        "Roadmap generation limit reached for today. Try again tomorrow.",
    )

    target_role = current_user.target_role or "Software Engineer"
    target_companies: list[str] = []
    if current_user.target_companies:
        try:
            target_companies = json.loads(current_user.target_companies)
        except Exception:
            target_companies = []

    # Collect weak areas (confidence < 50) â€” filter by role for accuracy
    key_to_label = get_key_to_label(target_role)
    weak_rows = (
        db.query(UserSkillAssessment)
        .filter(
            UserSkillAssessment.user_id == current_user.id,
            UserSkillAssessment.self_rated_confidence < 50,
        )
        .all()
    )
    weak_areas = [key_to_label.get(r.skill_key, r.skill_key.replace("_", " ").title()) for r in weak_rows]

    preparation_status = getattr(current_user, "preparation_status", "early") or "early"

    # Call AI â€” falls back to hardcoded milestones on failure
    ai_milestones = await generate_role_roadmap_async(
        target_role=target_role,
        prep_stage=preparation_status,
        weak_areas=weak_areas,
    )
    milestone_dicts = [m.model_dump() for m in ai_milestones] if ai_milestones else _FALLBACK_MILESTONES

    # Delete any existing roadmap for this user (re-onboarding support)
    db.query(RoleRoadmap).filter(RoleRoadmap.user_id == current_user.id).delete()
    db.flush()

    # Create fresh roadmap
    roadmap = RoleRoadmap(user_id=current_user.id, role=target_role)
    db.add(roadmap)
    db.flush()  # get roadmap.id

    for i, m in enumerate(milestone_dicts):
        db.add(RoadmapMilestone(
            roadmap_id=roadmap.id,
            title=m.get("title", f"Milestone {i + 1}"),
            description=m.get("description"),
            category=m.get("category", "DSA"),
            priority_order=m.get("priority_order", i),
            status="pending",
        ))

    # Mark onboarding complete
    current_user.onboarding_step = "completed"
    current_user.onboarding_completed_at = datetime.now(timezone.utc)

    # Seed all role-specific skills, carrying over confidence from onboarding universal rows.
    # This bridges the onboarding assessment (role=NULL) with the dashboard subjects page (role=target_role).
    universal_rows = (
        db.query(UserSkillAssessment)
        .filter(
            UserSkillAssessment.user_id == current_user.id,
            UserSkillAssessment.role == None,  # noqa: E711
        )
        .all()
    )
    universal_confidence: dict[str, int] = {r.skill_key: int(r.self_rated_confidence) for r in universal_rows}

    for category_name, skills in ROLE_ASSESSMENT_SKILLS.get(target_role, {}).items():
        for s in skills:
            skill_type = "subject" if category_name == "Core Subjects" else ("dsa" if category_name == "DSA" else "role_specific")
            existing = (
                db.query(UserSkillAssessment)
                .filter(
                    UserSkillAssessment.user_id == current_user.id,
                    UserSkillAssessment.role == target_role,
                    UserSkillAssessment.skill_key == s["key"],
                )
                .first()
            )
            if existing:
                # Already rated on the Subjects page â€” keep as-is
                # But if it's still at 25 (never touched) and onboarding has a higher value, carry it over
                if existing.self_rated_confidence == 25 and s["key"] in universal_confidence:
                    existing.self_rated_confidence = universal_confidence[s["key"]]
            else:
                # Not yet in DB â€” seed from onboarding row if available, else default 25
                seeded_confidence = universal_confidence.get(s["key"], 25)
                db.add(UserSkillAssessment(
                    user_id=current_user.id,
                    skill_key=s["key"],
                    skill_type=skill_type,
                    category=category_name,
                    role=target_role,
                    self_rated_confidence=seeded_confidence,
                ))

    # Welcome notification
    notify_welcome(db, current_user)

    db.commit()
    db.refresh(roadmap)

    return RoadmapGenerationResponse(
        roadmap_id=roadmap.id,
        role=target_role,
        milestone_count=len(milestone_dicts),
        status="completed",
    )


