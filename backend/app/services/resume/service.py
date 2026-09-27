import asyncio
from typing import List
from app.models.resume import ResumeAnalysis
from app.prompts.resume.analyzer import PROMPT_VERSION
from app.services.resume.schemas import SCORING_VERSION
import traceback
from app.api.deps import get_db
import logging
from app.services.resume.extractor import extract_text_from_pdf, file_hash
from app.services.resume.analyzer import analyze_text_resume
from app.services.resume.schemas import ResumeFeedback
from app.ai.errors import AIError

logger = logging.getLogger("placementos.resume.service")

MAX_PDF_BYTES = 5 * 1024 * 1024
MIN_TEXT_CHARS = 150

async def process_resume_upload(
    file_bytes: bytes,
    target_role: str,
    companies: list[str]
) -> tuple[ResumeFeedback, str, str]:
    """
    Synchronous orchestrator (will be moved to Celery later).
    Validates PDF, extracts text, calls analyzer, and returns feedback.
    """
    if len(file_bytes) > MAX_PDF_BYTES:
        raise ValueError("PDF exceeds 5MB limit.")
        
    f_hash = file_hash(file_bytes)
    # Deduplication would go here: check DB for f_hash
    
    raw_text = extract_text_from_pdf(file_bytes)
    
    if len(raw_text) < MIN_TEXT_CHARS:
        raise ValueError(f"Extracted text too short ({len(raw_text)} chars). Cannot analyze.")
        
    try:
        feedback, model_used = await analyze_text_resume(raw_text, target_role, companies)
        return feedback, raw_text, model_used
    except AIError as e:
        logger.error(f"Analysis failed: {e}")
        raise





def process_resume_task(
    analysis_id: str,
    file_bytes: bytes,
    target_role: str,
    companies: List[str],
):
    db_gen = get_db()
    db = next(db_gen)
    try:
        analysis = db.query(ResumeAnalysis).filter(ResumeAnalysis.id == analysis_id).first()
        if not analysis:
            return

        # ── Deduplication: if an identical completed analysis exists, copy it ──
        existing = (
            db.query(ResumeAnalysis)
            .filter(
                ResumeAnalysis.user_id == analysis.user_id,
                ResumeAnalysis.file_hash == analysis.file_hash,
                ResumeAnalysis.prompt_version == PROMPT_VERSION,
                ResumeAnalysis.scoring_version == SCORING_VERSION,
                ResumeAnalysis.status == "COMPLETED",
                ResumeAnalysis.id != analysis.id,
            )
            .order_by(ResumeAnalysis.id.desc())
            .first()
        )

        if existing and existing.ats_score is not None:
            logger.info(
                "Deduplication hit: reusing analysis id=%s for file_hash=%s",
                existing.id,
                analysis.file_hash,
            )
            analysis.status = "COMPLETED"
            analysis.ats_score = existing.ats_score
            analysis.feedback = existing.feedback
            analysis.raw_text = existing.raw_text
            analysis.model = existing.model
            analysis.prompt_version = existing.prompt_version
            analysis.scoring_version = existing.scoring_version
            db.commit()
            return

        # ── No cache hit: run the full analysis ──
        analysis.status = "PROCESSING"
        db.commit()

        feedback, raw_text, model_used = asyncio.run(
            process_resume_upload(file_bytes, target_role, companies)
        )

        analysis.status = "COMPLETED"
        analysis.ats_score = feedback.ats_score
        analysis.feedback = feedback.model_dump()
        analysis.raw_text = raw_text
        analysis.model = model_used
        analysis.prompt_version = PROMPT_VERSION
        analysis.scoring_version = SCORING_VERSION
        db.commit()

    except Exception as e:
        logger.error("process_resume_task failed: %s", e)
        logger.error(traceback.format_exc())
        db.rollback()
        analysis = db.query(ResumeAnalysis).filter(ResumeAnalysis.id == analysis_id).first()
        if analysis:
            analysis.status = "FAILED"
            db.commit()
    finally:
        db.close()
