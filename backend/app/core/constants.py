from typing import Set

ALLOWED_AGENT_MODES: Set[str] = {"teacher", "mentor"}

ALLOWED_TASKS: Set[str] = {
    "general",
    "explain",
    "deep_dive",
    "example",
    "compare",
    "quiz",
    "practice",
    "roadmap",
    "career_advice",
    "skill_gap",
    "interview_prep",
}

ALLOWED_ROUTER_ACTIONS: Set[str] = {
    "stay",
    "switch_to_teacher",
    "switch_to_mentor"
}
