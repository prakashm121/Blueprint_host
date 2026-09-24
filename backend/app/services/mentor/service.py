import logging
from enum import Enum
from pydantic import BaseModel
from typing import Optional
from app.ai.gateway import ai_gateway
from app.prompts.mentor.teacher import get_teacher_prompt
from app.prompts.mentor.mentor import get_mentor_prompt

logger = logging.getLogger("placementos.mentor.service")

class TeachingMode(str, Enum):
    THEORY = "theory"
    CODING = "coding"
    DSA = "dsa"
    BACKEND = "backend"
    FRONTEND = "frontend"
    DATABASE = "database"
    SYSTEM_DESIGN = "system_design"
    DEVOPS = "devops"
    AI_ML = "ai_ml"
    SECURITY = "security"
    TESTING = "testing"
    APTITUDE = "aptitude"
    LOGICAL = "logical"
    VERBAL = "verbal"
    BEHAVIORAL = "behavioral"
    DESIGN = "design"
    DEBUGGING = "debugging"
    SYNTAX = "syntax"

CATEGORY_TO_MODE = {
    "Programming Languages": TeachingMode.CODING.value,
    "Frontend": TeachingMode.FRONTEND.value,
    "Backend": TeachingMode.BACKEND.value,
    "Database": TeachingMode.DATABASE.value,
    "DevOps": TeachingMode.DEVOPS.value,
    "Security & Networking": TeachingMode.SECURITY.value,
    "AI & ML": TeachingMode.AI_ML.value,
    "Testing & QA": TeachingMode.TESTING.value,
    "System Design": TeachingMode.SYSTEM_DESIGN.value,
    "Blockchain": TeachingMode.CODING.value,
    "Core Subjects": TeachingMode.THEORY.value,
    "Emerging Tech": TeachingMode.THEORY.value,
    "Data Analytics & BI": TeachingMode.AI_ML.value,
    "UI/UX & Design": TeachingMode.DESIGN.value,
    "Behavioral": TeachingMode.BEHAVIORAL.value,
}

SECTION_TO_MODE = {
    "AI & ML": TeachingMode.AI_ML.value,
    "DevOps Engineer": TeachingMode.DEVOPS.value,
    "React Engineer": TeachingMode.FRONTEND.value,
    "SAP Engineer": TeachingMode.CODING.value,
    "Numerical Ability": TeachingMode.APTITUDE.value,
    "Logical Reasoning": TeachingMode.LOGICAL.value,
    "Verbal Ability": TeachingMode.VERBAL.value,
}

DSA_TOPICS = {
    "array",
    "backtracking",
    "biconnected component",
    "binary indexed tree",
    "binary search",
    "binary search tree",
    "binary tree",
    "bit manipulation",
    "bitmask",
    "brainteaser",
    "breadth-first search",
    "bucket sort",
    "combinatorics",
    "concurrency",
    "counting",
    "counting sort",
    "data stream",
    "database",
    "depth-first search",
    "design",
    "divide and conquer",
    "doubly-linked list",
    "dynamic programming",
    "enumeration",
    "eulerian circuit",
    "game theory",
    "geometry",
    "graph",
    "greedy",
    "hash function",
    "hash table",
    "heap (priority queue)",
    "interactive",
    "iterator",
    "line sweep",
    "linked list",
    "math",
    "matrix",
    "memoization",
    "merge sort",
    "minimum spanning tree",
    "monotonic queue",
    "monotonic stack",
    "number theory",
    "ordered set",
    "prefix sum",
    "probability and statistics",
    "queue",
    "quickselect",
    "radix sort",
    "randomized",
    "recursion",
    "rejection sampling",
    "reservoir sampling",
    "rolling hash",
    "segment tree",
    "shell",
    "shortest path",
    "simulation",
    "sliding window",
    "sort",
    "sorting",
    "stack",
    "string",
    "string matching",
    "strongly connected component",
    "suffix array",
    "topological sort",
    "tree",
    "trie",
    "two pointers",
    "union find"
}

class IntentClassification(BaseModel):
    mode: TeachingMode

