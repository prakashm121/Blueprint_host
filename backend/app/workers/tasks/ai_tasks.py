import asyncio
from typing import List
import logging
from app.workers.celery_app import celery_app
from app.api.deps import get_db
from app.models.resume import ResumeAnalysis
from app.services.resume.service import process_resume_upload
from app.services.resume.schemas import SCORING_VERSION
from app.prompts.resume.analyzer import PROMPT_VERSION
import traceback

logger = logging.getLogger("placementos.ai_tasks")


@celery_app.task(name="process_resume_task", bind=True)
def process_resume_task(
    self,
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

        loop = asyncio.get_event_loop()
        feedback, raw_text, model_used = loop.run_until_complete(
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
