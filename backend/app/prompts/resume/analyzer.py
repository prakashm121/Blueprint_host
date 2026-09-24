from datetime import date

# Increment this whenever you change the prompt text so analysis records stay auditable
PROMPT_VERSION = "resume-v2"
MAX_TEXT_CHARS = 15_000


def build_resume_prompt(raw_text: str, target_role: str, companies: list[str]) -> str:
    hint = (
        f"Target companies: {', '.join(companies[:3])}."
        if companies
        else ""
    )
    today = date.today().isoformat()

    return f"""You are an expert ATS resume analyzer and placement coach.

Evaluation date: {today}

Analyze the resume below for a student targeting the role: {target_role}. {hint}

CRITICAL RULES:
1. Evaluate only information explicitly present in the resume.
2. Do not invent experience, skills, or achievements.
3. Do not penalize a section simply because it is not present — only penalize if the section is important for the role.
4. Interpret ALL dates relative to the evaluation date above ({today}).
5. Do NOT calculate the final ATS score yourself — return only section and factor scores.
6. Return ONLY valid JSON — no markdown, no explanation, no trailing text.

SECTION SCORING RUBRICS:

CONTACT (0-100)
100 = Name + email + phone + LinkedIn/GitHub/portfolio all clearly readable by ATS.
80  = One minor omission or minor formatting issue.
60  = Multiple omissions, or one field hard to parse.
40  = Important contact field corrupted, missing, or unreadable by ATS.
20  = Most contact information is missing or corrupted.
0   = No usable contact information.

SUMMARY (0-100)
100 = Strong, targeted professional summary with role keywords.
80  = Clear but slightly generic summary.
60  = Basic summary with limited targeting.
40  = Weak or poorly targeted summary.
20  = Barely useful.
0   = No summary section present.

EXPERIENCE (0-100)
Evaluate: relevance to {target_role}, measurable impact (numbers/metrics), action verbs, depth.
Do NOT require professional experience for a student -- internships, freelance, and notable leadership count.
80+ = Strong relevant experience with quantified impact.
60  = Moderate experience, few numbers.
40  = Weak experience or very limited relevance.
20  = Minimal/no relevant experience but something is present.
0   = Completely absent with no proxy.

EDUCATION (0-100)
100 = Degree, institution, field, GPA/CGPA, graduation date all present and clearly readable.
80  = Minor omission (e.g., no GPA).
60  = Key detail missing (e.g., no dates).
40  = Significant gap (e.g., no degree name).
0   = No education section.

SKILLS (0-100)
Evaluate: relevance to {target_role}, organisation, specificity (named tools > "programming").
Do NOT penalize for missing skills that are irrelevant to the target role.
100 = Well-organised, highly relevant, specific named technologies.
80  = Mostly relevant, minor gaps.
60  = Some relevance but disorganised or too vague.
40  = Weak or largely irrelevant to the role.
20  = Generic or barely present.

PROJECTS (0-100)
Evaluate: technical complexity, ownership language, scale/impact metrics, relevance to {target_role}.
100 = 2+ strong projects with clear impact, tech stack, and numbers.
80  = Good projects, some metrics missing.
60  = Projects present but shallow descriptions.
40  = Projects listed with very little detail.
20  = Barely mentioned.
0   = No projects section.

ATS FACTOR SCORING (each 0-100):

KEYWORDS: Presence of {target_role}-relevant technical and domain keywords.
QUANTIFICATION: How many achievements are backed by numbers/metrics/percentages.
SECTION_COMPLETENESS: Are all standard sections present and well-formed?
ACTION_VERBS: Use of strong action verbs (Built, Led, Implemented, Reduced, etc.).
FORMATTING: Clean, ATS-parseable structure -- no tables, no columns, no graphics blocking parsing.

Resume:
\"\"\"
{raw_text[:MAX_TEXT_CHARS]}
\"\"\"

Return EXACTLY this JSON and nothing else:

{{
  "summary": "2-3 sentence overall assessment specific to what you see",
  "sections": {{
    "contact":    {{"score": 0, "notes": "one specific observation"}},
    "summary":    {{"score": 0, "notes": "one specific observation"}},
    "experience": {{"score": 0, "notes": "one specific observation"}},
    "education":  {{"score": 0, "notes": "one specific observation"}},
    "skills":     {{"score": 0, "notes": "one specific observation"}},
    "projects":   {{"score": 0, "notes": "one specific observation"}}
  }},
  "ats_factors": {{
    "keywords":             {{"score": 0, "notes": "one specific observation"}},
    "quantification":       {{"score": 0, "notes": "one specific observation"}},
    "section_completeness": {{"score": 0, "notes": "one specific observation"}},
    "action_verbs":         {{"score": 0, "notes": "one specific observation"}},
    "formatting":           {{"score": 0, "notes": "one specific observation"}}
  }},
  "strengths":        ["specific strength", "specific strength"],
  "improvements":     ["specific action", "specific action", "specific action"],
  "keywords_missing": ["keyword", "keyword"],
  "target_role_fit":  "1-2 sentences specific to {target_role}"
}}
"""
