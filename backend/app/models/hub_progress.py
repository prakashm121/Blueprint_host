from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, Index
from sqlalchemy.sql import func
from app.db.session import Base


# UserQuizAttempt REMOVED — replaced by UserQuizSession (Section 2.1 of Refactor.md)
# Reason: 1 row per answer = 15 rows + 45 index writes per session. None ever read back.
# UserQuizSession stores 1 summary row per session = 2 index writes. Same query answers.

# UserQuestionProgress REMOVED — dead code (Section 1.2 of Refactor.md)
# Reason: Interview Q&A is free-practice material. No query in the codebase reads it.
# Bookmarking is handled correctly by POST /api/v1/vault/ in InterviewQAEngine.jsx.


class UserQuizSession(Base):
    """One row per completed quiz session (replaces UserQuizAttempt)."""
    __tablename__ = "user_quiz_sessions"

    id              = Column(Integer, primary_key=True, index=True)
    user_id         = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    section         = Column(String(100), nullable=False)
    topic           = Column(String(100), nullable=True)
    total_questions = Column(Integer, nullable=False)
    correct_count   = Column(Integer, nullable=False)
    created_at      = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (
        Index("idx_uqs_user_id",      "user_id"),
        Index("idx_uqs_user_section", "user_id", "section"),
    )


class UserCodingProgress(Base):
    __tablename__ = "user_coding_progress"

    id         = Column(Integer, primary_key=True, index=True)
    user_id    = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    dsa_id     = Column(Integer, ForeignKey("dsa_problems.id", ondelete="CASCADE"), nullable=False)
    status     = Column(String(50), nullable=False)  # 'attempted' | 'solved'
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    __table_args__ = (
        Index("idx_user_coding_uid",        "user_id"),
        Index("idx_user_coding_uid_qid",    "user_id", "dsa_id"),
        Index("idx_user_coding_uid_status", "user_id", "status"),
    )

