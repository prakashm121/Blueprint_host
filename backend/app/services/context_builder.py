"""
context_builder.py — Builds context dicts passed to AI prompts and planner endpoints.
"""
import json
import hashlib
from datetime import date, datetime, timedelta, timezone
from sqlalchemy import cast, Date
from sqlalchemy.orm import Session

from app.models.user import User
from app.models.dashboard_stats import DashboardStatistics
from app.models.assessment import UserSkillAssessment
from app.models.planner import WeeklyPlan, PlannerTask
from app.models.roadmap import RoleRoadmap, RoadmapMilestone
from app.models.mentor import MentorConversation
from app.models.resume import ResumeAnalysis
from app.core.cache import get_cache, set_cache
from app.core.role_skills import (
    ROLE_ASSESSMENT_SKILLS,
    get_key_to_label,
    get_category_for_key,
    get_skills_in_category,
)


def _decode_companies(user: User) -> list[str]:
    """Parse the JSON-encoded target_companies field safely."""
    try:
        return json.loads(user.target_companies) if user.target_companies else []
    except json.JSONDecodeError:
        return []


# ---------------------------------------------------------------------------
# Weekly plan generation context
# Used by: planner.py (create_plan) and initial_plan_service.py
# ---------------------------------------------------------------------------

def build_weekly_plan_context(db: Session, user: User) -> dict:
    """
    Returns everything the AI needs to generate a personalized weekly plan.
    Fetches from the caller's existing DB session — no extra connections opened.
    """
    profile = user.profile

    stats = (
        db.query(DashboardStatistics)
        .filter(DashboardStatistics.user_id == user.id)
        .first()
    )

    role = user.target_role or "Software Engineer"
    key_to_label = get_key_to_label(role)

    assessments = (
        db.query(UserSkillAssessment)
        .filter(
            UserSkillAssessment.user_id == user.id,
            UserSkillAssessment.role == role,
        )
        .all()
    )
    weak_areas = [
        key_to_label.get(a.skill_key, a.skill_key.replace("_", " ").title())
        for a in assessments if a.self_rated_confidence < 50
    ]

    # Last 20 completed/archived tasks so AI won't repeat them.
    # "Archived" tasks are ones the user deleted from the dashboard after completing them.
    completed_tasks = (
        db.query(PlannerTask)
        .filter(
            PlannerTask.user_id == user.id,
            PlannerTask.status.in_(["Completed", "Archived"])
        )
        .order_by(PlannerTask.due_date.desc())
        .limit(20)
        .all()
    )

    roadmap = (
        db.query(RoleRoadmap)
        .filter(RoleRoadmap.user_id == user.id)
        .first()
    )
    pending_milestones = []
    if roadmap:
        pending_milestones = (
            db.query(RoadmapMilestone)
            .filter(
                RoadmapMilestone.roadmap_id == roadmap.id,
                RoadmapMilestone.status     == "pending",
            )
            .order_by(RoadmapMilestone.priority_order.asc())
            .limit(5)
            .all()
        )

    grad_year = getattr(profile, "graduation_year", None)
    months_to_graduation = None
    if grad_year and str(grad_year).isdigit():
        target_date = date(int(grad_year), 6, 1) # Assume June graduation
        months_to_graduation = max(0, (target_date.year - date.today().year) * 12 + target_date.month - date.today().month)

    resume = (
        db.query(ResumeAnalysis)
        .filter(ResumeAnalysis.user_id == user.id)
        .order_by(ResumeAnalysis.created_at.desc())
        .first()
    )
    resume_context = None
    if resume and resume.feedback:
        resume_context = {
            "ats_score": float(resume.ats_score) if resume.ats_score else None,
            "summary": resume.feedback.get("summary"),
            "strengths": resume.feedback.get("strengths", []),
            "improvements": resume.feedback.get("improvements", []),
        }

    return {
        "profile": {
            "full_name": profile.full_name if profile else user.full_name,
            "college": getattr(profile, "college_name", None) or "Unknown",
            "specialization": getattr(profile, "specialization", None) or "Unknown",
            "graduation_year": grad_year or "Unknown",
            "target_role": user.target_role or "Software Engineer",
            "target_companies": _decode_companies(user),
            "months_to_graduation": months_to_graduation,
            "preparation_status": getattr(user, "preparation_status", "early"),
        },
        "progress": {
            "readiness_score": float(stats.readiness_score or 0) if stats else 0,
            "planner_completion": float(stats.planner_completion or 0) if stats else 0,
            "dsa_solved": int(stats.dsa_solved or 0) if stats else 0,
        },
        "weak_areas": weak_areas,
        "completed_task_titles": [t.title for t in completed_tasks],
        "next_roadmap_milestones": [
            {"title": m.title, "category": m.category}
            for m in pending_milestones
        ],
        "latest_resume": resume_context,
    }


