# Blueprint — Backend

FastAPI service powering the Blueprint placement-prep platform: Supabase-authenticated API, an AI Gateway wrapping Gemini for resume analysis / mentor chat / roadmap generation, a Postgres-backed Interview Hub (DSA + Q&A + quiz content), and a single-purpose Celery worker for the one job that's actually slow (resume analysis).

---

## Table of contents

- [Tech stack](#tech-stack)
- [Architecture](#architecture)
- [Project structure](#project-structure)
- [Quick start — local dev](#quick-start--local-dev)
- [Environment variables](#environment-variables)
- [Database & models](#database--models)
- [API overview](#api-overview)
- [AI Gateway](#ai-gateway)
- [Background jobs](#background-jobs)
- [Caching](#caching)
- [Rate limiting](#rate-limiting)
- [Security](#security)
- [Interview Hub content bank](#interview-hub-content-bank)
- [Deployment](#deployment)
- [Known gaps / tech debt](#known-gaps--tech-debt)

---

## Tech stack

| Layer | Technology | Notes |
|---|---|---|
| API framework | FastAPI + Uvicorn | |
| ORM | SQLAlchemy 2.x | |
| Database | PostgreSQL (via Supabase) | |
| Migrations | Alembic | 13 migrations in `alembic/versions/` |
| Auth | Supabase (Google OAuth) | verified server-side by calling Supabase's own `/auth/v1/user` API — no local password/JWT-issuing flow |
| Cache / Celery broker | Redis (Upstash-compatible) | dual-purpose: Celery broker **and** app-level response cache |
| Background tasks | Celery (worker only — **no Beat**) | one task: resume analysis |
| AI | Google Gemini, via `google-genai` SDK | wrapped by a single `AIGateway` (`app/ai/gateway.py`) used by resume/mentor/roadmap |
| PDF parsing | `pdfminer.six` | resume text extraction |

Dependencies are deliberately minimal: `passlib` and `python-jose` (leftovers from an earlier local-JWT design) were removed — user metadata now comes from Supabase's verified response, so no JWT library is needed. Versions in `requirements.txt` use `>=` floors with no lockfile (see [Known gaps](#known-gaps--tech-debt)).

---

## Architecture

```
                    Supabase (Postgres + Auth)
                    ▲                    ▲
                    │ session verify     │ reads/writes
                    │                    │
  Vercel (React) ──▶│  FastAPI (main.py) │──▶ Gemini API (via app/ai/gateway.py)
                    │  ┌──────────────┐  │
                    │  │ Celery worker│  │──▶ Redis (Upstash) — broker + app cache
                    │  │ (resume task │  │
                    │  │  only)       │  │
                    │  └──────────────┘  │
                    └────────────────────┘
                             ▲
                             │ hourly HTTPS POST, shared-secret header
                    GitHub Actions (.github/workflows/planner-reminders.yml)
```

- **Auth**: the frontend authenticates entirely through Supabase (Google OAuth). The backend never issues its own tokens — `app/api/deps.py` takes the Supabase access token from the `Authorization: Bearer` header only (cookie auth was removed), verifies it by calling Supabase's own API (5s timeout), and JIT-provisions a local `User`/`Profile` row on first sight. Verified tokens are cached for **60 seconds** (keyed by a hash of the token), so sign-out or revocation in Supabase takes effect within a minute. An existing local account is only linked by email if Supabase reports the email as confirmed. `app/api/auth.py` only exposes `GET /me`.
- **No Celery Beat.** There used to be one; it was removed. The only Celery task left is resume analysis (`process_resume_task`, dispatched via `.delay()` from `POST /resume/upload`) because it's the one job that's genuinely slow (a Gemini call that can take up to 120s) and shouldn't block an HTTP request. The one genuine periodic job — hourly planner-reminder scanning — is triggered by a GitHub Actions scheduled workflow hitting `POST /api/v1/internal/scan-planner-reminders` (guarded by a shared-secret header), which runs synchronously and writes notifications directly — no queue involved.
- **AI Gateway** (`app/ai/gateway.py`) is the single point every Gemini call goes through — model-fallback chains per task type, structured-output schema enforcement via Pydantic, retry/failover on 404/429/503.
- **Rate limiting** (`app/core/rate_limit.py`) protects every Gemini-backed feature plus a per-IP flood guard on the whole API — see [Rate limiting](#rate-limiting).

---

## Project structure

```
backend/
├── main.py                         # FastAPI app entry point, router registration
├── start.sh                        # uvicorn + celery worker (no beat)
├── requirements.txt
├── .env.example                    # currently stale — see Known gaps
├── scratch_seed_data.py            # one-off seed script for the Interview Hub tables
│
├── alembic/versions/                # 13 migrations
│
├── app/
│   ├── api/
│   │   ├── deps.py                 # get_current_user() — Supabase token verification + JIT provisioning
│   │   ├── auth.py                 # GET /me only
│   │   ├── profile.py              # GET/PATCH profile
│   │   ├── onboarding.py           # role/skills/goals wizard, triggers roadmap generation
│   │   ├── planner.py              # weekly plans + tasks
│   │   ├── roadmap.py              # role roadmap + milestones
│   │   ├── mentor.py               # AI mentor conversations (SSE streaming)
│   │   ├── hub.py                  # DSA problems, interview Q&A, quiz — content + progress
│   │   ├── vault.py                # knowledge vault items
│   │   ├── assessments.py          # self-rated subject confidence
│   │   ├── notifications.py        # in-app notification feed
│   │   ├── resume.py               # resume upload (async) + history
│   │   └── internal.py             # shared-secret-protected cron-trigger endpoint
│   │
│   ├── models/                     # one SQLAlchemy model file per domain — see Database & models
│   │
│   ├── ai/
│   │   └── gateway.py              # AIGateway — the only place that calls Gemini
│   │
│   ├── prompts/                    # LLM prompt builders, one package per feature
│   │   ├── mentor/                 # mentor.py, teacher.py
│   │   ├── resume/                 # analyzer.py
│   │   └── roadmap/                # roadmap_prompts.py
│   │
│   ├── services/
│   │   ├── context_builder.py      # builds AI prompt context from user data
│   │   ├── notification_service.py # creates in-app Notification rows
│   │   ├── mentor/                 # service.py, classifier.py
│   │   ├── resume/                 # service.py, analyzer.py, extractor.py, schemas.py
│   │   └── roadmap/                # service.py, schemas.py
│   │
│   ├── workers/
│   │   ├── celery_app.py           # Celery app — broker/backend config only, no Beat
│   │   ├── tasks/ai_tasks.py       # process_resume_task (the only registered task)
│   │   ├── scheduler_jobs.py       # scan_due_planner_tasks() — now HTTP-triggered, not Celery-scheduled
│   │   ├── outbox.py               # transactional outbox — kept but currently unused (0 callers)
│   │   ├── handlers.py             # outbox event handlers — dormant, same reason
│   │   └── event_types.py          # outbox event type constants — dormant, same reason
│   │
│   ├── core/
│   │   ├── config.py               # Settings (env vars)
│   │   ├── cache.py                # get_cache/set_cache/delete_cache (Redis)
│   │   ├── rate_limit.py           # burst/daily limiters + per-IP flood-guard middleware
│   │   └── role_skills.py          # static role → skill taxonomy
│   │
│   └── db/session.py                # SessionLocal, Base, get_db, init_db
│
└── csv/                             # seed data for the Interview Hub (git-ignored in spirit, present here)
    ├── seed_interview_questions_clean.csv
    ├── seed_quiz_questions.csv
    └── ultimate_master_coding_questions.csv
```

---

## Quick start — local dev

Requires PostgreSQL (or a Supabase project) and Redis.

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
# fill in DATABASE_URL, REDIS_URL, GEMINI_API_KEY, SUPABASE_URL, SUPABASE_JWT_SECRET
# (.env.example itself is stale — see Environment variables below for the real list)
alembic upgrade head
uvicorn main:app --reload
```

- API: http://localhost:8000
- Swagger docs: http://localhost:8000/docs (disabled when `APP_ENV=production`)

The Celery worker is **only** needed if you're testing resume upload locally:

```powershell
celery -A app.workers.celery_app worker --loglevel=info --pool=solo --without-gossip --without-mingle --without-heartbeat
```

There is no Celery Beat process to run anymore. To test the planner-reminder scan locally, call the internal endpoint directly:

```powershell
curl -X POST http://localhost:8000/api/v1/internal/scan-planner-reminders -H "X-Internal-Secret: <your INTERNAL_TRIGGER_SECRET>"
```

No Dockerfile or `docker-compose.yml` exists in this repo — local dev is native (venv + your own Postgres/Redis), and deployment is a single Render Web Service via `start.sh`. See [Deployment](#deployment).

---

## Environment variables

The real list, read from `app/core/config.py` (`.env.example` in the repo is out of date — see [Known gaps](#known-gaps--tech-debt)):

```env
APP_ENV=development              # set to `production` on Render: disables /docs, /redoc and /openapi.json
SECRET_KEY=                      # unused for auth (Supabase handles that); random per-process default if unset
DATABASE_URL=postgresql+psycopg://user:pass@host:5432/db
FRONTEND_URL=http://localhost:5173   # CORS allow-origin

# Supabase (auth)
SUPABASE_URL=
SUPABASE_JWT_SECRET=
SUPABASE_ANON_KEY=              # optional: publishable key for the server-side token check (has a built-in default)

# Gemini
GEMINI_API_KEY=
GEMINI_TEMPERATURE=0.7
GEMINI_MAX_TOKENS=8192
GEMINI_TOP_P=0.95
GEMINI_TOP_K=40
GEMINI_CONCURRENCY=10
GEMINI_REQUEST_TIMEOUT=120.0

# Redis / Celery
REDIS_URL=redis://localhost:6379/0
CELERY_BROKER_URL=               # optional — falls back to REDIS_URL if unset
WORKER_MODE=celery

# Internal cron trigger (GitHub Actions → /internal/scan-planner-reminders)
INTERNAL_TRIGGER_SECRET=

# Rate limits — all optional, defaults shown. "Day" = IST calendar day.
GLOBAL_RATE_LIMIT_PER_MINUTE=600          # per IP; 0 disables
MENTOR_MAX_PER_MINUTE=6
MENTOR_MAX_PER_DAY=60
MENTOR_MAX_PER_CONVERSATION=40
MENTOR_MAX_NEW_CONVERSATIONS_PER_DAY=30
MENTOR_MAX_MESSAGE_CHARS=4000
RESUME_MAX_NEW_UPLOADS_PER_DAY=1
PLANNER_DAILY_AI_PER_DAY=6
PLANNER_WEEKLY_AI_PER_DAY=5
ROADMAP_GENERATIONS_PER_DAY=5

# Outbox tuning (currently unused — outbox pattern is dormant, see Known gaps)
OUTBOX_BATCH_SIZE=50
OUTBOX_MAX_ATTEMPTS=5
```

---

## Database & models

```bash
alembic upgrade head
```

| Model | Table | Purpose |
|---|---|---|
| `User` | `users` | Supabase-linked account row (JIT-provisioned on first login) |
| `Profile` | `profiles` | Name, college, target role, socials |
| `UserSkillAssessment` | `user_skill_assessments` | Self-rated confidence per skill |
| `DashboardStatistics` | `dashboard_statistics` | Denormalised readiness snapshot |
| `WeeklyPlan` / `PlannerTask` | `weekly_plans` / `planner_tasks` | Weekly prep plan and its tasks |
| `RoleRoadmap` / `RoadmapMilestone` | `role_roadmaps` / `roadmap_milestones` | AI-generated role-specific roadmap |
| `MentorConversation` / `MentorMessage` | `mentor_conversations` / `mentor_messages` | AI mentor chat history |
| `DSAProblem` | `dsa_problems` | Coding problems (Interview Hub) |
| `InterviewQuestion` | `interview_questions` | Open-ended interview Q&A |
| `QuizQuestion` | `quiz_questions` | MCQ bank |
| `UserCodingProgress` / `UserQuizSession` | `user_coding_progress` / `user_quiz_sessions` | Per-user solve/attempt tracking |
| `VaultItem` | `vault_items` | Bookmarks, AI insights, personal notes |
| `Notification` | `notifications` | In-app notification feed |
| `ResumeAnalysis` | `resume_analyses` | Resume upload + AI feedback + audit trail (`model`, `prompt_version`, `scoring_version`) |
| `OutboxEvent` | `outbox_events` | Transactional outbox — table exists, currently has zero writers (see Known gaps) |

---

## API overview

All routes are prefixed `/api/v1/`.

**Auth & profile**
| Method | Path | Description |
|---|---|---|
| `GET` | `/auth/me` | Current user info (JIT-provisioned from the verified Supabase session) |
| `GET` / `PATCH` | `/profile` | Get / update profile |

**Onboarding & assessments**
| Method | Path | Description |
|---|---|---|
| `GET` | `/onboarding/catalog` | Assessment catalog |
| `GET` | `/onboarding/role-skills-catalog` | Skills list per target role |
| `GET` | `/onboarding/status` | Onboarding progress |
| `POST` | `/onboarding/role-skills` | Submit role + skills step |
| `POST` | `/onboarding/goals` | Submit goals step |
| `POST` | `/onboarding/generate-roadmap` | AI roadmap generation (synchronous), finalizes onboarding |
| `GET` / `PATCH` | `/assessments/subjects` | Self-rated subject confidence |

**Planner & roadmap**
| Method | Path | Description |
|---|---|---|
| `POST` | `/planner/daily` | Generate/fetch daily breakdown |
| `GET` | `/planner/plans` | Active weekly plan |
| `POST` | `/planner/plans` | Create weekly plan (AI-generated) |
| `POST` | `/planner/plans/{plan_id}/tasks` | Add task |
| `PATCH` | `/planner/tasks/{task_id}` | Update task (completing one sets `completed_at` directly) |
| `DELETE` | `/planner/tasks/{task_id}` | Delete task |
| `GET` | `/roadmap` | Get role roadmap |
| `PATCH` | `/roadmap/milestones/{id}` | Update milestone status |

**Interview Hub**
| Method | Path | Description |
|---|---|---|
| `GET` | `/hub/coding`, `/hub/coding/{id}` | DSA problem list / detail |
| `GET` | `/hub/interview`, `/hub/interview/{id}` | Q&A list / detail |
| `GET` | `/hub/quiz` | MCQ list |
| `POST` | `/hub/quiz/attempt` | Submit quiz attempt |
| `GET` | `/hub/stats/quiz`, `/hub/stats/dsa` | Per-user stats |
| `GET` / `POST` | `/hub/coding/{id}/progress` | Get / mark solve progress |

**AI Mentor**
| Method | Path | Description |
|---|---|---|
| `GET` / `POST` | `/mentor/conversations` | List / create conversations |
| `GET` | `/mentor/conversations/{id}` | Conversation detail |
| `POST` | `/mentor/conversations/{id}/stream` | SSE-streamed AI reply |
| `POST` | `/mentor/message` | Legacy non-streaming send |

**Vault, notifications, resume**
| Method | Path | Description |
|---|---|---|
| `GET` / `POST` / `DELETE` | `/vault`, `/vault/{id}` | Knowledge vault CRUD |
| `GET` | `/notifications/unread-count`, `/notifications` | Notification feed |
| `PATCH` / `POST` | `/notifications/{id}/read`, `/notifications/read-all` | Mark read |
| `POST` | `/resume/upload` | Same file as an earlier upload → returns that analysis (`reused: true`, free). New file → 202, enqueues `process_resume_task`; limited to 1 new analysis/day. Poll `GET /resume/{id}` for status |
| `GET` | `/resume/history`, `/resume/{analysis_id}` | Resume analysis history / detail |

**Internal / ops**
| Method | Path | Description |
|---|---|---|
| `POST` | `/internal/scan-planner-reminders` | Shared-secret-protected; runs the planner-reminder scan on demand (GitHub Actions calls this hourly) |
| `GET` | `/status/workers` | Outbox backlog stats — requires login (will always show 0 — see Known gaps) |
| `GET` | `/health` | Liveness check |

---

## AI Gateway

Every Gemini call in the backend goes through `app.ai.gateway.ai_gateway` (`AIGateway.generate()` / `.generate_stream()`), used by the resume, mentor, and roadmap services. Per task type (`resume_analysis`, `mentor_response`/`teacher_response`, `roadmap_generation`, etc.) it:

1. Picks a model-fallback chain from `Settings` (e.g. `GEMINI_RESUME_MODELS`) and tries each in order, skipping 404s outright and failing over immediately on 429/503.
2. When called with a Pydantic `schema`, passes it as `response_schema` so Gemini's structured-output mode actually constrains the JSON shape (not just a prompt instruction) — validates the response against the schema and raises `AIValidationError` on mismatch, with the real error surfaced rather than swallowed.
3. Caps concurrency via `asyncio.Semaphore(GEMINI_CONCURRENCY)`.

For resume analysis specifically: the AI returns per-section and per-ATS-factor scores only — the final `ats_score` is computed deterministically in Python (`ResumeFeedback.compute_score()` in `app/services/resume/schemas.py`), a fixed weighted sum, never trusted from the model directly.

---

## Background jobs

**Celery worker** (no Beat) runs exactly one task: `process_resume_task` — extracts PDF text, calls the AI Gateway, writes the result, with dedup-by-file-hash. Dispatched via `.delay()` from `POST /resume/upload`.

**Planner reminders** (the one genuinely time-based job) run via an external trigger instead of Celery Beat: a GitHub Actions scheduled workflow (`.github/workflows/planner-reminders.yml`, hourly) calls `POST /api/v1/internal/scan-planner-reminders`, which runs `scan_due_planner_tasks()` synchronously — no queue, no async indirection, since it's just a DB scan + a handful of `Notification` inserts.

**The transactional outbox** (`app/workers/outbox.py`, `OutboxEvent` model, `handlers.py`, `event_types.py`) still exists but has **zero callers** — it was bypassed in favor of writing notifications directly, since the side effect was always a same-DB insert with no external dependency (no email is actually sent — see Known gaps). Left in place deliberately in case a future feature needs genuine at-least-once delivery around an external call (e.g. real email).

---

## Caching

Redis serves two roles simultaneously — it's not just the Celery broker:

| Redis key | TTL | Used by |
|---|---|---|
| Hub content lists/detail | minutes–hours | `app/api/hub.py` |
| Vault responses | 300s | `app/api/vault.py` |
| Per-day AI quota counters (planner, roadmap) | until IST midnight | `app/core/rate_limit.py` |
| AI context / interview-question cache | 300s–43200s | `app/services/context_builder.py` |

All cache access goes through `app/core/cache.py`.

---

## Rate limiting

All limits live in `app/core/rate_limit.py` and are configurable via env vars (see [Environment variables](#environment-variables)). A "day" resets at **midnight IST**. Every rejection is an HTTP `429` with a human-readable `detail` and a `Retry-After` header (and still carries CORS headers, so the browser can read it).

| Feature | Limit | Counted from |
|---|---|---|
| Mentor — per conversation ("session") | 40 messages, then "start a new conversation" | `mentor_messages` table |
| Mentor — per day | 60 messages per user | `mentor_messages` table |
| Mentor — burst | 6 messages / minute | in memory |
| Mentor — misc | 30 new conversations/day; message ≤ 4,000 chars; `seed_context` ≤ 8 KB; `model_override` must be in the configured mentor model list (otherwise ignored) | DB / request validation |
| Resume upload | **Same file (same hash) as an existing analysis → returns that analysis, no AI call, no quota used.** A genuinely new file → 1 per day. Failed analyses don't count. Burst: 5 uploads / minute | `resume_analyses` table |
| Daily planner (Gemini) | 6 generations/day (cache hits are free) | Redis, in-memory fallback |
| Weekly planner (Gemini) | 5/day | Redis, in-memory fallback |
| Roadmap generation (Gemini) | 5/day | Redis, in-memory fallback |
| Whole API | 600 requests / minute / IP (`/health` and the internal cron endpoint are exempt) | in memory |

Design notes:
- **Redis usage is deliberately tiny** (Upstash free tier = 500K commands/month): mentor and resume quotas are counted from tables that already exist, and burst limits are in-memory. Only the planner/roadmap daily counters touch Redis.
- In-memory counters are per-process and reset when the free-tier instance sleeps or restarts. That's fine for short bursts; every *daily* quota uses the database or Redis.
- The per-IP guard is generous on purpose: many students can share one public IP on a campus network, so per-user limits do the real fairness work.
- The middleware is pure ASGI (not `BaseHTTPMiddleware`) so SSE streaming is untouched, and it is registered before CORS so CORS stays outermost.

---

## Security

Behaviours worth knowing about (verified in code):

- **Auth**: bearer token only; 60s verified-token cache; generic error messages (no internals leaked to clients, no token claims logged); email-based account linking requires a confirmed email.
- **Authorization**: every ID-based endpoint filters by the current user (roadmap `GET`/`PATCH` were fixed to do so — previously any user could read the newest roadmap and edit any milestone).
- **Resume upload**: `.pdf` name + `%PDF-` magic-byte check, body read capped at 5 MB + 1 byte (not fully buffered first), sanitised filename, Celery task hard time limit (180s).
- **Profile input**: max lengths match DB column sizes; `linkedin_url`/`avatar_url` must start with `http(s)://` (blocks `javascript:` URLs).
- **Transport**: Redis connections (Celery broker and cache) verify TLS certificates (`CERT_REQUIRED`).
- **Internal endpoint**: `X-Internal-Secret` compared in constant time (`hmac.compare_digest`); fails closed with 503 if the secret isn't configured.
- **Surface**: `/docs`, `/redoc`, `/openapi.json` are disabled when `APP_ENV=production`; `/status/workers` requires login.
- **CI**: the GitHub workflow declares `permissions: {}` and passes secrets through `env:`.

---

## Interview Hub content bank

~43,000 rows across three tables, seeded from CSVs in `backend/csv/` by `backend/scratch_seed_data.py`:

| Table | Rows | Contents |
|---|---|---|
| `dsa_problems` | 3,632 | Coding problems, full content + code snippets |
| `interview_questions` | 33,807 | Open-ended Q&A across category/skill/role |
| `quiz_questions` | 5,816 | MCQs, 4 options + correct answer |

The seed script checks `count() == 0` before writing, so it's safe to re-run, but **it currently hardcodes an old repo path** (`E:\WebSite\Blueprint\backend\...`, missing the `_host` suffix this repo actually has) — it needs a path fix before it'll run here. See [Known gaps](#known-gaps--tech-debt).

---

## Deployment

One Render free Web Service running `start.sh` (`uvicorn` + Celery worker, no Beat). No Dockerfile, `docker-compose.yml`, or `render.yaml` exist in this repo — the service is configured directly in the Render dashboard (root directory `backend`, build `pip install -r requirements.txt`, start `bash start.sh`).

Set `APP_ENV=production` on Render (turns off the interactive API docs). Redis is Upstash (free tier). The hourly planner-reminder scan is triggered by GitHub Actions, not a second always-on service — see `.github/workflows/planner-reminders.yml` at the repo root. It needs two repo secrets (`RENDER_APP_URL` — no trailing slash — and `INTERNAL_TRIGGER_SECRET`, identical to the Render env var) and retries the call for a few minutes, because the free-tier service is usually asleep at the top of the hour.

---

## Known gaps / tech debt

Documented honestly rather than silently glossed over:

- **`.env.example` is stale.** It still lists `SMTP_*`, `APP_ROLE`, `WORKER_MODE=embedded/arq`, and `SCHEDULER_ENABLED` from an earlier design, and is missing `SUPABASE_URL`, `SUPABASE_JWT_SECRET`, `INTERNAL_TRIGGER_SECRET`, `APP_ENV` and the rate-limit variables, which the app actually reads. Use the [Environment variables](#environment-variables) section above, not this file, until it's synced.
- **The outbox pattern is dead code by design** (see [Background jobs](#background-jobs)) — the table, handlers, and event types are kept for a future real external-delivery use case, but nothing writes to `OutboxEvent` today. `GET /status/workers` will report an empty backlog forever until that changes.
- **No email is actually sent anywhere.** Despite `SMTP_*` vars existing in `.env.example`, there is no email-sending code in the codebase. All "notifications" are in-app only (`Notification` rows).
- **`scratch_seed_data.py` hardcodes a stale absolute path** to a differently-named clone of this repo — fix the path before relying on it to seed a fresh environment.
- **Supabase publishable key has a built-in default** in `app/core/config.py` (`SUPABASE_ANON_KEY`) so existing deployments keep working. It's a public-by-design key, but set `SUPABASE_ANON_KEY` explicitly per environment (staging vs prod) and drop the default.
- **Resume PDF bytes travel through the Redis/Celery broker** to the worker. Fine at this scale; storing the file (e.g. Supabase Storage) and passing only a reference would be cleaner.
- **No dependency lockfile.** `requirements.txt` uses `>=` floors, so builds aren't fully reproducible. Pin with `pip-compile` or a hashed lockfile before scaling up.
- **Row-level security must be verified in Supabase.** The frontend reads many tables directly with the public key; only 5 tables have RLS policies defined in this repo's migrations. Check the Supabase Security Advisor to confirm the rest are protected.
- **Not yet rate-limited per user:** hub search and quiz/progress writes (covered only by the per-IP guard), and the number of simultaneous open mentor streams.
