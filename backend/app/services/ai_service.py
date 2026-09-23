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
from app.core.constants import ALLOWED_TASKS
from app.prompts.teacher import get_teacher_prompt
from app.prompts.mentor import get_mentor_prompt


class MilestoneSchema(BaseModel):
    title: str
    description: str
    category: str
    priority_order: int

client = genai.Client(api_key=settings.GEMINI_API_KEY)

# Single model instance reused across all features


# Limits concurrent Gemini calls per process to protect latency
_GEMINI_SEMAPHORE = asyncio.Semaphore(int(getattr(settings, "GEMINI_CONCURRENCY", 10)))


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
    
    async with _GEMINI_SEMAPHORE:
        response = await asyncio.wait_for(
            asyncio.to_thread(
                client.models.generate_content,
                model=settings.GEMINI_MODEL,
                contents=prompt,
                config=genai.types.GenerateContentConfig(
                    temperature=settings.GEMINI_TEMPERATURE,
                    top_p=settings.GEMINI_TOP_P,
                    top_k=settings.GEMINI_TOP_K,
                    max_output_tokens=settings.GEMINI_MAX_TOKENS,
                ),
            ),
            timeout=timeout_s,
        )
    return response.text.strip()


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
    
    async with _GEMINI_SEMAPHORE:
        response = await asyncio.wait_for(
            asyncio.to_thread(
                client.models.generate_content,
                model=settings.GEMINI_MODEL,
                contents=prompt,
                config=genai.types.GenerateContentConfig(
                    temperature=settings.GEMINI_TEMPERATURE,
                    top_p=settings.GEMINI_TOP_P,
                    top_k=settings.GEMINI_TOP_K,
                    max_output_tokens=settings.GEMINI_MAX_TOKENS,
                ),
            ),
            timeout=timeout_s,
        )
    return response.text.strip()


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

        async with _GEMINI_SEMAPHORE:
            response = await asyncio.wait_for(
                asyncio.to_thread(
                    client.models.generate_content,
                    model=settings.GEMINI_MODEL,
                    contents=prompt,
                    config=genai.types.GenerateContentConfig(
                        response_mime_type="application/json"
                    ),
                ),
                timeout=timeout_s,
            )

        state = _parse_gemini_json(response.text)

        if state.get("mode") not in ["teacher", "mentor"]:
            state["mode"] = "mentor"

        if state.get("task") not in ALLOWED_TASKS:
            state["task"] = "general"

        if state.get("action") not in [
            "stay",
            "switch_to_teacher",
            "switch_to_mentor"
        ]:
            state["action"] = (
                "switch_to_teacher"
                if state["mode"] == "teacher"
                else "switch_to_mentor"
            )

        return state

    except Exception as e:
        print(f"Router failed: {e}. Falling back to mentor state.")

        return {
            "action": "switch_to_mentor",
            "mode": "mentor",
            "topic": None,
            "task": "general"
        }


def _parse_gemini_json(text: str) -> any:
    """Strip markdown code fences from Gemini JSON responses, then parse."""
    text = text.strip()
    if text.startswith("```json"):
        text = text[7:]
    if text.startswith("```"):
        text = text[3:]
    if text.endswith("```"):
        text = text[:-3]
    return json.loads(text)


