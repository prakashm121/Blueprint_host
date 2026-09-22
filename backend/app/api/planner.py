from datetime import date, timedelta, datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import case
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List

from app.api import deps
from app.core.cache import get_cache, set_cache, delete_cache, redis_client
from app.db.session import get_db
from app.models.user import User
from app.models.planner import WeeklyPlan, PlannerTask
from app.models.assessment import UserSkillAssessment
from app.services.context_builder import build_daily_planner_context, build_weekly_plan_context
from app.services.ai_service import generate_weekly_tasks_async, generate_daily_breakdown_async
from app.workers.outbox import enqueue_outbox
from app.workers import event_types as ET

router = APIRouter()

_HIDDEN = ("Archived", "Deleted")

# Category → skill_key mapping for passive confidence nudge on task completion (Phase 2)
PLANNER_CATEGORY_TO_SKILL_KEY = {
    "OS":                  "operating_systems",
    "Operating Systems":   "operating_systems",
    "DBMS":                "dbms",
    "Database":            "dbms",
    "Networks":            "computer_networks",
    "Computer Networks":   "computer_networks",
    "System Design":       "system_design",
    "OOP":                 "object_oriented_programming",
    "DSA":                 "data_structures",
}

MAX_CARRY_OVER = 3  # Cap: ensures at least 4 fresh AI tasks every week


def _invalidate_planner_cache(user_id: int):
    delete_cache(f"planner:weekly:{user_id}")
    delete_cache(f"planner:daily:{user_id}:{date.today().isoformat()}")


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class DailyPlanRequest(BaseModel):
    available_minutes: int = 120
    custom_tasks: List[str] = []


class TaskResponse(BaseModel):
    id: int
    title: str
    description: Optional[str]
    category: str
    priority: str
    status: str
    estimated_minutes: Optional[int]
    display_order: int

    class Config:
        from_attributes = True


class PlanResponse(BaseModel):
    id: int
    title: str
    description: Optional[str]
    week_number: int
    start_date: date
    end_date: date
    status: str
    completion_percentage: float
    total_tasks: int
    completed_tasks: int
    tasks: List[TaskResponse]

    class Config:
        from_attributes = True


class PlanCreate(BaseModel):
    title: str
    description: Optional[str] = None


class TaskCreate(BaseModel):
    title: str
    description: Optional[str] = None
    category: str = "Custom"
    priority: str = "Medium"
    estimated_minutes: Optional[int] = None


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    priority: Optional[str] = None
    status: Optional[str] = None
    estimated_minutes: Optional[int] = None


# ---------------------------------------------------------------------------
# POST /daily
# ---------------------------------------------------------------------------

@router.post("/daily")
async def get_daily_plan(
    body: DailyPlanRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_active_user),
):
    """Return today's AI daily schedule. Cached until midnight. Max 3 regenerations/day."""
    today_str = date.today().isoformat()
    cache_key = f"planner:daily:{current_user.id}:{today_str}"

    if not body.custom_tasks:
        cached = get_cache(cache_key)
        if cached:
            return cached

    # Rate-limit regenerations only when a successful plan already exists
    if get_cache(cache_key) and redis_client:
        regen_key = f"planner:daily:regen:{current_user.id}:{today_str}"
        count = redis_client.incr(regen_key)
        if count == 1:
            midnight = datetime.combine(date.today() + timedelta(days=1), datetime.min.time())
            redis_client.expire(regen_key, max(int((midnight - datetime.utcnow()).total_seconds()), 1))
        if count > 3:
            raise HTTPException(429, "Daily plan regeneration limit reached. Try again tomorrow.")

    ctx = build_daily_planner_context(db, current_user, body.available_minutes, body.custom_tasks)

    task_titles = body.custom_tasks.copy()
    total_minutes = 0
    skipped = []

    for t in ctx["todays_pending_tasks"]:
        if not task_titles or (total_minutes + t["estimated_minutes"] <= body.available_minutes):
            task_titles.append(t["title"])
            total_minutes += t["estimated_minutes"]
        else:
            skipped.append(t["title"])

    if task_titles:
        schedule = await generate_daily_breakdown_async(task_titles, body.available_minutes)
        if schedule:
            # Assign fake IDs to AI sub-tasks so frontend keys/checkboxes work
            for i, task in enumerate(schedule):
                if "id" not in task:
                    task["id"] = 90000 + i
        if not schedule:
            schedule = [
                {
                    "title": t["title"],
                    "category": t["category"],
                    "estimated_minutes": t["estimated_minutes"],
                    "status": "Pending",
                    "id": t["id"],
                    "source": "fallback",
                }
                for t in ctx["todays_pending_tasks"]
                if t["title"] in task_titles
            ]
    else:
        schedule = []

    result = {
        "daily_plan": schedule,
        "total_minutes": total_minutes,
        "skipped_tasks": skipped,
        "available_minutes": body.available_minutes,
        "recent_completion_rate": ctx["recent_completion_rate"],
    }

    if schedule:
        midnight = datetime.combine(date.today() + timedelta(days=1), datetime.min.time())
        ttl = max(int((midnight - datetime.utcnow()).total_seconds()), 60)
        set_cache(cache_key, result, ttl)

    return result


