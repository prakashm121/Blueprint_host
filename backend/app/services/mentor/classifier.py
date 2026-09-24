import re
from typing import Dict

def detect_teacher_task(msg: str) -> str:
    msg = msg.lower().strip()
    if any(x in msg for x in ["deep dive", "deep dive into", "in detail", "deeply"]):
        return "deep_dive"
    if any(x in msg for x in ["give an example", "give examples", "example", "examples"]):
        return "example"
    if any(x in msg for x in ["compare", "difference between", "difference", " vs ", "versus"]):
        return "compare"
    if any(x in msg for x in ["quiz me", "test me", "ask me questions"]):
        return "quiz"
    if any(x in msg for x in ["practice", "practice questions", "give me problems", "give me questions"]):
        return "practice"
    return "explain"

def detect_mentor_task(msg: str) -> str:
    msg = msg.lower()
    if "what should i learn" in msg: return "roadmap"
    if "career" in msg: return "career_advice"
    if "weak" in msg or "skill gap" in msg: return "skill_gap"
    if "interview" in msg: return "interview_prep"
    return "general"

def get_mentor_score(msg: str) -> int:
    score = 0
    msg = msg.lower()
    if "what should i learn" in msg: score += 3
    if "next" in msg: score += 2
    if "career" in msg: score += 3
    if "roadmap" in msg: score += 3
    if "prepare for" in msg: score += 2
    if "placement" in msg: score += 2
    return score

def resolve_conversation_state(
    current_mode: str | None,
    current_topic: str | None,
    message: str,
) -> Dict[str, str | None]:
    """
    100% Deterministic Regex Classifier.
    NO Gemini call is made here.
    """
    msg_lower = message.lower().strip()

    # 1. Explicit Agent Switches
    if any(x in msg_lower for x in ["switch to mentor", "act as a mentor", "be my mentor"]):
        return {"action": "switch_to_mentor", "mode": "mentor", "topic": None, "task": "general"}
    if any(x in msg_lower for x in ["switch to teacher", "act as a teacher", "be my teacher"]):
        return {"action": "switch_to_teacher", "mode": "teacher", "topic": current_topic, "task": "explain"}

    # 2. Explicit Teacher Intent
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
            topic = re.sub(r"\b(please|properly|in detail|from scratch)\b$", "", topic).strip()
            return {"action": "switch_to_teacher", "mode": "teacher", "topic": topic[:100], "task": detect_teacher_task(msg_lower)}

    # 3. Explicit Teacher tasks (Deep Dive, Quiz, etc)
    teacher_task = detect_teacher_task(msg_lower)
    explicit_teacher_task = teacher_task != "explain" and any(
        phrase in msg_lower for phrase in [
            "deep dive", "in detail", "give an example", "example",
            "compare", "difference between", " vs ", "quiz me", "test me",
            "practice questions", "practice"
        ]
    )
    if explicit_teacher_task:
        return {"action": "switch_to_teacher", "mode": "teacher", "topic": current_topic, "task": teacher_task}

    # 4. Existing Teacher conversation
    if current_mode == "teacher":
        if get_mentor_score(msg_lower) >= 3:
            return {"action": "switch_to_mentor", "mode": "mentor", "topic": None, "task": detect_mentor_task(msg_lower)}
        return {"action": "stay", "mode": "teacher", "topic": current_topic, "task": teacher_task}

    # 5. Existing Mentor conversation
    if current_mode == "mentor":
        if teacher_task != "explain":
            return {"action": "switch_to_teacher", "mode": "teacher", "topic": current_topic, "task": teacher_task}
        return {"action": "stay", "mode": "mentor", "topic": None, "task": detect_mentor_task(msg_lower)}

    # 6. Ambiguous completely new conversation (Default to Mentor)
    # The user approved defaulting ambiguous queries to Mentor to save an LLM call.
    return {"action": "switch_to_mentor", "mode": "mentor", "topic": None, "task": detect_mentor_task(msg_lower)}
