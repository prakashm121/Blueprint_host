from sqlalchemy import Column, Integer, String, Text, Numeric, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.sql import func
from app.db.session import Base


class ResumeAnalysis(Base):
    __tablename__ = "resume_analyses"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=False)

    # SHA-256 of raw PDF bytes -- used for deduplication
    file_hash = Column(String(64), nullable=True, index=True)

    raw_text = Column(Text, nullable=True)
    file_name = Column(String(255), nullable=True)
    extraction_method = Column(String(30), nullable=True)  # "pdfminer"

    # ── Analysis lifecycle ──
    status = Column(String, default="PENDING", nullable=False)
    ats_score = Column(Numeric(5, 2), nullable=True)  # NULL means not yet computed
    feedback = Column(JSONB, nullable=True)

    # ── Audit trail: know exactly how every score was produced ──
    model = Column(String(100), nullable=True)          # e.g. "gemini-2.5-flash"
    prompt_version = Column(String(30), nullable=True)  # e.g. "resume-v2"
    scoring_version = Column(String(10), nullable=True) # e.g. "v2"

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