# ---------------------------------------------------------------------------
# GET /plans
# ---------------------------------------------------------------------------

@router.get("/plans", response_model=Optional[PlanResponse])
def get_active_plan(
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_active_user),
):
    plan = (
        db.query(WeeklyPlan)
        .filter(WeeklyPlan.user_id == current_user.id, WeeklyPlan.status == "active")
        .first()
    )
    if not plan:
        return None
    plan.tasks = [t for t in plan.tasks if t.status not in _HIDDEN]
    return plan


# ---------------------------------------------------------------------------
# POST /plans
# ---------------------------------------------------------------------------

@router.post("/plans", response_model=PlanResponse)
async def create_plan(
    plan_in: PlanCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_active_user),
):
    existing = (
        db.query(WeeklyPlan)
        .filter(WeeklyPlan.user_id == current_user.id, WeeklyPlan.status == "active")
        .first()
    )

    today = date.today()
    iso_cal = today.isocalendar()

    # Create the new plan first so we have plan.id for carry-over FK reassignment
    plan = WeeklyPlan(
        user_id=current_user.id,
        title=plan_in.title or f"Week {iso_cal[1]} Plan",
        description=plan_in.description,
        week_number=iso_cal[1],
        start_date=today,
        end_date=today + timedelta(days=6),
        generation_source="ai",
        status="active",
    )
    db.add(plan)
    db.flush()  # get plan.id before reassigning carry-over task FKs

    # Carry-over fix: MOVE pending rows into the new plan (not copy).
    # Cap at MAX_CARRY_OVER=3 (priority order: High > Medium > Low).
    # Tasks beyond the cap are dropped cleanly — student isn't doing them.
    # Eliminates: dead 'Carried Over' rows, new_count hitting 0, frozen AI output.
    carry_over_count = 0
    if existing:
        pending_tasks = (
            db.query(PlannerTask)
            .filter(
                PlannerTask.weekly_plan_id == existing.id,
                PlannerTask.status == "Pending",
            )
            .order_by(
                case(
                    (PlannerTask.priority == "High",   1),
                    (PlannerTask.priority == "Medium", 2),
                    (PlannerTask.priority == "Low",    3),
                    else_=4,
                )
            )
            .all()
        )

        tasks_to_move = pending_tasks[:MAX_CARRY_OVER]
        tasks_to_drop = pending_tasks[MAX_CARRY_OVER:]

        for i, pt in enumerate(tasks_to_move):
            # Move the row: reassign FK to the new plan, no new row, no dead row
            pt.weekly_plan_id = plan.id
            pt.due_date       = datetime.combine(
                today + timedelta(days=min(i, 6)),
                datetime.min.time(),
                tzinfo=timezone.utc,
            )
            pt.display_order  = i

        for pt in tasks_to_drop:
            # Student isn't completing these — drop cleanly
            existing.total_tasks = max(0, (existing.total_tasks or 0) - 1)
            db.delete(pt)

        carry_over_count = len(tasks_to_move)
        existing.status = "archived"
        db.add(existing)

    new_count = max(0, 7 - carry_over_count)


    ai_tasks = []
    if new_count > 0:
        ctx = build_weekly_plan_context(db, current_user)
        ai_tasks = await generate_weekly_tasks_async(ctx, [], new_count)

    if not ai_tasks and new_count > 0:
        fallback_tasks = [
            {"title": "Review DSA fundamentals", "category": "DSA", "priority": "High", "estimated_minutes": 60},
            {"title": "Update resume with latest project", "category": "Resume", "priority": "Medium", "estimated_minutes": 45},
            {"title": "Practice system design concepts", "category": "Subjects", "priority": "Medium", "estimated_minutes": 50},
            {"title": "Solve 2 LeetCode problems", "category": "DSA", "priority": "High", "estimated_minutes": 90},
            {"title": "Review company preparation notes", "category": "Company Preparation", "priority": "Low", "estimated_minutes": 30},
        ]
        for t in fallback_tasks:
            ai_tasks.append(t)
            if len(ai_tasks) >= new_count:
                break

    # Only insert AI-generated tasks here; carry-over tasks were already moved (FK reassigned above)
    for i, task_data in enumerate(ai_tasks):
        task_due = datetime.combine(
            today + timedelta(days=min(carry_over_count + i, 6)),
            datetime.min.time(),
            tzinfo=timezone.utc,
        )
        db.add(PlannerTask(
            weekly_plan_id=plan.id,
            user_id=current_user.id,
            title=task_data.get("title", "Task")[:200],
            category=task_data.get("category", "General"),
            priority=task_data.get("priority", "Medium"),
            estimated_minutes=task_data.get("estimated_minutes", 30),
            due_date=task_due,
            display_order=carry_over_count + i,
        ))

    plan.total_tasks = carry_over_count + len(ai_tasks)
    db.commit()
    db.refresh(plan)
    _invalidate_planner_cache(current_user.id)
    return plan