def detect_teaching_mode(
    message: str,
    skill_category: Optional[str] = None,
    current_skill: Optional[str] = None,
    section: Optional[str] = None,
) -> Optional[str]:
    text = message.lower().strip()

    # 1. Debugging always has highest priority
    debugging_patterns = [
        "fix this", "fix my code", "why is this code", "why does this code",
        "not working", "doesn't work", "does not work", "error", "exception",
        "traceback", "stack trace", "debug", "bug", "crash", "runtime error",
        "compile error", "wrong answer", "time limit exceeded", "tle",
        "memory limit exceeded", "mle"
    ]
    if any(p in text for p in debugging_patterns):
        return TeachingMode.DEBUGGING.value

    # 2. Explicit DSA/problem-solving signals
    dsa_signals = [
        "leetcode", "codeforces", "codechef", "dsa", "solve this problem",
        "solve this", "algorithm problem", "coding problem",
        "competitive programming", "optimal approach", "optimal solution", "brute force"
    ]
    if any(p in text for p in dsa_signals):
        return TeachingMode.DSA.value

    # 3. Current skill/category from Blueprint
    if current_skill:
        skill = current_skill.lower().strip()
        if skill in DSA_TOPICS:
            return TeachingMode.DSA.value

    if skill_category:
        category_mode = CATEGORY_TO_MODE.get(skill_category)
        if category_mode:
            if skill_category == "DSA":
                return TeachingMode.DSA.value
            return category_mode
            
    if section:
        section_mode = SECTION_TO_MODE.get(section)
        if section_mode:
            return section_mode

    # 4. Strong implementation signals
    coding_patterns = [
        "write code", "give me code", "show me code", "implement",
        "implementation", "how to implement", "write a program",
        "code for", "create an endpoint", "build this"
    ]
    if any(p in text for p in coding_patterns):
        return TeachingMode.CODING.value

    # 5. Small syntax/API questions
    syntax_patterns = [
        "syntax", "what is the syntax", "how do i use", "how to use",
        "how do i call", "what does this function do", "what does this method do",
        "how to import", "how to instantiate"
    ]
    if any(p in text for p in syntax_patterns):
        return TeachingMode.SYNTAX.value

    # 6. Let the LLM classify
    return None

async def classify_teaching_intent(message: str) -> str:
    prompt = f'''
Classify the user's teaching request into exactly ONE mode based on these primary modes:
theory, coding, dsa, backend, frontend, database, system_design, devops, ai_ml, security, testing, aptitude, logical, verbal, behavioral, design, debugging, syntax.

Important classification rules:
1. If the user asks to "teach" a programming or DSA concept, do NOT automatically classify it as theory.
2. If implementation is a major part of what the user wants, prefer coding, dsa, frontend, or backend over theory.
3. If the user gives broken code and asks what is wrong, use debugging.
4. Use theory only when implementation is genuinely not the main purpose.

Return ONLY the selected mode.

User Message:
{message}
'''
    try:
        result = await ai_gateway.generate(
            task="teaching_intent",
            prompt=prompt,
            schema=IntentClassification
        )
        return result.mode.value if result and hasattr(result, "mode") else TeachingMode.THEORY.value
    except Exception as e:
        logger.warning(f"Failed to classify teaching intent: {e}")
        return TeachingMode.THEORY.value

async def generate_teacher_response_stream(
    context: dict,
    topic: str,
    message: str,
    history: list[dict],
    model_override: str | None = None,
):
    """Async generator version of the teacher – yields text chunks."""
    skill_category = context.get("skill_category")
    current_skill = context.get("current_skill", topic)
    section = context.get("section")

    local_mode = detect_teaching_mode(
        message=message,
        skill_category=skill_category,
        current_skill=current_skill,
        section=section
    )

    print(
        f"[Teaching Router] local_mode={local_mode} "
        f"category={skill_category} skill={current_skill} section={section}"
    )

    if local_mode:
        mode = local_mode
        print(f"[Teaching Router] mode={mode} source=local")
    else:
        print("[Teaching Router] mode=unknown source=local")
        mode = await classify_teaching_intent(message)
        print(f"[Teaching Router] mode={mode} source=llm")
        if not mode:
            mode = TeachingMode.THEORY.value

    prompt = get_teacher_prompt(context=context, teach_topic=topic, teaching_mode=mode)

    for turn in history[-6:]:
        role = turn["role"].capitalize()
        prompt += f"\n{role}: {turn['content']}"

    prompt += f"\n\nUser:\n{message}\n\nResponse length must adapt to the question."

    async for chunk in ai_gateway.generate_stream(task="teacher_response", prompt=prompt, model_override=model_override):
        yield chunk


async def generate_mentor_response_stream(
    context: dict,
    message: str,
    history: list[dict],
    model_override: str | None = None,
):
    """Async generator version of the mentor – yields text chunks."""
    prompt = get_mentor_prompt(context)
    for turn in history[-6:]:
        role = turn["role"].capitalize()
        prompt += f"\n{role}: {turn['content']}"

    prompt += f"\n\nUser:\n{message}\n\nResponse length must adapt to the question."

    async for chunk in ai_gateway.generate_stream(task="mentor_response", prompt=prompt, model_override=model_override):
        yield chunk