async def generate_weekly_tasks_async(
    ctx: dict,
    carry_over_titles: list[str],
    new_count: int,
) -> list[dict]:
    """
    Generate new weekly tasks using the AI.

    Args:
        ctx: Pre-built context from build_weekly_plan_context() â€” includes
             profile, progress (readiness, planner completion, dsa solved),
             weak_areas, and completed_task_titles.
        carry_over_titles: Task titles being carried over from last week.
        new_count: How many new tasks to generate.
    """
    profile   = ctx.get("profile", {})
    progress  = ctx.get("progress", {})
    weak_areas = ctx.get("weak_areas", [])
    done_titles = ctx.get("completed_task_titles", [])
    roadmap_milestones = ctx.get("next_roadmap_milestones", [])

    target_role          = profile.get("target_role", "Software Engineer")
    target_companies     = ", ".join(profile.get("target_companies", [])) or "Not specified"
    college              = profile.get("college", "Unknown")
    specialization       = profile.get("specialization", "Unknown")
    grad_year            = profile.get("graduation_year", "Unknown")
    preparation_status   = profile.get("preparation_status", "early")
    months_to_graduation = profile.get("months_to_graduation", None)

    readiness     = progress.get("readiness_score", 0)
    plan_done_pct = progress.get("planner_completion", 0)
    dsa_solved    = progress.get("dsa_solved", 0)

    completed_str = "\n".join(f"- {t}" for t in done_titles) if done_titles else "None yet"
    carry_str     = "\n".join(f"- {t}" for t in carry_over_titles) if carry_over_titles else "None"
    weak_str      = ", ".join(weak_areas) if weak_areas else "None identified"
    milestone_str = "\n".join(f"- {m['title']} ({m['category']})" for m in roadmap_milestones) if roadmap_milestones else "No roadmap yet â€” generate tasks across DSA, Subjects, Resume."

    urgency = ""
    if months_to_graduation is not None:
        if months_to_graduation <= 3:
            urgency = f"URGENT: Only {months_to_graduation} month(s) to graduation. Prioritize mock interviews, resume, and company-specific prep."
        elif months_to_graduation <= 6:
            urgency = f"Final stretch: {months_to_graduation} months to graduation. Focus on completing weak areas and increasing DSA solve count."
        else:
            urgency = f"{months_to_graduation} months to graduation (stage: {preparation_status}). Build strong fundamentals first."

    prompt = f"""You are an expert AI Career Coach.

## Student Profile
- Target Role: {target_role}
- Target Companies: {target_companies}
- College: {college} | {specialization} | Graduation: {grad_year}

## Time Context
{urgency}

## Current Progress
- Readiness Score: {readiness:.0f}/100
- Last week planner completion: {plan_done_pct:.0f}%
- DSA problems solved: {dsa_solved}

## Roadmap â€” Next Milestones to Work Toward
{milestone_str}

## Task History
### Carrying over from last week (DO NOT duplicate):
{carry_str}

### Already completed in past weeks (DO NOT repeat these topics):
{completed_str}

### Weak areas to prioritize:
{weak_str}

## Instructions
Generate exactly {new_count} NEW tasks for this week that:
1. Directly advance one or more of the roadmap milestones listed above.
2. Do NOT repeat any carried-over or already-completed topics.
3. Prioritize weak areas and time-sensitive milestones given the urgency context.
4. Are specific and actionable â€” not generic.
5. Are relevant to the target role: {target_role}.

Return a JSON array of exactly {new_count} objects:
[
  {{
    "title": "Specific actionable task title",
    "category": "DSA",
    "priority": "High",
    "estimated_minutes": 60
  }}
]

Category must be one of: DSA, Subjects, Resume, Projects, Company Preparation, Mock Interview, Custom.
priority must be one of: High, Medium, Low.
"""
    try:
        timeout_s = float(getattr(settings, "GEMINI_REQUEST_TIMEOUT", 45.0))
        async with _GEMINI_SEMAPHORE:
            response = await asyncio.wait_for(
                asyncio.to_thread(
                    client.models.generate_content,
                    model=settings.GEMINI_MODEL,
                    contents=prompt,
                    config=genai.types.GenerateContentConfig(response_mime_type="application/json"),
                ),
                timeout=timeout_s,
            )
        tasks = _parse_gemini_json(response.text)
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
        async with _GEMINI_SEMAPHORE:
            response = await asyncio.wait_for(
                asyncio.to_thread(
                    client.models.generate_content,
                    model=settings.GEMINI_MODEL,
                    contents=prompt,
                    config=genai.types.GenerateContentConfig(temperature=0.7),
                ),
                timeout=timeout_s,
            )
        schedule = _parse_gemini_json(response.text)
        if not isinstance(schedule, list):
            raise ValueError("Expected a JSON array for daily schedule.")
        return schedule
    except Exception as e:
        print(f"Failed to generate daily breakdown: {e}")
        return []

