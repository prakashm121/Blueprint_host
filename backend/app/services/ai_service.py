"""
ai_service.py â€” All Gemini AI interactions.
Each function targets a specific feature: mentor chat, weekly task generation, daily breakdown, and role roadmap.
"""
import asyncio
import json
import re

from google import genai
from pydantic import BaseModel
from typing import List

from app.core.config import settings
from app.ai.gateway import ai_gateway
from app.core.constants import ALLOWED_TASKS
from app.prompts.teacher import get_teacher_prompt
from app.prompts.mentor import get_mentor_prompt


class MilestoneSchema(BaseModel):
    title: str
    description: str
    category: str
    priority_order: int

# Single model instance reused across all features


# Limits concurrent Gemini calls per process to protect latency
async def generate_teacher_response_async(
    context: dict,
    topic: str,
    message: str,
    history: list[dict],
) -> str:
    timeout_s = float(getattr(settings, "GEMINI_REQUEST_TIMEOUT", 45.0))
    prompt = get_teacher_prompt(context, topic)
    
    for turn in history[-6:]:
        role = turn["role"].capitalize()
        prompt += f"\n{role}: {turn['content']}"

    prompt += f"\n\nUser:\n{message}\n\nGive a personalized answer. Keep it practical and highly educational. Answer in 2-4 short paragraphs."
    return await ai_gateway.generate(
        task="text_generation",
        prompt=prompt,
        timeout=timeout_s
    )


async def generate_mentor_response_async(
    context: dict,
    message: str,
    history: list[dict],
) -> str:
    timeout_s = float(getattr(settings, "GEMINI_REQUEST_TIMEOUT", 45.0))
    prompt = get_mentor_prompt(context)
    
    for turn in history[-6:]:
        role = turn["role"].capitalize()
        prompt += f"\n{role}: {turn['content']}"

    prompt += f"\n\nUser:\n{message}\n\nGive a personalized answer. Answer in 2-4 short paragraphs."
    return await ai_gateway.generate(
        task="text_generation",
        prompt=prompt,
        timeout=timeout_s
    )


def detect_teacher_task(msg: str) -> str:
    msg = msg.lower().strip()

    if any(x in msg for x in [
        "deep dive",
        "deep dive into",
        "in detail",
        "deeply"
    ]):
        return "deep_dive"

    if any(x in msg for x in [
        "give an example",
        "give examples",
        "example",
        "examples"
    ]):
        return "example"

    if any(x in msg for x in [
        "compare",
        "difference between",
        "difference",
        " vs ",
        "versus"
    ]):
        return "compare"

    if any(x in msg for x in [
        "quiz me",
        "test me",
        "ask me questions"
    ]):
        return "quiz"

    if any(x in msg for x in [
        "practice",
        "practice questions",
        "give me problems",
        "give me questions"
    ]):
        return "practice"

    return "explain"

def detect_mentor_task(msg: str) -> str:
    if "what should i learn" in msg: return "roadmap"
    if "career" in msg: return "career_advice"
    if "weak" in msg or "skill gap" in msg: return "skill_gap"
    if "interview" in msg: return "interview_prep"
    return "general"
    
def get_mentor_score(msg: str) -> int:
    mentor_score = 0
    if "what should i learn" in msg: mentor_score += 3
    if "next" in msg: mentor_score += 2
    if "career" in msg: mentor_score += 3
    if "roadmap" in msg: mentor_score += 3
    if "prepare for" in msg: mentor_score += 2
    if "placement" in msg: mentor_score += 2
    return mentor_score


