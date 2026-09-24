import logging
from typing import List
from app.ai.gateway import ai_gateway
from app.prompts.roadmap.roadmap_prompts import build_roadmap_prompt, build_weekly_prompt, build_daily_prompt
from app.services.roadmap.schemas import RoadmapMilestone, WeeklyTask, DailyTask

logger = logging.getLogger("placementos.roadmap.service")

async def generate_role_roadmap_async(
    target_role: str,
    prep_stage: str,
    weak_areas: list[str],
) -> List[RoadmapMilestone]:
    prompt = build_roadmap_prompt(target_role, prep_stage, weak_areas)
    # Wrap in a list model for Pydantic v2 validation via Gateway (or just validate inside service if Gateway only supports objects)
    # We'll just let Gateway return text and parse it here since Gateway's T is for BaseModel, not List[BaseModel].
    # Actually, Gateway can return text if no schema is passed.
    try:
        import json
        text = await ai_gateway.generate(
            task="roadmap_generation",
            prompt=prompt,
            timeout=60.0
        )
        data = json.loads(text)
        return [RoadmapMilestone(**item) for item in data]
    except Exception as e:
        logger.error(f"Failed to generate roadmap: {e}")
        return []

async def generate_weekly_tasks_async(
    active_milestone: str,
    available_hours: int,
    new_count: int,
) -> List[WeeklyTask]:
    prompt = build_weekly_prompt(active_milestone, available_hours, new_count)
    try:
        import json
        text = await ai_gateway.generate(
            task="weekly_planner",
            prompt=prompt,
            timeout=15.0
        )
        data = json.loads(text)
        return [WeeklyTask(**item) for item in data]
    except Exception as e:
        logger.error(f"Failed to generate weekly tasks: {e}")
        return []

async def generate_daily_breakdown_async(
    task_titles: list[str],
    available_minutes: int
) -> List[DailyTask]:
    prompt = build_daily_prompt(task_titles, available_minutes)
    try:
        import json
        text = await ai_gateway.generate(
            task="daily_breakdown",
            prompt=prompt,
            timeout=45.0
        )
        data = json.loads(text)
        return [DailyTask(**item) for item in data]
    except Exception as e:
        logger.error(f"Failed to generate daily breakdown: {e}")
        return []