def build_daily_planner_context(
    db: Session,
    user: User,
    available_minutes: int,
    custom_tasks: list,
) -> dict:
    today = date.today()
    # Compare using UTC-aware noon of today — avoids timezone edge cases where
    # tasks stored at midnight UTC look like they're in the future on UTC+5:30.
    today_utc_end = datetime.combine(today, datetime.max.time(), tzinfo=timezone.utc)
    today_utc_start = datetime.combine(today, datetime.min.time(), tzinfo=timezone.utc)

    active_plan = (
        db.query(WeeklyPlan)
        .filter(WeeklyPlan.user_id == user.id, WeeklyPlan.status == "active")
        .first()
    )

    all_pending = []
    if active_plan:
        all_pending = (
            db.query(PlannerTask)
            .filter(
                PlannerTask.weekly_plan_id == active_plan.id,
                PlannerTask.status == "Pending",
            )
            .order_by(PlannerTask.display_order)
            .all()
        )

    # Include tasks due today OR overdue (due_date <= end of today UTC)
    # A task with no due_date is always included.
    todays_tasks = [
        t for t in all_pending
        if t.due_date is None or t.due_date <= today_utc_end
    ]

    # Fallback: if nothing is due yet, show today's task by display_order position.
    # Use the weekday index (0=Mon…6=Sun) to pick the right task for today.
    if not todays_tasks and all_pending:
        weekday = today.weekday()  # 0=Monday, 4=Friday
        idx = min(weekday, len(all_pending) - 1)
        todays_tasks = [all_pending[idx]]

    # Recent completion rate over the last 7 days
    week_ago_dt = datetime.combine(today - timedelta(days=7), datetime.min.time(), tzinfo=timezone.utc)
    recent_tasks = (
        db.query(PlannerTask)
        .filter(
            PlannerTask.user_id == user.id,
            PlannerTask.due_date >= week_ago_dt,
        )
        .all()
    )
    total_recent = len(recent_tasks)
    done_recent = sum(1 for t in recent_tasks if t.status == "Completed")
    completion_pct = round((done_recent / total_recent * 100), 1) if total_recent else 0

    return {
        "available_minutes": available_minutes,
        "todays_pending_tasks": [
            {
                "id": t.id,
                "title": t.title,
                "category": t.category,
                "priority": t.priority,
                "estimated_minutes": t.estimated_minutes or 45,
            }
            for t in todays_tasks
        ],
        "custom_tasks": custom_tasks,
        "recent_completion_rate": completion_pct,
        "target_role": user.target_role or "Software Engineer",
    }


# ---------------------------------------------------------------------------
# Mentor context
# ---------------------------------------------------------------------------

TONE_INSTRUCTIONS = {
    "firm_accountability": (
        "The student is slightly behind on their plan. Be encouraging and supportive. "
        "Acknowledge the situation gently, but focus entirely on helping them learn and catch up. "
        "Act as a patient teacher who provides clear, easy-to-understand explanations and actionable advice."
    ),
    "encouraging": (
        "The student is on track. Be warm, celebrate their progress, "
        "and act as an inspiring teacher who helps them push toward the next milestone with clear explanations."
    ),
    "balanced": (
        "Give balanced, constructive guidance. Act as a patient teacher, acknowledging progress "
        "while providing clear, easy-to-understand explanations for any concepts they ask about."
    ),
}


