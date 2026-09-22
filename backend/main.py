import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.api import auth, profile, dashboard, planner, onboarding, mentor, notifications, hub, vault, assessments, roadmap, resume
from app.db.session import init_db
from app.workers.outbox import outbox_stats

logger = logging.getLogger("placementos")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # No more embedded scheduler — Celery Beat handles all cron jobs
    logger.info("PlacementOS API starting (worker_mode=%s)", settings.WORKER_MODE)
    yield
    logger.info("PlacementOS API shutting down")


app = FastAPI(
    title=settings.PROJECT_NAME,
    version="0.1.0",
    description="PlacementOS API — Celery worker architecture",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_URL],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix=f"{settings.API_V1_STR}/auth", tags=["auth"])
app.include_router(profile.router, prefix=f"{settings.API_V1_STR}/profile", tags=["profile"])
app.include_router(dashboard.router, prefix=f"{settings.API_V1_STR}/dashboard", tags=["dashboard"])
app.include_router(planner.router, prefix=f"{settings.API_V1_STR}/planner", tags=["planner"])
app.include_router(onboarding.router, prefix=f"{settings.API_V1_STR}/onboarding", tags=["onboarding"])
app.include_router(mentor.router, prefix=f"{settings.API_V1_STR}/mentor", tags=["mentor"])
app.include_router(notifications.router, prefix=f"{settings.API_V1_STR}/notifications", tags=["notifications"])
app.include_router(hub.router, prefix=f"{settings.API_V1_STR}/hub", tags=["hub"])
app.include_router(vault.router, prefix=f"{settings.API_V1_STR}/vault", tags=["vault"])
app.include_router(assessments.router, prefix=f"{settings.API_V1_STR}/assessments", tags=["assessments"])
app.include_router(roadmap.router, prefix=f"{settings.API_V1_STR}/roadmap", tags=["roadmap"])
app.include_router(resume.router, prefix=f"{settings.API_V1_STR}/resume", tags=["resume"])

init_db()

@app.get("/", response_class=JSONResponse)
def read_root():
    return {"service": "placementos-backend", "status": "ok"}

@app.get("/health")
def health_check():
    return {"status": "healthy"}

@app.get(f"{settings.API_V1_STR}/status")
def api_status():
    return {"api": settings.PROJECT_NAME, "version": "v1"}

@app.get(f"{settings.API_V1_STR}/status/workers")
def worker_status():
    """Ops endpoint — outbox backlog and worker mode."""
    return {"success": True, "data": outbox_stats()}

@app.get(f"{settings.API_V1_STR}/placements")
def list_placements():
    return {"placements": []}

