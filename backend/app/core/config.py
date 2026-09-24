import os
from pathlib import Path
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent.parent
load_dotenv(BASE_DIR / ".env")

class Settings:
    PROJECT_NAME: str = "Blueprint"
    API_V1_STR: str = "/api/v1"
    SECRET_KEY: str = os.getenv("SECRET_KEY", "replace-with-a-secure-key-for-dev")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 8  # 8 days
    
    raw_db_url = os.getenv("DATABASE_URL", "sqlite:///./placementos.db")
    if raw_db_url.startswith("postgres://"):
        raw_db_url = raw_db_url.replace("postgres://", "postgresql+psycopg://", 1)
    elif raw_db_url.startswith("postgresql://"):
        raw_db_url = raw_db_url.replace("postgresql://", "postgresql+psycopg://", 1)
    DATABASE_URL: str = raw_db_url
    
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
    GEMINI_MODEL: str = os.getenv("GEMINI_MODEL", "gemini-3.5-flash") # Legacy, fallback for old uses
    
    # High-Quality Pool
    GEMINI_MENTOR_MODELS: list[str] = [
        "gemini-3.8-flash",
        "gemini-3.7-flash",
        "gemini-3.6-flash",
        "gemini-3.5-flash",
        "gemini-2.5-flash",
        "gemini-2.5-flash-lite"
    ]
    
    # Heavy Extraction Pool (High Quality -> Lite Fallbacks)
    GEMINI_RESUME_MODELS: list[str] = [
        "gemini-3.8-flash",
        "gemini-3.7-flash",
        "gemini-3.6-flash",
        "gemini-3.5-flash",
        "gemini-3.5-flash-lite",
        "gemini-3.1-flash-lite"
    ]
    
    # Reasoning Pool
    GEMINI_ROADMAP_MODELS: list[str] = [
        "gemini-3.8-flash",
        "gemini-3.7-flash",
        "gemini-3.6-flash",
        "gemini-3.5-flash",
        "gemini-3.5-flash-lite",
        "gemini-3.1-flash-lite"
    ]
    
    # Lightweight Pool (Removed 2.5-flash-lite due to 404 NOT FOUND)
    GEMINI_LIGHT_MODELS: list[str] = [
        "gemini-3.5-flash-lite", "gemini-3.1-flash-lite"
    ]
    GEMINI_TEMPERATURE: float = float(os.getenv("GEMINI_TEMPERATURE", "0.7"))
    GEMINI_MAX_TOKENS: int = int(os.getenv("GEMINI_MAX_TOKENS", "8192"))
    GEMINI_TOP_P: float = float(os.getenv("GEMINI_TOP_P", "0.95"))
    GEMINI_TOP_K: int = int(os.getenv("GEMINI_TOP_K", "40"))
    GEMINI_CONCURRENCY: int = int(os.getenv("GEMINI_CONCURRENCY", "10"))
    GEMINI_REQUEST_TIMEOUT: float = float(os.getenv("GEMINI_REQUEST_TIMEOUT", "120.0"))
    
    # Supabase
    SUPABASE_URL: str = os.getenv("SUPABASE_URL", "")
    SUPABASE_JWT_SECRET: str = os.getenv("SUPABASE_JWT_SECRET", "")
    FRONTEND_URL: str = os.getenv("FRONTEND_URL", "http://localhost:5173")

    # Workers & scaling
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    CELERY_BROKER_URL: str = os.getenv("CELERY_BROKER_URL", os.getenv("REDIS_URL", "redis://localhost:6379/0"))
    WORKER_MODE: str = os.getenv("WORKER_MODE", "celery")
    OUTBOX_BATCH_SIZE: int = int(os.getenv("OUTBOX_BATCH_SIZE", "50"))
    OUTBOX_MAX_ATTEMPTS: int = int(os.getenv("OUTBOX_MAX_ATTEMPTS", "5"))
    OUTBOX_POLL_SECONDS: int = int(os.getenv("OUTBOX_POLL_SECONDS", "2"))

    # Shared secret for internal cron-trigger endpoints (e.g. GitHub Actions scheduled scans)
    INTERNAL_TRIGGER_SECRET: str = os.getenv("INTERNAL_TRIGGER_SECRET", "")

    @property
    def uses_celery(self) -> bool:
        return self.WORKER_MODE == "celery"

settings = Settings()