def _build_progress_snapshot(db: Session, user: User) -> str:
    """
    Builds a compact, pre-computed progress summary for the AI mentor prompt.
    All analytics are done here in Python — the AI only receives the final sentences.
    Returns an empty string gracefully if the user has no data yet.
    """
    lines = []

    # --- Roadmap: milestone count + staleness (uses created_at as proxy since no updated_at) ---
    try:
        roadmap = db.query(RoleRoadmap).filter(RoleRoadmap.user_id == user.id).first()
        if roadmap and roadmap.milestones:
            total = len(roadmap.milestones)
            done = sum(1 for m in roadmap.milestones if m.status == "completed")
            in_prog = next(
                (m for m in sorted(roadmap.milestones, key=lambda x: x.priority_order)
                 if m.status == "in_progress"), None
            )
            line = f"Roadmap: {done}/{total} milestones done."
            if in_prog:
                days_on = (date.today() - in_prog.created_at.date()).days
                note = f" Stuck on '{in_prog.title}' for {days_on}d." if days_on > 10 else f" Working on '{in_prog.title}'."
                line += note
            elif done < total:
                # find next pending
                next_pending = next(
                    (m for m in sorted(roadmap.milestones, key=lambda x: x.priority_order)
                     if m.status == "pending"), None
                )
                if next_pending:
                    line += f" Next: '{next_pending.title}'."
            lines.append(line)
    except Exception:
        pass  # Never break the mentor chat due to roadmap query

    # --- Weekly plan: task completion and overdue ---
    try:
        active_plan = (
            db.query(WeeklyPlan)
            .filter(WeeklyPlan.user_id == user.id, WeeklyPlan.status == "active")
            .first()
        )
        if active_plan and active_plan.tasks:
            tasks = active_plan.tasks
            done_count = sum(1 for t in tasks if t.status == "Completed")
            overdue = [
                t.title for t in tasks
                if t.status != "Completed" and t.due_date and
                t.due_date.date() < date.today()
            ]
            line = f"This week: {done_count}/{len(tasks)} tasks done."
            if overdue:
                line += f" Overdue: '{', '.join(overdue[:2])}'."
            lines.append(line)
    except Exception:
        pass

    # --- Recently taught topics (from MentorConversation state — no new table) ---
    try:
        cutoff = datetime.combine(date.today() - timedelta(days=14), datetime.min.time(), tzinfo=timezone.utc)
        recent_convos = (
            db.query(MentorConversation.active_topic)
            .filter(
                MentorConversation.user_id == user.id,
                MentorConversation.agent_mode == "teacher",
                MentorConversation.active_topic.isnot(None),
                MentorConversation.updated_at >= cutoff,
            )
            .distinct()
            .limit(4)
            .all()
        )
        if recent_convos:
            topics = ", ".join(r[0] for r in recent_convos)
            lines.append(f"Recently learned (Teacher): {topics}.")
    except Exception:
        pass

    # --- Skill momentum: strongest skill + stagnant skills (confidence still at default 25) ---
    try:
        all_assessments = (
            db.query(UserSkillAssessment)
            .filter(UserSkillAssessment.user_id == user.id)
            .all()
        )
        if all_assessments:
            stagnant = [
                a.skill_key.replace("_", " ").title()
                for a in all_assessments if a.self_rated_confidence <= 25
            ][:2]
            improved = sorted(
                [a for a in all_assessments if a.self_rated_confidence > 60],
                key=lambda x: -x.self_rated_confidence
            )
            momentum_parts = []
            if improved:
                top = improved[0]
                momentum_parts.append(f"{top.skill_key.replace('_', ' ').title()} is strong.")
            if stagnant:
                momentum_parts.append(f"{', '.join(stagnant)} may need attention.")
            if momentum_parts:
                lines.append("Skill momentum: " + " ".join(momentum_parts))
    except Exception:
        pass

    return "\n".join(f"- {l}" for l in lines)


