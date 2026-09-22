import enum
from sqlalchemy import Column, Integer, String, Text, ForeignKey, Enum, DateTime, Index
from sqlalchemy.sql import func
from app.db.session import Base

class VaultItemType(str, enum.Enum):
    BOOKMARK = "BOOKMARK"
    AI_INSIGHT = "AI_INSIGHT"
    PERSONAL_NOTE = "PERSONAL_NOTE"

class VaultReferenceType(str, enum.Enum):
    DSA = "DSA"
    QUIZ = "QUIZ"
    INTERVIEW = "INTERVIEW"
    NONE = "NONE"

class VaultItem(Base):
    __tablename__ = "vault_items"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    item_type = Column(Enum(VaultItemType), index=True, nullable=False)
    reference_type = Column(Enum(VaultReferenceType), nullable=False, default=VaultReferenceType.NONE)
    reference_id = Column(Integer, nullable=True) # ID of the problem/question
    title = Column(String(255), nullable=False)
    content = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    __table_args__ = (
        Index('idx_vault_reference', 'reference_type', 'reference_id'),
        Index('idx_vault_user_created', 'user_id', created_at.desc()),
    )
