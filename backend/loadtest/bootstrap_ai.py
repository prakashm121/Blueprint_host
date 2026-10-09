"""
bootstrap_ai.py — Extends loadtest/bootstrap.py for ONE purpose: exercising the
real AI-backed endpoints (mentor chat, roadmap generation, weekly plan, daily
plan) against the real Gemini API, restricted to the "lite" model tier, with
the app's own per-user AI quotas raised for the duration of this process only.

IMPORTANT — why there is nothing to "restore" afterwards:
Every limit here (MENTOR_MAX_PER_MINUTE, PLANNER_WEEKLY_AI_PER_DAY, which Gemini
model list each task uses, etc.) is read from `app.core.config.settings` at the
moment each request is handled — confirmed by reading every call site in
app/api/{mentor,planner,onboarding}.py. Nothing is hardcoded or patched in any
committed file. This script only mutates the in-memory `settings` singleton of
THIS process, after importing it, the same non-invasive pattern bootstrap.py
already uses for the SQLite type patches. Once this process exits, the real
app — run normally via start.sh — reads its real values from Render's
environment again, completely unaffected. There is no code to revert.

The real GEMINI_API_KEY is read directly from backend/.env (never written to
disk anywhere else, never printed, never included in any report this harness
generates) because this test makes real, billed Gemini API calls. Keep the
scale small — see locustfile_ai.py's low user count and long think-time.

Run from backend/:  .venv/Scripts/python.exe -m loadtest.server_entry_ai [port]
"""
from pathlib import Path

from dotenv import dotenv_values

from loadtest import bootstrap  # noqa: E402  (SQLite patches, non-production DB/Supabase assertions)
from app.core.config import settings  # noqa: E402

_REAL_ENV = dotenv_values(bootstrap.BACKEND_DIR / ".env")
_REAL_KEY = _REAL_ENV.get("GEMINI_API_KEY", "")
assert _REAL_KEY, (
    "No GEMINI_API_KEY found in backend/.env — the AI load test needs a real key "
    "to call Gemini. Nothing was changed; this script just can't proceed."
)

LITE_MODELS = ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-2.5-flash-lite"]

settings.GEMINI_API_KEY = _REAL_KEY
settings.GEMINI_MODEL = LITE_MODELS[0]              # used by weekly_planner / daily_breakdown (no fallback list)
settings.GEMINI_RESUME_MODELS = LITE_MODELS[:2]
settings.GEMINI_ROADMAP_MODELS = LITE_MODELS[:2]
settings.GEMINI_MENTOR_MODELS = ["gemini-3.5-flash-lite", "gemini-2.5-flash-lite"]
settings.GEMINI_LIGHT_MODELS = LITE_MODELS

# Testing-only quota overrides (see module docstring: nothing to restore).
settings.MENTOR_MAX_PER_MINUTE = 1000
settings.MENTOR_MAX_PER_DAY = 1000
settings.MENTOR_MAX_PER_CONVERSATION = 1000
settings.MENTOR_MAX_NEW_CONVERSATIONS_PER_DAY = 1000
settings.RESUME_MAX_NEW_UPLOADS_PER_DAY = 1000
settings.PLANNER_DAILY_AI_PER_DAY = 1000
settings.PLANNER_WEEKLY_AI_PER_DAY = 1000
settings.ROADMAP_GENERATIONS_PER_DAY = 1000
settings.GLOBAL_RATE_LIMIT_PER_MINUTE = 0

print("[bootstrap_ai] GEMINI_API_KEY = <real key, redacted, length %d>" % len(_REAL_KEY))
print(f"[bootstrap_ai] lite-only models: {LITE_MODELS}")
print("[bootstrap_ai] per-user AI quotas raised for this process only — nothing committed was changed")