def build_mentor_context(db: Session, user: User) -> dict:
    """Full motivational context. Cached at mentor:context:{user_id} TTL 5 min."""
    cache_key = f"mentor:context:{user.id}"
    cached = get_cache(cache_key)
    if cached:
        return cached


    profile = user.profile
    stats = (
        db.query(DashboardStatistics)
        .filter(DashboardStatistics.user_id == user.id)
        .first()
    )

    active_plan = (
        db.query(WeeklyPlan)
        .filter(WeeklyPlan.user_id == user.id, WeeklyPlan.status == "active")
        .first()
    )

    today = date.today()
    overdue_tasks = (
        db.query(PlannerTask.title)
        .filter(
            PlannerTask.user_id == user.id,
            PlannerTask.status != "Completed",
            cast(PlannerTask.due_date, Date) < today,
        )
        .limit(5)
        .all()
    )

    role = user.target_role or "Software Engineer"
    key_to_label = get_key_to_label(role)

    weak = (
        db.query(UserSkillAssessment)
        .filter(
            UserSkillAssessment.user_id == user.id,
            UserSkillAssessment.role == role,
        )
        .order_by(UserSkillAssessment.self_rated_confidence.asc())
        .limit(5)
        .all()
    )
    weak_areas = [key_to_label.get(a.skill_key, a.skill_key.replace("_", " ").title()) for a in weak]

    # Build full skill profile grouped by category for rich AI context
    all_assessments = (
        db.query(UserSkillAssessment)
        .filter(
            UserSkillAssessment.user_id == user.id,
            UserSkillAssessment.role == role,
        )
        .all()
    )
    confidence_map = {row.skill_key: int(row.self_rated_confidence) for row in all_assessments}

    skill_profile: dict[str, dict[str, int]] = {}
    for category_name, skills in ROLE_ASSESSMENT_SKILLS.get(role, {}).items():
        skill_profile[category_name] = {
            s["label"]: confidence_map.get(s["key"], 25)
            for s in skills
        }

    strong_areas = [
        key_to_label.get(a.skill_key, a.skill_key.replace("_", " ").title())
        for a in all_assessments if a.self_rated_confidence >= 75
    ]

    from app.models.hub_progress import UserCodingProgress
    solve_dates_rows = (
        db.query(cast(UserCodingProgress.created_at, Date))
        .filter(
            UserCodingProgress.user_id == user.id,
            UserCodingProgress.status == "solved",
        )
        .distinct()
        .order_by(cast(UserCodingProgress.created_at, Date).desc())
        .limit(30)
        .all()
    )
    solve_dates = sorted({r[0] for r in solve_dates_rows}, reverse=True)
    streak, expected = 0, today
    for d in solve_dates:
        if d == expected or d == expected - timedelta(days=1):
            streak += 1
            expected = d - timedelta(days=1)
        else:
            break

    plan_completion = float(active_plan.completion_percentage or 0) if active_plan else 0
    if plan_completion < 40:
        tone = "firm_accountability"
    elif plan_completion >= 70:
        tone = "encouraging"
    else:
        tone = "balanced"

    target_companies = []
    if user.target_companies:
        try:
            target_companies = json.loads(user.target_companies)
        except json.JSONDecodeError:
            pass

    resume = (
        db.query(ResumeAnalysis)
        .filter(ResumeAnalysis.user_id == user.id)
        .order_by(ResumeAnalysis.created_at.desc())
        .first()
    )
    resume_context = None
    if resume and resume.feedback:
        resume_context = {
            "ats_score": float(resume.ats_score) if resume.ats_score else None,
            "summary": resume.feedback.get("summary"),
            "strengths": resume.feedback.get("strengths", []),
            "improvements": resume.feedback.get("improvements", []),
        }

    # Roadmap context — what is the student actively working toward?
    roadmap = (
        db.query(RoleRoadmap)
        .filter(RoleRoadmap.user_id == user.id)
        .first()
    )
    roadmap_ctx = {"role": None, "next_milestone": None, "completed": 0, "total": 0}
    if roadmap:
        milestones = roadmap.milestones
        total = len(milestones)
        completed = sum(1 for m in milestones if m.status == "completed")
        first_pending = next(
            (m for m in sorted(milestones, key=lambda x: x.priority_order) if m.status == "pending"),
            None,
        )
        roadmap_ctx = {
            "role":           roadmap.role,
            "next_milestone": {"title": first_pending.title, "category": first_pending.category} if first_pending else None,
            "completed":      completed,
            "total":          total,
        }

    ctx = {
        "profile": {
            "full_name":        profile.full_name if profile else user.full_name,
            "target_role":      role,
            "target_companies": target_companies,
        },
        "progress": {
            "readiness_score":    float(stats.readiness_score or 0) if stats else 0,
            "dsa_solved":         int(stats.dsa_solved or 0) if stats else 0,
            "planner_completion": plan_completion,
            "active_plan_title":  active_plan.title if active_plan else None,
            "streak_days":        streak,
        },
        "accountability": {
            "overdue_tasks":    [r[0] for r in overdue_tasks],
            "weak_areas":       weak_areas,
            "strong_areas":     strong_areas,
            "skill_profile":    skill_profile,
            "tone":             tone,
            "tone_instruction": TONE_INSTRUCTIONS.get(tone, ""),
        },
        "roadmap": roadmap_ctx,
        "latest_resume": resume_context,
        # Pre-computed compact summary for the AI prompt — keeps token count low
        "progress_snapshot": _build_progress_snapshot(db, user),
    }
    set_cache(cache_key, ctx, 300)
    return ctx


