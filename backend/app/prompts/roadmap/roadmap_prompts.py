def build_roadmap_prompt(
    target_role: str,
    prep_stage: str,
    weak_areas: list[str],
) -> str:
    weak_str = ", ".join(weak_areas) if weak_areas else "None specified"
    return f"""You are an expert AI Career Coach building a placement preparation roadmap.
Target Role: {target_role}
Preparation Stage: {prep_stage}
Identified Weak Areas: {weak_str}

Return EXACTLY 10-15 milestones as a JSON array of objects with this schema:
{{
  "title": "Specific actionable milestone",
  "description": "- First step\\n- Second step\\n- Third step",
  "category": "Projects",
  "priority_order": 0
}}

IMPORTANT: "description" must be 2-4 bullet points, each starting with "- " and separated by
a JSON-escaped newline (\\n) exactly like the example above, so the field stays valid JSON.
Never run bullets together on one line or join them with "- " alone and no newline.
Output ONLY the JSON array, with no other text before or after it.
"""

def build_weekly_prompt(
    active_milestone: str,
    available_hours: int,
    new_count: int,
) -> str:
    return f"""You are an expert AI Career Coach.
The student is currently working on: "{active_milestone}"
They have {available_hours} hours available this week.
They need {new_count} specific tasks to work on.

Return ONLY a JSON array of {new_count} objects with this exact schema:
{{
  "title": "string",
  "category": "string",
  "estimated_hours": <integer>
}}
"""

def build_daily_prompt(task_titles: list[str], available_minutes: int) -> str:
    tasks_str = "\n".join(f"- {t}" for t in task_titles)
    return f"""You are an expert AI Career Coach helping a student prepare for placements.
The student has {available_minutes} minutes available today and these tasks planned:
{tasks_str}

Break each task into specific, actionable sub-steps that fit within the available time.

Return ONLY a JSON array of objects with this exact schema:
{{
  "title": "string",
  "category": "string",
  "estimated_minutes": <integer>,
  "status": "Pending",
  "source": "ai_daily_breakdown"
}}
"""
