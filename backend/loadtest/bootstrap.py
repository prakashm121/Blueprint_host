"""
bootstrap.py — Load-test harness bootstrap. Import this FIRST, before `app` or `main`,
in every other script in this directory (seed.py, server_entry.py).

What it does, in order:

  1. Forces every DB / Supabase / Gemini connection setting to a local, disposable
     value — regardless of what's in backend/.env — so this harness can never reach
     the real production database, the real Supabase project, or the real Gemini API.
     (python-dotenv's load_dotenv(), called inside app.core.config, never overrides
     an env var that's already set in the process — so setting these here, before
     `app` is imported, wins over whatever backend/.env contains.)

  2. Patches the two Postgres-only column types used by the models (ARRAY, JSONB)
     so the schema can be created on SQLite, purely for this process. The real,
     committed model files (app/models/hub.py, app/models/resume.py) are never
     touched on disk.

  3. Asserts afterwards that app.core.config.settings actually picked up the local
     values — a hard stop if anything leaked through.
"""
import os
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
BACKEND_DIR = HERE.parent
DB_PATH = HERE / "data" / "loadtest.db"
STUB_PORT = 8977

DB_PATH.parent.mkdir(parents=True, exist_ok=True)

# --------------------------------------------------------------------------- 1
os.environ["DATABASE_URL"] = f"sqlite:///{DB_PATH.as_posix()}"
os.environ["SUPABASE_URL"] = f"http://127.0.0.1:{STUB_PORT}"
os.environ["SUPABASE_JWT_SECRET"] = "loadtest-not-a-real-secret"
os.environ["SUPABASE_ANON_KEY"] = "loadtest-anon-key"
os.environ["GEMINI_API_KEY"] = "loadtest-dummy-key-never-used"
os.environ["REDIS_URL"] = ""          # force the in-memory cache fallback, no external Redis needed
os.environ["CELERY_BROKER_URL"] = ""
os.environ["APP_ENV"] = "development"
os.environ["FRONTEND_URL"] = "http://127.0.0.1:5199"
os.environ["INTERNAL_TRIGGER_SECRET"] = "loadtest-internal-secret"
# Capacity runs set this explicitly before importing bootstrap; default to "disabled"
# so a plain `python -m loadtest.seed` run doesn't trip the flood guard while seeding.
os.environ.setdefault("GLOBAL_RATE_LIMIT_PER_MINUTE", "0")

if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

# --------------------------------------------------------------------------- 2
import sqlalchemy.dialects.postgresql as _pg  # noqa: E402
from sqlalchemy import JSON as _JSON  # noqa: E402
from sqlalchemy.types import TypeDecorator as _TypeDecorator  # noqa: E402


class _SqliteArray(_TypeDecorator):
    """Stand-in for postgresql.ARRAY on SQLite: stores the list as JSON instead."""

    impl = _JSON
    cache_ok = True

    def process_bind_param(self, value, dialect):
        return list(value) if value is not None else []

    def process_result_value(self, value, dialect):
        return value if value is not None else []


def _array_stub(*_args, **_kwargs):
    return _SqliteArray()


_pg.ARRAY = _array_stub
_pg.JSONB = _JSON

# --------------------------------------------------------------------------- 3
from app.core.config import settings  # noqa: E402

assert settings.DATABASE_URL.startswith("sqlite:///"), (
    f"Refusing to continue: DATABASE_URL is {settings.DATABASE_URL!r}, not the local "
    "load-test SQLite file. This harness must never run against a real database."
)
assert "supabase.co" not in settings.SUPABASE_URL, (
    f"Refusing to continue: SUPABASE_URL is {settings.SUPABASE_URL!r}, which looks like "
    "a real Supabase project, not the local stub."
)

print(f"[bootstrap] DATABASE_URL = {settings.DATABASE_URL}")
print(f"[bootstrap] SUPABASE_URL = {settings.SUPABASE_URL}")


def strip_postgres_only_indexes() -> None:
    """
    Drop the two full-text-search indexes (`to_tsvector(...)`) on dsa_problems and
    interview_questions. SQLite doesn't have to_tsvector, so create_all() would fail
    without this. Neither index is used by the query paths this harness exercises —
    list_coding_problems/list_interview_questions filter with .contains()/.any()/
    .ilike(), never the FTS index — so removing them changes nothing about what's
    being tested, only the DDL that would otherwise fail to create on SQLite.
    """
    import app.models  # noqa: F401  (registers every table on Base.metadata)
    from app.db.session import Base

    targets = [("dsa_problems", "idx_dsa_search"), ("interview_questions", "ix_iq_fts")]
    for table_name, index_name in targets:
        table = Base.metadata.tables.get(table_name)
        if table is None:
            continue
        for idx in list(table.indexes):
            if idx.name == index_name:
                table.indexes.remove(idx)
                print(f"[bootstrap] dropped Postgres-only index {index_name} on {table_name} (SQLite only)")
