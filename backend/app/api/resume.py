import asyncio
import json
from datetime import timedelta
import logging

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.core.cache import redis_client
from app.models.user import User
from app.models.resume import ResumeAnalysis
from app.models.outbox_event import OutboxEvent
from app.workers.event_types import NOTIFICATION_RESUME_READY
from app.services.resume_service import (
    file_hash,
    _sync_extract_text,
    analyse_text_resume,
    MIN_TEXT_CHARS,
    MAX_PDF_BYTES,
)

logger = logging.getLogger("placementos.api.resume")

router = APIRouter()


@router.post("/upload")
async def upload_resume(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are allowed")

    file_bytes = await file.read()
    if len(file_bytes) > MAX_PDF_BYTES:
        raise HTTPException(status_code=400, detail="File too large. Maximum size is 5MB.")
    if len(file_bytes) == 0:
        raise HTTPException(status_code=400, detail="File is empty.")

    # 1. Rate limiting (1 per day per user) - Commented out for testing
    # ratelimit_key = f"resume:upload:{current_user.id}"
    # count = redis_client.incr(ratelimit_key)
    # if count == 1:
    #     redis_client.expire(ratelimit_key, 86400) # 24 hours
    # if count > 1:
    #     raise HTTPException(status_code=429, detail="You can analyse one resume per day. Please try again later.")

    # Decode target companies and role FIRST
    target_companies = []
    if current_user.target_companies:
        try:
            target_companies = json.loads(current_user.target_companies)
        except json.JSONDecodeError:
            pass
    role = current_user.target_role or "Software Engineer"

    # 2. Deduplication check via DB (Role-Aware)
    pdf_hash = file_hash(file_bytes)
    
    existing_analyses = (
        db.query(ResumeAnalysis)
        .filter(
            ResumeAnalysis.user_id == current_user.id,
            ResumeAnalysis.file_hash == pdf_hash
        )
        .order_by(ResumeAnalysis.created_at.desc())
        .all()
    )
    
    existing_failed = None
    for a in existing_analyses:
        a_role = a.feedback.get("target_role") if a.feedback else None
        # If older records don't have target_role, assume match to avoid unnecessary re-runs initially
        if a_role == role or a_role is None:
            if a.ats_score is not None:
                return {
                    "id": a.id,
                    "ats_score": a.ats_score,
                    "feedback": a.feedback,
                    "status": "cached"
                }
            elif existing_failed is None:
                existing_failed = a

    # 3. Synchronous text extraction
    raw_text = await asyncio.to_thread(_sync_extract_text, file_bytes)
    
    if len(raw_text) < MIN_TEXT_CHARS:
        raise HTTPException(
            status_code=422,
            detail="No extractable text found in this PDF. Please upload a text-based PDF, not a scanned image."
        )



    # 4. Release DB connection before long Gemini call
    db.close()

    try:
        feedback = await analyse_text_resume(raw_text, role, target_companies)
        feedback["target_role"] = role
    except Exception as e:
        logger.error(f"Resume analysis failed for user {current_user.id}: {e}")
        raise HTTPException(status_code=500, detail="Analysis failed due to an internal error.")

    # 5. Re-acquire DB connection and save
    db2 = next(get_db())
    try:
        if existing_failed:
            analysis = db2.merge(existing_failed)
            analysis.ats_score = feedback.get("ats_score")
            analysis.feedback = feedback
        else:
            analysis = ResumeAnalysis(
                user_id=current_user.id,
                file_hash=pdf_hash,
                raw_text=raw_text,
                file_name=file.filename,
                extraction_method="pdfminer",
                ats_score=feedback.get("ats_score"),
                feedback=feedback
            )
            db2.add(analysis)
        
        if feedback.get("ats_score") is not None:
            # Enqueue notification outbox event
            outbox_event = OutboxEvent(
                event_type=NOTIFICATION_RESUME_READY,
                payload=json.dumps({"user_id": current_user.id})
            )
            db2.add(outbox_event)

        db2.commit()
        db2.refresh(analysis)
        
        return {
            "id": analysis.id,
            "ats_score": analysis.ats_score,
            "feedback": analysis.feedback,
            "status": "processed"
        }
    finally:
        db2.close()


@router.get("/history")
def get_resume_history(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    analyses = (
        db.query(ResumeAnalysis)
        .filter(ResumeAnalysis.user_id == current_user.id)
        .order_by(ResumeAnalysis.created_at.desc())
        .limit(50)
        .all()
    )
    
    unique_analyses = []
    seen_hashes = set()
    for a in analyses:
        if a.file_hash not in seen_hashes:
            seen_hashes.add(a.file_hash)
            unique_analyses.append(a)
        if len(unique_analyses) >= 10:
            break
            
    return [
        {
            "id": a.id,
            "file_name": a.file_name,
            "ats_score": a.ats_score,
            "created_at": a.created_at,
            "failed": a.ats_score is None,
        }
        for a in unique_analyses
    ]

@router.get("/{analysis_id}")
def get_resume_analysis(
    analysis_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    analysis = (
        db.query(ResumeAnalysis)
        .filter(
            ResumeAnalysis.id == analysis_id,
            ResumeAnalysis.user_id == current_user.id
        )
        .first()
    )
    if not analysis:
        raise HTTPException(status_code=404, detail="Analysis not found")
        
    return {
        "id": analysis.id,
        "ats_score": analysis.ats_score,
        "feedback": analysis.feedback,
        "status": "processed" if analysis.ats_score is not None else "failed"
    }
