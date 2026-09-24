from pydantic import BaseModel

class RoadmapMilestone(BaseModel):
    title: str
    description: str
    category: str
    priority_order: int

class WeeklyTask(BaseModel):
    title: str
    category: str
    estimated_hours: int

class DailyTask(BaseModel):
    title: str
    category: str
    estimated_minutes: int
    status: str = "Pending"
    source: str = "ai_daily_breakdown"
