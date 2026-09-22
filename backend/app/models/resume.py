from sqlalchemy import Column, Integer, String, Text, Numeric, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.sql import func
from app.db.session import Base

class ResumeAnalysis(Base):
    __tablename__ = "resume_analyses"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=False)

    # SHA-256 of raw PDF bytes — used for deduplication
    file_hash = Column(String(64), nullable=True, index=True)

    raw_text = Column(Text, nullable=True)
    file_name = Column(String(255), nullable=True)
    extraction_method = Column(String(30), nullable=True) # "pdfminer"

    ats_score = Column(Numeric(5, 2), nullable=True) # NULL means analysis failed
    feedback = Column(JSONB, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
