# Load testing harness

A self-contained Locust harness that exercises the real backend code (`main.py`, unmodified) against a local, disposable copy of the stack — never the production database, Supabase project, or Render deployment. See [`backend/README.md`](../README.md#load-testing) for the results this produced.

## Why local, not production

- The global flood guard (`GLOBAL_RATE_LIMIT_PER_MINUTE=600`, per-IP) would just return 429s from one test machine's IP, measuring the guard instead of the app.
- Auth verification calls real Supabase per uncached token; load-testing that burns Supabase's own quota.
- It's the database real users are on. A test that's explicitly trying to find the breaking point has no business running against production.

## How it works

1. **`bootstrap.py`** — imported first by every other script. Forces `DATABASE_URL` to a local SQLite file, `SUPABASE_URL` to a local stub, and a dummy `GEMINI_API_KEY`, *before* `app.core.config` is imported — `python-dotenv`'s `load_dotenv()` never overrides an already-set env var, so these win over `backend/.env` regardless of what's in it. It then patches the two Postgres-only column types (`ARRAY`, `JSONB`) used in `app/models/hub.py` and `app/models/resume.py` so SQLite can create the schema — done by substituting the `sqlalchemy.dialects.postgresql.ARRAY`/`JSONB` symbols before those model files are imported, never touching the committed files on disk. Asserts afterwards that `settings.DATABASE_URL`/`SUPABASE_URL` really are the local ones, as a hard stop if anything leaked through.
2. **`supabase_stub.py`** — a minimal stdlib HTTP server standing in for Supabase's `GET /auth/v1/user`, so the real `get_current_user` code path (token cache, JIT user provisioning) runs unmodified, without a single request reaching the real Supabase project.
3. **`seed.py`** — builds the local database from the **real seed CSVs** in `backend/csv/` (same files, same parsing logic as `scratch_seed_data.py`): all 3,632 coding problems, ~5,700 quiz questions, ~34,000 interview questions. Adds 25 synthetic test users with profiles, an active weekly plan, a 10-milestone roadmap, notifications, and vault bookmarks. Writes `data/tokens.json` (bearer token → fake Supabase user, consumed by the stub) and `data/seed_summary.json` (real IDs/topics/companies, so Locust's filters hit non-empty results like a real user picking from a dropdown).
4. **`server_entry.py`** — runs `uvicorn main:app` exactly as `start.sh` does, just pointed at the local SQLite file via `bootstrap.py`.
5. **`locustfile.py`** — the load profile, weighted to match what the frontend actually calls (checked file-by-file against `src/pages`, not guessed): Tier 1 reads (dashboard bundle, browsing problems/questions) dominate; Tier 2 writes (marking progress, bookmarking, notifications) are rarer. No AI/Gemini-backed endpoint is included — see below.

Run it yourself:

```bash
cd backend
.venv/Scripts/python.exe -m loadtest.seed                       # build the local DB (~30s)
.venv/Scripts/python.exe -m loadtest.supabase_stub 8977 &        # auth stub
GLOBAL_RATE_LIMIT_PER_MINUTE=0 .venv/Scripts/python.exe -m loadtest.server_entry 8800 &
.venv/Scripts/locust -f loadtest/locustfile.py --host http://127.0.0.1:8800 \
    --headless --users 200 --spawn-rate 25 --run-time 2m --csv loadtest/results/run
.venv/Scripts/python.exe -m loadtest.make_charts
```

## Two endpoints excluded from the capacity test, and why

`GET /hub/stats/dsa` and `POST /planner/daily` both crash in this harness — confirmed as a SQLite-only gap, not a reachable production bug:

- **`/hub/stats/dsa`**: does `cast(UserCodingProgress.created_at, Date)` at the SQL level for its streak calculation. That's a standard, correct cast on Postgres; SQLite has no real `DATE` type (it's dynamically typed), so the cast comes back as something SQLAlchemy's SQLite result-processor can't parse as a date.
- **`/planner/daily`**: its context builder compares `PlannerTask.due_date` (`DateTime(timezone=True)`) against an aware "now". SQLite's `DateTime(timezone=True)` doesn't actually preserve tzinfo on round-trip — values come back naive. Confirmed by reading every write path to `due_date` in `app/api/planner.py`: all of them construct it tz-aware, so this can't happen on the real Postgres database.

Both are excluded from `locustfile.py`'s weighted mix rather than worked around, to avoid widening the harness's SQLite type-patching to every datetime column app-wide for the sake of two endpoints.

## The AI-endpoint test (`locustfile_ai.py`, `bootstrap_ai.py`)

A **separate**, deliberately small and slow profile for the real AI-backed endpoints (mentor chat, roadmap generation, weekly/daily plan generation) — these make real, billed Gemini API calls, restricted to the lite model tier (`gemini-3.5/3.1/2.5-flash-lite`).

Every per-user AI quota (`MENTOR_MAX_PER_MINUTE`, `PLANNER_WEEKLY_AI_PER_DAY`, etc.) is read from `app.core.config.settings` at the moment each request is handled — confirmed by reading every call site in `app/api/{mentor,planner,onboarding}.py`. Nothing is hardcoded or patched in any committed file. `bootstrap_ai.py` only mutates the in-memory `settings` singleton of that one test process — the same non-invasive pattern `bootstrap.py` uses for the SQLite type patches — and reads the real `GEMINI_API_KEY` from `backend/.env` directly (never written anywhere else, never logged). **There is nothing to revert**: once the process exits, the real app reads its real values again, completely unaffected.

Run with real cost awareness — few users, long think-time, short duration:

```bash
cd backend
GEMINI_API_KEY=... .venv/Scripts/python.exe -m loadtest.server_entry_ai 8801 &
.venv/Scripts/locust -f loadtest/locustfile_ai.py --host http://127.0.0.1:8801 \
    --headless --users 5 --spawn-rate 5 --run-time 90s --csv loadtest/results/ai_run
.venv/Scripts/python.exe -m loadtest.make_chart_ai
```

## What this test does *not* tell you

- **Render's actual free-tier ceiling.** This runs on a dev machine, which very likely has more CPU/RAM than Render's free tier. Treat the numbers here as the *application's* ceiling, not Render's exact number.
- **Real Supabase/network latency.** The auth stub and SQLite file are both local — no network round-trip, unlike the real Supabase Postgres connection.
- **Write-heavy behavior under extreme concurrency**, accurately. SQLite serializes writers; the real Postgres connection pool (`pool_size=50, max_overflow=150` in `app/db/session.py`) does not. See `backend/README.md` for where this shows up in the results.
