from pydantic import BaseModel, Field, field_validator
from typing import List, Optional
from datetime import datetime


# ── Scoring constants (owns the scoring formula — Gemini never touches this) ──

# ── Candidate Optimization Model weights (industry-validated) ──
# Keywords (45%) -> split across keywords factor + skills/projects sections
# Parse Success (20%) -> formatting factor (critical hard gate)
# Section Completeness (15%) -> section_completeness factor + contact/education
# Keyword Placement (10%) -> action_verbs factor + summary section
# Relevance/Tenure (10%) -> experience section
#
# Total must sum to 1.0
SECTION_WEIGHTS: dict[str, float] = {
    "contact":    0.07,   # Part of section completeness
    "summary":    0.05,   # Keyword placement
    "experience": 0.10,   # Relevance & tenure
    "education":  0.08,   # Part of section completeness
    "skills":     0.15,   # Keywords
    "projects":   0.15,   # Keywords
}

ATS_FACTOR_WEIGHTS: dict[str, float] = {
    "keywords":             0.20,   # Primary keyword signal (45% total with skills+projects)
    "quantification":       0.05,   # Supports relevance signal
    "section_completeness": 0.05,   # Gate check
    "action_verbs":         0.05,   # Keyword placement
    "formatting":           0.05,   # Parse success (hard gate)
}

SCORING_VERSION = "v2"   # Bump when weights change


def calculate_ats_score(
    sections: "ResumeSections",
    ats_factors: "ATSFactors",
) -> int:
    """
    Deterministic Python scoring — Gemini does NOT produce the final number.
    Weights sum to 1.0, so the maximum possible score is 100.
    """
    section_score = sum(
        getattr(sections, name).score * weight
        for name, weight in SECTION_WEIGHTS.items()
    )
    factor_score = sum(
        getattr(ats_factors, name).score * weight
        for name, weight in ATS_FACTOR_WEIGHTS.items()
    )
    return max(0, min(100, round(section_score + factor_score)))


# ── Pydantic schemas ──
#
# NOTE: Gemini's Developer API response_schema (used by the AI Gateway to force
# schema-conformant output) does not support `additionalProperties` / free-form
# dicts — only fixed, named object fields. Sections and ATS factors are a fixed,
# known set (per the prompt rubric), so they are modeled as named fields rather
# than Dict[str, ResumeSection]. This keeps the wire shape identical (still
# serializes to {"contact": {...}, "summary": {...}, ...}) while letting the
# gateway actually enforce the schema instead of just hoping the model follows it.

class ResumeSection(BaseModel):
    score: int = Field(..., ge=0, le=100)
    notes: str

    @field_validator("score", mode="before")
    @classmethod
    def clamp(cls, v: int) -> int:
        return max(0, min(100, int(v)))


class ResumeSections(BaseModel):
    contact: ResumeSection
    summary: ResumeSection
    experience: ResumeSection
    education: ResumeSection
    skills: ResumeSection
    projects: ResumeSection


class ATSFactors(BaseModel):
    keywords: ResumeSection
    quantification: ResumeSection
    section_completeness: ResumeSection
    action_verbs: ResumeSection
    formatting: ResumeSection


class ResumeFeedback(BaseModel):
    """
    What Gemini returns: individual scores + qualitative fields.
    The final ats_score is calculated by Python, not the LLM.
    """
    summary: str
    sections: ResumeSections
    ats_factors: ATSFactors
    strengths: List[str]
    improvements: List[str]
    keywords_missing: List[str]
    target_role_fit: str

    # Computed field — populated after Gemini returns its response
    ats_score: Optional[int] = None

    def compute_score(self) -> "ResumeFeedback":
        """Call this once after construction to populate ats_score."""
        self.ats_score = calculate_ats_score(self.sections, self.ats_factors)
        return self


class ResumeAnalysisJob(BaseModel):
    id: str
    user_id: str
    file_hash: str
    file_name: str
    raw_text: str
    status: str  # 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED'
    feedback: Optional[ResumeFeedback] = None
    model: Optional[str] = None
    prompt_version: Optional[str] = None
    scoring_version: Optional[str] = None
    error_code: Optional[str] = None
    created_at: datetime
    updated_at: datetime
