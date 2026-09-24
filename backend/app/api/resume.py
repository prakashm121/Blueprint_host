import json
import logging
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.models.user import User
from app.models.resume import ResumeAnalysis
from app.services.resume.extractor import file_hash

logger = logging.getLogger("placementos.api.resume")

router = APIRouter()
MAX_PDF_BYTES = 5 * 1024 * 1024

@router.post("/upload", status_code=202)
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

    target_companies = []
    if current_user.target_companies:
        try:
            target_companies = json.loads(current_user.target_companies)
        except json.JSONDecodeError:
            pass
    role = current_user.target_role or "Software Engineer"

    pdf_hash = file_hash(file_bytes)
    
    # 202 Accepted Architecture: Save job as PENDING and dispatch Celery Task
    analysis = ResumeAnalysis(
        user_id=current_user.id,
        file_hash=pdf_hash,
        file_name=file.filename,
        extraction_method="pdfminer",
        status="PENDING" # Assumes you add status to the model, or use ats_score=None as a proxy if db hasn't migrated
    )
    db.add(analysis)
    db.commit()
    db.refresh(analysis)
    
    # Dispatch Celery
    from app.workers.tasks.ai_tasks import process_resume_task
    process_resume_task.delay(analysis.id, file_bytes, role, target_companies)
    
    return {
        "id": analysis.id,
        "status": "PENDING"
    }

@router.get("/history")
def get_resume_history(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    analyses = (
        db.query(ResumeAnalysis)
        .filter(ResumeAnalysis.user_id == current_user.id)
        .order_by(ResumeAnalysis.created_at.desc())
        .limit(10)
        .all()
    )
    return [
        {
            "id": a.id,
            "file_name": a.file_name,
            "ats_score": a.ats_score,
            "created_at": a.created_at,
            "status": getattr(a, "status", "COMPLETED" if a.ats_score else "FAILED")
        }
        for a in analyses
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
        "status": getattr(analysis, "status", "COMPLETED" if analysis.ats_score else "PENDING")
    }
