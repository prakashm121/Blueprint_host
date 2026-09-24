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



