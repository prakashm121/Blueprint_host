import logging
from app.ai.gateway import ai_gateway
from app.ai.errors import AIError
from app.prompts.resume.analyzer import build_resume_prompt, PROMPT_VERSION, MAX_TEXT_CHARS
from app.services.resume.schemas import ResumeFeedback, SCORING_VERSION

logger = logging.getLogger("placementos.resume.analyzer")

TEXT_TIMEOUT = 30.0


async def analyze_text_resume(
    raw_text: str,
    target_role: str,
    companies: list[str],
) -> tuple[ResumeFeedback, str]:
    """
    Calls the AI Gateway to analyze the resume text.

    The LLM returns per-section scores + qualitative fields.
    Python calculates the final ats_score deterministically via
    ResumeFeedback.compute_score() — the model never owns the final number.
    """
    prompt = build_resume_prompt(raw_text[:MAX_TEXT_CHARS], target_role, companies)

    try:
        feedback, model_used = await ai_gateway.generate(
            task="resume_analysis",
            prompt=prompt,
            schema=ResumeFeedback,
            timeout=TEXT_TIMEOUT,
            return_model=True,
        )

        # Python calculates the final score — Gemini had no ats_score field
        feedback.compute_score()

        logger.info(
            "Resume analysis complete | role=%s | score=%s | model=%s | prompt=%s | scoring=%s",
            target_role,
            feedback.ats_score,
            model_used,
            PROMPT_VERSION,
            SCORING_VERSION,
        )
        return feedback, model_used

    except AIError as e:
        logger.error("AI Gateway failed to analyze resume: %s", e)
        raise
