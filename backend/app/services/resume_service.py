import asyncio
import hashlib
import io
import json
import logging

from google import genai
from app.core.config import settings
from app.ai.gateway import ai_gateway
from pdfminer.high_level import extract_text

logger = logging.getLogger("placementos.resume")

MIN_TEXT_CHARS = 150
MAX_TEXT_CHARS = 15_000
MAX_PDF_BYTES = 5 * 1024 * 1024
TEXT_TIMEOUT = 30.0


# ── Deduplication ─────────────────────────────────────────────────────────────

def file_hash(file_bytes: bytes) -> str:
    return hashlib.sha256(file_bytes).hexdigest()


# ── Sync helpers (always called via asyncio.to_thread) ───────────────────────

def _sync_extract_text(file_bytes: bytes) -> str:
    try:
        return (extract_text(io.BytesIO(file_bytes)) or "").strip()
    except Exception as e:
        logger.warning("pdfminer failed: %s", e)
        return ""


import re

# ── JSON parser — handles Gemini markdown fences ─────────────────────────────

def _parse_json(text: str) -> dict:
    text = (text or "").strip()
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if match:
        text = match.group(0)
    return json.loads(text)


# ── Gemini call wrapper — shared semaphore + retry + timeout ─────────────────

# ── Deterministic fallback — never crashes the endpoint ──────────────────────

def _fallback_feedback(target_role: str) -> dict:
    """
    Returned when Gemini is unavailable after all retries.
    ats_score is None so the frontend knows to show a retry button.
    _analysis_failed flag is read by the frontend.
    """
    return {
        "summary": (
            "Analysis temporarily unavailable due to a service issue. "
            "Your resume was saved. Please retry in a moment."
        ),
        "ats_score": None,
        "sections": {},
        "strengths": [],
        "improvements": [
            "Ensure all sections are present: Contact, Summary, Experience, Education, Skills, Projects",
            f"Include keywords specific to {target_role} job descriptions",
            "Add numbers and metrics to all experience bullet points",
        ],
        "keywords_missing": [],
        "target_role_fit": f"Analysis pending for {target_role}.",
        "_analysis_failed": True,
    }


# ── Prompt builders ───────────────────────────────────────────────────────────

def _text_prompt(raw_text: str, target_role: str, companies: list[str]) -> str:
    hint = f"Target companies: {', '.join(companies[:3])}. " if companies else ""
    return f"""You are an expert ATS analyzer and placement coach.

Analyse this resume for a student targeting: {target_role}. {hint}

Resume:
\"\"\"
{raw_text[:MAX_TEXT_CHARS]}
\"\"\"

Return ONLY valid JSON, no markdown, no explanation outside the JSON:
{{
  "summary": "2-3 sentence overall assessment",
  "ats_score": <integer 0-100>,
  "sections": {{
    "contact":    {{"score": <0-100>, "notes": "one specific observation"}},
    "summary":    {{"score": <0-100>, "notes": "one specific observation"}},
    "experience": {{"score": <0-100>, "notes": "one specific observation"}},
    "education":  {{"score": <0-100>, "notes": "one specific observation"}},
    "skills":     {{"score": <0-100>, "notes": "one specific observation"}},
    "projects":   {{"score": <0-100>, "notes": "one specific observation"}}
  }},
  "strengths": ["specific strength", "specific strength"],
  "improvements": ["specific action", "specific action", "specific action"],
  "keywords_missing": ["keyword", "keyword"],
  "target_role_fit": "1-2 sentences specific to {target_role}"
}}

Scoring weights for ats_score:
- Keywords for {target_role} (30%)
- Quantified achievements with numbers (25%)
- Complete sections and clean structure (20%)
- Action verbs and impact language (15%)
- Education and project depth (10%)

Be specific to what you see. Never be generic."""


# ── Public API ────────────────────────────────────────────────────────────────

async def analyse_text_resume(
    raw_text: str,
    target_role: str,
    companies: list[str],
) -> dict:
    """Single Gemini text call for a text-extractable resume."""
    config = genai.types.GenerateContentConfig(
        response_mime_type="application/json",
        temperature=0.2,
        max_output_tokens=4000,
    )
    try:
        text = await ai_gateway.generate(
            task="resume_analysis",
            prompt=_text_prompt(raw_text, target_role, companies),
            timeout=TEXT_TIMEOUT,
            model_override=settings.GEMINI_MODEL
        )
        return _parse_json(text)
    except json.JSONDecodeError:
        # JSON malformed — retry once with stricter instruction
        logger.warning(f"JSON parse failed — retrying with strict prompt. Original text: {text[:500]}...")
        try:
            strict = _text_prompt(raw_text, target_role, companies) + \
                     "\n\nCRITICAL: Output ONLY the JSON object. Absolutely nothing else."
            text = await ai_gateway.generate(
                task="resume_analysis_strict",
                prompt=strict,
                timeout=TEXT_TIMEOUT,
                model_override=settings.GEMINI_MODEL
            )
            return _parse_json(text)
        except Exception as e:
            logger.error(f"Strict prompt retry failed: {e}. Raw text: {text[:500]}...")
            return _fallback_feedback(target_role)
    except Exception as e:
        logger.error(f"analyse_text_resume failed: {e}")
        return _fallback_feedback(target_role)