# ---------------------------------------------------------------------------
# POST /plans/{plan_id}/tasks
# ---------------------------------------------------------------------------

@router.post("/plans/{plan_id}/tasks", response_model=TaskResponse)
def add_task(
    plan_id: int,
    task_in: TaskCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_active_user),
):
    plan = db.query(WeeklyPlan).filter(
        WeeklyPlan.id == plan_id, WeeklyPlan.user_id == current_user.id
    ).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")

    max_order = (
        db.query(PlannerTask.display_order)
        .filter(PlannerTask.weekly_plan_id == plan_id)
        .order_by(PlannerTask.display_order.desc())
        .first()
    )
    task = PlannerTask(
        weekly_plan_id=plan.id,
        user_id=current_user.id,
        title=task_in.title,
        description=task_in.description,
        category=task_in.category,
        priority=task_in.priority,
        estimated_minutes=task_in.estimated_minutes,
        display_order=(max_order[0] + 1) if max_order else 0,
    )
    db.add(task)
    plan.total_tasks = (plan.total_tasks or 0) + 1
    db.commit()
    db.refresh(task)
    return task


# ---------------------------------------------------------------------------
# PATCH /tasks/{task_id}
# ---------------------------------------------------------------------------

@router.patch("/tasks/{task_id}", response_model=TaskResponse)
def update_task(
    task_id: int,
    task_in: TaskUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_active_user),
):
    task = db.query(PlannerTask).filter(
        PlannerTask.id == task_id, PlannerTask.user_id == current_user.id
    ).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    was_completed = task.status == "Completed"
    for field, value in task_in.model_dump(exclude_unset=True).items():
        setattr(task, field, value)

    now_completed = task.status == "Completed"
    plan = db.query(WeeklyPlan).get(task.weekly_plan_id)
    if plan:
        if not was_completed and now_completed:
            plan.completed_tasks = (plan.completed_tasks or 0) + 1
        elif was_completed and not now_completed:
            plan.completed_tasks = max(0, (plan.completed_tasks or 0) - 1)
        if plan.total_tasks and plan.total_tasks > 0:
            plan.completion_percentage = round(
                (plan.completed_tasks / plan.total_tasks) * 100, 2
            )

    if not was_completed and now_completed:
        enqueue_outbox(
            db,
            ET.PLANNER_TASK_COMPLETED,
            {"user_id": current_user.id, "task_id": task.id},
            idempotency_key=f"planner-completed:{task.id}",
        )

        # Passive confidence nudge — bump the matching skill by +2 (cap 95)
        skill_key = PLANNER_CATEGORY_TO_SKILL_KEY.get(task.category)
        if skill_key:
            assessment = (
                db.query(UserSkillAssessment)
                .filter(
                    UserSkillAssessment.user_id == current_user.id,
                    UserSkillAssessment.skill_key == skill_key,
                )
                .first()
            )
            if assessment:
                assessment.self_rated_confidence = min(95, assessment.self_rated_confidence + 2)

    db.commit()
    db.refresh(task)
    _invalidate_planner_cache(current_user.id)
    delete_cache(f"mentor:context:{current_user.id}")
    return task



# ---------------------------------------------------------------------------
# DELETE /tasks/{task_id}
# ---------------------------------------------------------------------------

@router.delete("/tasks/{task_id}")
def delete_task(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_active_user),
):
    task = db.query(PlannerTask).filter(
        PlannerTask.id == task_id, PlannerTask.user_id == current_user.id
    ).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    was_completed = task.status == "Completed"
    # Completed -> Archived (AI remembers it); Pending -> Deleted (forgotten).
    task.status = "Archived" if was_completed else "Deleted"

    plan = db.query(WeeklyPlan).get(task.weekly_plan_id)
    if plan:
        plan.total_tasks = max(0, (plan.total_tasks or 0) - 1)
        if was_completed:
            plan.completed_tasks = max(0, (plan.completed_tasks or 0) - 1)
        plan.completion_percentage = (
            round((plan.completed_tasks / plan.total_tasks) * 100, 2)
            if plan.total_tasks > 0 else 0
        )

    db.commit()
    _invalidate_planner_cache(current_user.id)
    return {"ok": True}
