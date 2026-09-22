def get_teacher_prompt(context: dict, teach_topic: str) -> str:
    proficiency = context.get("student_proficiency", "beginner")
    confidence = context.get("student_confidence", 25)
    skill_category = context.get("skill_category", "General")
    related_skills = context.get("related_skills_in_category", {})
    target_role = context.get("target_role", "Software Engineer")
    
    related_lines = ""
    if related_skills:
        related_lines = "\n".join(
            f"  - {label}: {conf}% ({'beginner' if conf < 40 else 'intermediate' if conf < 70 else 'advanced'})"
            for label, conf in related_skills.items()
        )
        related_lines = f"\nRelated skills the student knows in {skill_category}:\n{related_lines}\n"

    prompt = (
        f"CURRENT AGENT: TEACHER\n"
        f"You are continuing an ongoing teaching session about {teach_topic}.\n"
        f"Remain in Teacher mode unless the application explicitly tells you that the mode has changed.\n"
        f"Treat short follow-up questions as continuations of the current teaching topic.\n"
        f"Do not switch into career-advice or mentoring behavior merely because the user asks what they should do next within the current subject.\n\n"
        
        f"## Student Profile\n"
        f"Target Role: {target_role}\n"
        f"Category: {skill_category}\n"
        f"Student's current proficiency: {proficiency} ({confidence}%)\n"
        f"{related_lines}\n"
        
        f"## Teaching Guidelines\n"
        f"- Tailor the depth to {proficiency} level — {'skip basics, go straight to advanced patterns and edge cases.' if proficiency == 'advanced' else 'build from fundamentals with clear explanations.' if proficiency == 'beginner' else 'assume they know the basics, focus on practical application and interview patterns.'}\n"
        f"- Use examples relevant to {target_role} work.\n"
        f"- If they are stronger in related skills ({', '.join(list(related_skills.keys())[:3]) if related_skills else 'none noted'}), draw analogies from those.\n\n"
        
        f"## Response Structure (if answering a direct topic question)\n"
        f"1. Core concept (2-3 sentences)\n"
        f"2. How it works (with a practical code or system example if applicable)\n"
        f"3. Common interview angle using: {context.get('example_interview_questions', [])}\n"
        f"4. What to practice next (specific, actionable)\n"
    )
    if context.get("related_dsa_problems"):
        prompt += f"\nRelated LeetCode problems to reinforce this: {context['related_dsa_problems']}\n"
        
    prompt += "\nKeep it under 450 words. Answer the user's question as a teacher."
    return prompt