async def resolve_conversation_state_async(
    current_mode: str | None,
    current_topic: str | None,
    current_task: str,
    message: str,
    history: list[dict]
) -> dict:

    msg_lower = message.lower().strip()

    # ---------------------------------------------------------
    # 1. Explicit agent switches always have highest priority
    # ---------------------------------------------------------

    if (
        "switch to mentor" in msg_lower
        or "act as a mentor" in msg_lower
        or "be my mentor" in msg_lower
    ):
        return {
            "action": "switch_to_mentor",
            "mode": "mentor",
            "topic": None,
            "task": "general"
        }

    if (
        "switch to teacher" in msg_lower
        or "act as a teacher" in msg_lower
        or "be my teacher" in msg_lower
    ):
        return {
            "action": "switch_to_teacher",
            "mode": "teacher",
            "topic": current_topic,
            "task": "explain"
        }

    # ---------------------------------------------------------
    # 2. Explicit Teacher intent
    #    MUST override the current conversation mode
    # ---------------------------------------------------------

    teacher_patterns = [
        r"\bteach me(?: about| on)?\s+(.+)",
        r"\bteach\s+(?:me\s+)?(?:about|on)?\s*(.+)",
        r"\bexplain(?: to me)?\s+(.+)",
        r"\bhelp me understand\s+(.+)",
        r"\bwalk me through\s+(.+)",
        r"\blearn about\s+(.+)",
        r"\bwhat is\s+(.+)",
        r"\bhow does\s+(.+?)\s+work\b",
        r"\bhow do\s+(.+?)\s+work\b",
    ]

    for pattern in teacher_patterns:
        match = re.search(pattern, msg_lower)

        if match:
            topic = match.group(1).strip()

            # Remove common trailing conversational words
            topic = re.sub(
                r"\b(please|properly|in detail|from scratch)\b$",
                "",
                topic
            ).strip()

            return {
                "action": "switch_to_teacher",
                "mode": "teacher",
                "topic": topic[:100],
                "task": detect_teacher_task(msg_lower)
            }

    # ---------------------------------------------------------
    # 3. Explicit Teacher tasks
    # ---------------------------------------------------------

    teacher_task = detect_teacher_task(msg_lower)

    explicit_teacher_task = (
        teacher_task != "explain"
        and any(
            phrase in msg_lower
            for phrase in [
                "deep dive",
                "in detail",
                "give an example",
                "example",
                "compare",
                "difference between",
                " vs ",
                "quiz me",
                "test me",
                "practice questions",
                "practice"
            ]
        )
    )

    if explicit_teacher_task:
        return {
            "action": "switch_to_teacher",
            "mode": "teacher",
            "topic": current_topic,
            "task": teacher_task
        }

    # ---------------------------------------------------------
    # 4. Existing Teacher conversation
    # ---------------------------------------------------------

    if current_mode == "teacher":

        # Only switch to Mentor when the user clearly asks
        # for mentoring/career/planning guidance.

        if get_mentor_score(msg_lower) >= 3:
            return {
                "action": "switch_to_mentor",
                "mode": "mentor",
                "topic": None,
                "task": detect_mentor_task(msg_lower)
            }

        return {
            "action": "stay",
            "mode": "teacher",
            "topic": current_topic,
            "task": teacher_task
        }

    # ---------------------------------------------------------
    # 5. Existing Mentor conversation
    # ---------------------------------------------------------

    if current_mode == "mentor":
        return {
            "action": "stay",
            "mode": "mentor",
            "topic": None,
            "task": detect_mentor_task(msg_lower)
        }

    # ---------------------------------------------------------
    # 6. New conversation → Gemini router
    # ---------------------------------------------------------

    prompt = f"""
You are a conversation router for an engineering student platform.

There are exactly two agents.

TEACHER:
- Explains technical concepts.
- Teaches DSA, programming, CS subjects and engineering concepts.
- Gives examples.
- Performs deep dives.
- Quizzes the student.
- Helps the student understand a technical topic.

MENTOR:
- Gives career advice.
- Creates learning plans and roadmaps.
- Gives interview preparation strategy.
- Identifies skill gaps.
- Gives placement guidance.

IMPORTANT ROUTING RULES:

1. If the user says "teach", "teach me", "explain",
   "help me understand", "walk me through", or asks
   "what is/how does/how do" about a technical topic,
   choose TEACHER.

2. If the user asks what they should learn next,
   creates a roadmap, asks about career, placements,
   interviews, or skill gaps, choose MENTOR.

3. Do not choose MENTOR merely because the message
   mentions interviews, backend, DSA, or career goals.
   Determine what the user is actually asking for.

4. "Teach me graphs" means TEACHER.

5. "Teach the graphs" means TEACHER.

6. "Explain graphs" means TEACHER.

7. "What should I learn about graphs?" means MENTOR.

8. "Give me a roadmap for graphs" means MENTOR.

User Message:
{message}

Output ONLY a JSON object with this exact schema:

{{
  "action": "switch_to_teacher" | "switch_to_mentor",
  "mode": "teacher" | "mentor",
  "topic": "string or null",
  "task": "general" | "explain" | "deep_dive" | "example" | "compare" | "quiz" | "practice" | "roadmap" | "career_advice" | "skill_gap" | "interview_prep"
}}
"""

    try:
        timeout_s = float(
            getattr(settings, "GEMINI_REQUEST_TIMEOUT", 15.0)
        )
        response_text = await ai_gateway.generate(
            task="json_generation",
            prompt=prompt,
            timeout=timeout_s
        )
        tasks = _parse_gemini_json(response_text)
        if not isinstance(tasks, list):
            raise ValueError("Expected a JSON array of tasks.")
        return tasks[:new_count]
    except Exception as e:
        print(f"Failed to generate weekly tasks: {e}")
        return []

async def generate_daily_breakdown_async(task_titles: list[str], available_minutes: int) -> list[dict]:
    tasks_str = "\n".join(f"- {t}" for t in task_titles)
    prompt = f"""You are an expert AI Career Coach helping a student prepare for placements.

The student has {available_minutes} minutes available today and these tasks planned:
{tasks_str}

Break each task into specific, actionable sub-steps that fit within the available time.

Return ONLY a JSON array. Each object must have exactly these fields:
- "title": string (specific sub-task or step)
- "category": string (match the parent task category)
- "estimated_minutes": integer
- "status": "Pending"
- "source": "ai_daily_breakdown"

Example: [{{"title": "Solve Two Sum on LeetCode", "category": "DSA", "estimated_minutes": 30, "status": "Pending", "source": "ai_daily_breakdown"}}]"""
    try:
        timeout_s = float(getattr(settings, "GEMINI_REQUEST_TIMEOUT", 45.0))
        response_text = await ai_gateway.generate(
            task="json_generation",
            prompt=prompt,
            timeout=timeout_s
        )
        milestones = _parse_gemini_json(response_text)
        if not isinstance(milestones, list):
            raise ValueError("Expected a JSON array of milestones.")
        return milestones[:15]
    except Exception as e:
        print(f"Failed to generate role roadmap: {e}")
        return []






