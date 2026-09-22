# app/models/hub.py

from sqlalchemy import (
    Column, Integer, String, Text, Boolean,
    DateTime, Index, Float
)
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.sql import func, text
from app.db.session import Base


# ─────────────────────────────────────────────────────────────────────────────
# DSA / Coding Problems  (LeetCode-style, 3,632 unique problems)
# ─────────────────────────────────────────────────────────────────────────────

class DSAProblem(Base):
    __tablename__ = "dsa_problems"

    id            = Column(Integer, primary_key=True, index=True)
    frontend_id   = Column(Integer, index=True, unique=True, nullable=False)
    title         = Column(String(255), nullable=False)
    titleSlug     = Column(String(255), nullable=False)
    difficulty    = Column(String(50), index=True, nullable=False)
    content       = Column(Text, nullable=True)  # Set to nullable=True to avoid missing data crashes
    topic_tags    = Column(ARRAY(String), nullable=False, default=list)
    code_snippets = Column(Text, nullable=True)  # Stored as JSON string to support multiple languages
    acRate        = Column(Float, nullable=True)
    companies     = Column(ARRAY(String), nullable=False, default=list)
    problem_URL   = Column(String(500), nullable=True)
    is_premium    = Column(String(10), nullable=True)
    created_at    = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index('idx_dsa_topic_tags', 'topic_tags', postgresql_using='gin'),
        Index('idx_dsa_companies', 'companies', postgresql_using='gin'),
        Index('idx_dsa_search', text("to_tsvector('english', title)"), postgresql_using='gin'),
    )


# ─────────────────────────────────────────────────────────────────────────────
# Interview Q&A  (33,807 open-ended questions)
# ─────────────────────────────────────────────────────────────────────────────

class InterviewQuestion(Base):
    __tablename__ = "interview_questions"

    id          = Column(Integer, primary_key=True, index=True)
    title       = Column(Text,        nullable=False)
    body        = Column(Text,        nullable=True)
    category    = Column(String(80),  nullable=False, index=True)
    skill       = Column(String(120), nullable=True,  index=True)   # Python | React | OOP | etc.
    difficulty  = Column(String(20),  nullable=False, index=True)
    roles       = Column(ARRAY(String), nullable=False, default=list)
    source      = Column(String(40),  nullable=False, default="curated")
    created_at  = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (
        # Fast category+difficulty list (most common filter combo)
        Index("ix_iq_category_difficulty", "category", "difficulty"),
        # Fast language/skill filter within a category
        Index("ix_iq_category_skill",      "category", "skill"),
        # GIN for role array containment
        Index("ix_iq_roles_gin",           "roles",    postgresql_using="gin"),
        # Full-text search across title + body
        Index(
            "ix_iq_fts",
            text("to_tsvector('english', title || ' ' || coalesce(body, ''))"),
            postgresql_using="gin",
        ),
    )


# ─────────────────────────────────────────────────────────────────────────────
# Quiz MCQ  (5,816 multiple-choice questions)
# ─────────────────────────────────────────────────────────────────────────────

class QuizQuestion(Base):
    __tablename__ = "quiz_questions"

    id          = Column(Integer, primary_key=True, index=True)
    section     = Column(String(100), nullable=False, index=True)
    topic       = Column(String(100), nullable=False, index=True)
    difficulty  = Column(String(20),  nullable=False, index=True)
    question    = Column(Text,        nullable=False)
    option_a    = Column(Text,        nullable=False)
    option_b    = Column(Text,        nullable=False)
    option_c    = Column(Text,        nullable=False)
    option_d    = Column(Text,        nullable=False)
    correct_ans = Column(String(1),   nullable=False)   # A | B | C | D
    created_at  = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index("ix_quiz_section_difficulty", "section", "difficulty"),
        Index("ix_quiz_section_topic",      "section", "topic"),
    )