from sqlalchemy import Column, Integer, String, Text, DateTime, UniqueConstraint
from sqlalchemy.sql import func
from app.db.session import Base


class OutboxEvent(Base):
    """Transactional outbox — App Flow §14.5.1."""

    __tablename__ = "outbox_events"
    __table_args__ = (
        UniqueConstraint("idempotency_key", name="uq_outbox_idempotency_key"),
    )

    id = Column(Integer, primary_key=True, index=True)
    event_type = Column(String(80), nullable=False, index=True)
    payload = Column(Text, nullable=False)  # JSON
    status = Column(String(20), nullable=False, default="pending", index=True)
    attempt_count = Column(Integer, nullable=False, default=0)
    max_attempts = Column(Integer, nullable=False, default=5)
    last_error = Column(Text, nullable=True)
    idempotency_key = Column(String(120), nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    processed_at = Column(DateTime(timezone=True), nullable=True)
