"""
profile.py — Extended student profile (college, degree, CGPA, social links).
One-to-one with User.
"""
from sqlalchemy import Column, Integer, String, SmallInteger, Numeric, Text, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.session import Base

class Profile(Base):
    __tablename__ = "profiles"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, index=True, nullable=False)
    full_name = Column(String(120), nullable=True)
    phone_number = Column(String(20), nullable=True)
    college_name = Column(String(200), nullable=True)
    degree = Column(String(100), nullable=True)
    specialization = Column(String(100), nullable=True)
    graduation_year = Column(SmallInteger, nullable=True)
    cgpa = Column(Numeric(3, 2), nullable=True)
    linkedin_url = Column(Text, nullable=True)
    github_username = Column(String(100), nullable=True)
    avatar_url = Column(Text, nullable=True)
    bio = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    version = Column(Integer, default=1)

    user = relationship("User", back_populates="profile")