# ---------------------------------------------------------------------------
# Teacher context
# ---------------------------------------------------------------------------

def build_teacher_context(db: Session, user: User, topic: str | None) -> dict:
    """Fetches context for a teaching session. Interview questions cached 12 hr shared."""
    from app.models.hub import InterviewQuestion, DSAProblem

    topic = topic or "General"
    topic_hash = hashlib.md5(topic.lower().strip().encode()).hexdigest()

    q_cache_key = f"teacher:questions:{topic_hash}"
    cached_qs = get_cache(q_cache_key)

    if cached_qs:
        interview_qs = cached_qs
    else:
        iq_rows = (
            db.query(InterviewQuestion.title, InterviewQuestion.body, InterviewQuestion.difficulty)
            .filter(InterviewQuestion.skill.ilike(f"%{topic}%"))
            .order_by(InterviewQuestion.difficulty.asc())
            .limit(3)
            .all()
        )
        interview_qs = [
            {"title": r.title, "body": r.body, "difficulty": r.difficulty}
            for r in iq_rows
        ]
        set_cache(q_cache_key, interview_qs, 43200)  # 12 hr

    role = user.target_role or "Software Engineer"

    # Find exact skill key and category from taxonomy (more reliable than ilike fuzzy match)
    topic_lower = topic.lower().strip()
    matched_key: str | None = None
    matched_category: str | None = None
    for category_name, skills in ROLE_ASSESSMENT_SKILLS.get(role, {}).items():
        for s in skills:
            if s["label"].lower() == topic_lower or s["key"] == topic_lower.replace(" ", "_"):
                matched_key = s["key"]
                matched_category = category_name
                break
        if matched_key:
            break

    # Get the student's confidence for this exact skill
    if matched_key:
        assessment = (
            db.query(UserSkillAssessment)
            .filter(
                UserSkillAssessment.user_id == user.id,
                UserSkillAssessment.role == role,
                UserSkillAssessment.skill_key == matched_key,
            )
            .first()
        )
    else:
        # Fallback: fuzzy match
        assessment = (
            db.query(UserSkillAssessment)
            .filter(
                UserSkillAssessment.user_id == user.id,
                UserSkillAssessment.skill_key.ilike(f"%{topic_lower.replace(' ', '_')}%"),
            )
            .first()
        )

    if assessment:
        confidence = assessment.self_rated_confidence
        proficiency = "beginner" if confidence < 40 else "intermediate" if confidence < 70 else "advanced"
    else:
        proficiency = "beginner"
        confidence = 25

    # Related skills in the same category with their confidence
    related_skills: dict[str, int] = {}
    if matched_category:
        category_skills = get_skills_in_category(role, matched_category)
        confidence_map_rows = (
            db.query(UserSkillAssessment)
            .filter(
                UserSkillAssessment.user_id == user.id,
                UserSkillAssessment.role == role,
                UserSkillAssessment.category == matched_category,
            )
            .all()
        )
        cat_confidence_map = {row.skill_key: int(row.self_rated_confidence) for row in confidence_map_rows}
        for s in category_skills:
            if s["key"] != matched_key:  # exclude the topic itself
                related_skills[s["label"]] = cat_confidence_map.get(s["key"], 25)

    dsa_problems = []
    algorithmic_keywords = {
        "array", "tree", "graph", "dp", "dynamic programming",
        "sorting", "searching", "recursion", "backtracking",
        "linked list", "stack", "queue", "heap", "hash",
    }
    if any(kw in topic_lower for kw in algorithmic_keywords):
        dsa_rows = (
            db.query(DSAProblem.title, DSAProblem.difficulty, DSAProblem.frontend_id)
            .filter(DSAProblem.topic_tags.contains([topic]))
            .order_by(DSAProblem.acRate.desc())
            .limit(2)
            .all()
        )
        dsa_problems = [
            {"title": r.title, "difficulty": r.difficulty, "id": r.frontend_id}
            for r in dsa_rows
        ]

    return {
        "topic": topic,
        "student_proficiency": proficiency,
        "student_confidence": confidence,
        "target_role": role,
        "skill_category": matched_category,
        "related_skills_in_category": related_skills,
        "example_interview_questions": interview_qs,
        "related_dsa_problems": dsa_problems,
    }