async def generate_role_roadmap_async(
    target_role: str,
    weak_areas: list[str],
    target_companies: list[str],
    preparation_status: str = "early",
) -> list[dict]:
    """
    Generate a flat list of 10â€“15 placement milestones for the given role.
    Weak areas are surfaced earlier in priority order.
    Returns [] on any failure so the caller can use the hardcoded fallback.
    """
    weak_str = ", ".join(weak_areas) if weak_areas else "None identified"
    companies_str = ", ".join(target_companies) if target_companies else "Top product companies"

    stage_context = {
        "not_started":    "The student is just beginning â€” prioritize DSA foundations and core subjects.",
        "early":          "The student has started preparation â€” build breadth across DSA and subjects.",
        "mid":            "The student is mid-preparation â€” shift toward system design, projects, and interview practice.",
        "final_stretch":  "The student is in the final stretch â€” focus on mock interviews, company-specific prep, and resume polish.",
    }.get(preparation_status, "Build strong fundamentals first.")

    prompt = f"""You are an expert AI Career Coach and Engineering Interview Preparation Planner.

Your task is to generate a personalized, role-specific placement preparation roadmap for an engineering student.

## Student Context

Target Role:
{target_role}

Target Companies:
{companies_str}

Preparation Stage:
{preparation_status}

Stage Guidance:
{stage_context}

Weak Areas:
{weak_str}

## Your Objective

Create a practical roadmap that takes the student from their current preparation stage to being interview-ready for the target role.

The roadmap must be specifically designed around the requirements of:

1. The target role
2. The target companies
3. The student's preparation stage
4. The student's weak areas

Do NOT generate a generic software-engineering roadmap.

Before generating the milestones, internally determine:

* The most important skills required for the target role.
* The skills most commonly evaluated in interviews for this role.
* Which skills are prerequisites for other skills.
* Which of those skills are currently represented by the student's weak areas.
* Which projects would provide strong evidence of competence for this role.
* Which system-design concepts are appropriate for the student's level.
* Which company-specific topics should be prepared later.

Do this reasoning internally. Do not include the reasoning in the output.

## Roadmap Requirements

Generate exactly 10â€“15 milestones.

Each milestone must:

* Be concrete and actionable.
* Take approximately 1â€“3 weeks to complete.
* Produce a meaningful outcome.
* Have a clear relationship to the target role.
* Avoid duplicating another milestone.
* Build upon previously completed milestones where appropriate.
* Be realistic for an engineering student preparing for placements.

The roadmap should progress approximately as:

Foundations â†’ Role Skills â†’ Practical Implementation â†’ Projects/System Design â†’ Interview Preparation â†’ Company Preparation â†’ Mock Interviews

However, change this ordering when the student's preparation stage or weak areas require it.

## Weak Area Prioritization

Weak areas are high priority.

If a weak area is relevant to the target role:

* Address it early in the roadmap.
* Give it sufficient depth.
* Do not simply mention the topic.
* Convert it into a measurable preparation milestone.

However, do not force an unrelated weak area into the roadmap merely because it was provided.

## Category Constraints

Allowed categories:

* DSA
* Subjects
* System Design
* Resume
* Projects
* Company Preparation
* Mock Interview

Maximum DSA milestones: 3

At least 5 milestones must focus directly on role-specific skills, tools, frameworks, architectures, or engineering practices.

For example, for a Backend Engineer, role-specific milestones may include:

* REST API design
* Authentication and authorization
* PostgreSQL/database optimization
* ORM usage
* Redis/caching
* Message queues
* Background jobs
* Distributed systems
* API scalability
* Observability
* Docker/deployment
* Backend architecture

Do NOT blindly use these examples for every role.

First determine the actual technical requirements of {target_role}, then select the most relevant skills.

## Role-Specificity Rule

Every milestone should answer:

"What does this student need to learn, build, or demonstrate to become employable/interview-ready for {target_role}?"

Avoid vague milestones such as:

* "Learn backend"
* "Study databases"
* "Improve DSA"
* "Learn system design"
* "Prepare for interviews"
* "Work on projects"

Instead make them measurable and specific.

Bad:
"Learn databases"

Good:
"Optimize PostgreSQL Queries and Database Design"

Description:
"Practice schema design, indexing, EXPLAIN plans, joins, transactions, and query optimization by profiling and improving queries in a real project."

## Project Requirements

Projects should demonstrate the student's target-role skills.

Prefer projects that combine multiple relevant technologies and concepts rather than simple CRUD applications.

A strong project milestone should specify what the student should build and what engineering concepts it should demonstrate.

For example:

"Build a Production-Style Backend with Authentication, PostgreSQL, Redis, and Background Jobs"

rather than:

"Build a backend project"

## System Design Requirements

System Design milestones must match the student's preparation stage.

For early-stage students:

* Focus on scalability fundamentals, APIs, databases, caching, load balancing, etc.

For mid-stage students:

* Include architecture design, distributed systems, queues, replication, partitioning, consistency, reliability, etc.

For final-stage students:

* Focus on solving complete system-design interview problems under time constraints.

Do not introduce highly advanced distributed-system concepts before their prerequisites.

## DSA Requirements

Maximum 3 DSA milestones.

Combine related DSA topics intelligently rather than creating one milestone for every small topic.

For example:

"Master Arrays, Hashing, Two Pointers, Sliding Window, and Binary Search"

is preferable to creating five separate milestones.

DSA milestones should focus on interview problem-solving ability, not merely completing a list of topics.

## Company Preparation

Company preparation should come toward the later part of the roadmap unless the preparation stage indicates otherwise.

Focus on:

* Frequently tested DSA patterns
* Role-specific technical topics
* Common interview rounds
* Company-specific technologies where relevant
* Behavioral questions
* Previous interview patterns when known
* Resume/project discussion preparation

Do not invent company-specific interview facts.

## Mock Interviews

The final milestones should prepare the student to perform under interview conditions.

Include appropriate combinations of:

* DSA timed practice
* Core-subject questioning
* Role-specific technical interviews
* Project deep dives
* System-design interviews
* Behavioral interviews
* Full mock interviews

## Priority Ordering

Use `priority_order` starting from 0.

Lower numbers mean higher priority.

Order milestones according to:

1. Critical weak areas
2. Prerequisite foundations
3. Core role-specific skills
4. Practical implementation
5. Projects
6. System design
7. Resume refinement
8. Company-specific preparation
9. Mock interviews

This is guidance, not a rigid ordering. Adjust it when dependencies require a different sequence.

## Quality Rules

Before returning the answer, internally verify:

* There are 10â€“15 milestones.
* There are no duplicate milestones.
* No more than 3 milestones have category `DSA`.
* At least 5 milestones directly develop target-role-specific skills.
* Weak areas relevant to the role appear early.
* Milestones follow reasonable learning dependencies.
* Every milestone is actionable.
* Every milestone can realistically be completed in 1â€“3 weeks.
* The roadmap contains appropriate coverage of DSA, Core Subjects, System Design, Projects, Resume, Company Preparation, and Mock Interviews.
* The roadmap is appropriate for the student's preparation stage.
* The roadmap is specific to `{target_role}`.
* `priority_order` values are unique, sequential integers starting from 0.
* No unnecessary technologies are introduced simply to make the roadmap appear advanced.

## Output Format

Return ONLY a valid JSON array.

Do not include:

* Markdown
* Code fences
* Explanations outside the JSON
* Reasoning
* Additional fields

Each object must contain exactly these fields:

* `title`: string
* `description`: string (A step-by-step task breakdown separated by newlines, e.g. "- First task\n- Second task\n- Third task")
* `category`: one of `DSA`, `Subjects`, `System Design`, `Resume`, `Projects`, `Company Preparation`, `Mock Interview`
* `priority_order`: integer

The final JSON must follow this structure:

[
{{
"title": "Specific actionable milestone",
"description": "- Explain the first step exactly\n- Explain the second step to build/practice\n- Explain the third step for mastery",
"category": "Projects",
"priority_order": 0
}}
]
"""
    try:
        timeout_s = float(getattr(settings, "GEMINI_REQUEST_TIMEOUT", 60.0))
        async with _GEMINI_SEMAPHORE:
            response = await asyncio.wait_for(
                asyncio.to_thread(
                    client.models.generate_content,
                    model=settings.GEMINI_MODEL,
                    contents=prompt,
                    config=genai.types.GenerateContentConfig(response_mime_type="application/json"),
                ),
                timeout=timeout_s,
            )
        milestones = _parse_gemini_json(response.text)
        if not isinstance(milestones, list):
            raise ValueError("Expected a JSON array of milestones.")
        return milestones[:15]
    except Exception as e:
        print(f"Failed to generate role roadmap: {e}")
        return []






