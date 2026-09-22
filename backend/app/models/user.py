from sqlalchemy.orm import relationship
from sqlalchemy import Column, Integer, String, Boolean, Text, DateTime
from sqlalchemy.sql import func
from sqlalchemy import UniqueConstraint
from app.db.session import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    supabase_id = Column(String, unique=True, index=True, nullable=True)
    email = Column(String, unique=True, index=True, nullable=False)
    full_name = Column(String, index=True)
    is_active = Column(Boolean, default=True)
    is_superuser = Column(Boolean, default=False)
    onboarding_step = Column(String(30), nullable=False, default="profile")
    target_role = Column(String(100), nullable=True)
    target_companies = Column(Text, nullable=True)
    preparation_status = Column(String(50), nullable=True, default="early")
    onboarding_completed_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    profile = relationship("Profile", back_populates="user", uselist=False)

    __table_args__ = (
        UniqueConstraint("email", name="uq_users_email"),
    )

