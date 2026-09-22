# Blueprint — Backend

A FastAPI backend powering a full-stack placement preparation platform. Handles auth, onboarding, AI-generated weekly plans, an interview hub (DSA + Q&A + Quiz), AI mentor chat, a knowledge vault, and a notification/outbox system.

---

## Table of contents

- [Tech stack](#tech-stack)
- [Project structure](#project-structure)
- [Quick start — local dev](#quick-start--local-dev)
- [Running all three processes](#running-all-three-processes)
- [Environment variables](#environment-variables)
- [Database](#database)
- [Data pipeline — Interview Hub](#data-pipeline--interview-hub)
- [Background workers](#background-workers)
- [API overview](#api-overview)
- [Caching strategy](#caching-strategy)

---

## Tech stack

| Layer | Technology |
|---|---|
| API framework | FastAPI + Uvicorn |
| ORM | SQLAlchemy 2.x |
| Database | PostgreSQL |
| Migrations | Alembic |
| Cache / broker | Redis (Upstash-compatible) |
| Background tasks | Celery + Celery Beat |
| AI Mentor | Google Gemini API |
| Email | SMTP (configurable) with transactional outbox |
| Auth | JWT (access + refresh tokens) |

---

## Project structure

```
backend/
├── main.py                         # FastAPI app entry point
├── seed_hub.py                     # Seeds DSA + Interview + Quiz tables
├── requirements.txt
├── .env.example
│
├── alembic/
│   ├── env.py
│   ├── script.py.mako
│   └── versions/
│       ├── 16a3e612d75c_create_users_table.py
│       ├── efae8c76bf9c_create_profiles_table.py
│       ├── d092f448052f_add_stateful_conversation_fields.py
│       └── ... (10 migrations total)
│
├── app/
│   ├── api/
│   │   ├── deps.py                 # get_current_user, get_db
│   │   ├── auth.py                 # register, login, verify-email, refresh
│   │   ├── onboarding.py           # target role, companies, skill assessment
│   │   ├── profile.py              # GET + PATCH /profile
│   │   ├── dashboard.py            # GET /dashboard/summary
│   │   ├── planner.py              # weekly plans + tasks
│   │   ├── hub.py                  # DSA problems, Interview Q&A, Quiz MCQ
│   │   ├── mentor.py               # AI mentor/teacher stateful router
│   │   ├── notifications.py        # in-app notification feed
│   │   ├── vault.py                # knowledge vault items
│   │   └── resume.py               # resume ATS scoring and feedback
│   ├── models/
│   │   ├── user.py                 # User
│   │   ├── profile.py              # Profile (1-to-1 with User)
│   │   ├── email_verification.py   # EmailVerification tokens
│   │   ├── outbox_event.py         # TransactionalOutbox
│   │   ├── notification.py         # Notification
│   │   ├── planner.py              # WeeklyPlan + PlannerTask
│   │   ├── roadmap.py              # RoleRoadmap + RoadmapMilestone
│   │   ├── assessment.py           # UserSkillAssessment
│   │   ├── dashboard_stats.py      # DashboardStatistics (denormalised cache row)
│   │   ├── mentor.py               # MentorConversation (agent_mode, topic) + MentorMessage
│   │   ├── hub.py                  # DSAProblem · InterviewQuestion · QuizQuestion
│   │   ├── hub_progress.py         # UserCodingProgress · UserQuizAttempt · UserQuestionProgress
│   │   ├── vault.py                # VaultItem
│   │   └── resume.py               # ResumeAnalysis
│   ├── prompts/                    # LLM Prompts
│   │   ├── mentor.py               # System prompt for Career Mentor
│   │   └── teacher.py              # System prompt for Technical Teacher
│   │
│   ├── services/
│   │   ├── ai_service.py           # Gemini API wrappers & Stateful Router
│   │   ├── context_builder.py      # builds user context payload for AI calls
│   │   ├── email_service.py        # SMTP send helpers (verify, welcome, reminders)
│   │   ├── notification_service.py # create + dispatch in-app notifications
│   │   ├── roadmap_service.py      # AI weekly plan generation logic
│   │   ├── verification_service.py # email token generation + validation
│   │   └── resume_service.py       # pdfminer text extraction and Gemini integration
│   ├── workers/
│   │   ├── celery_app.py           # Celery app instance + Beat schedule
│   │   ├── celery_tasks.py         # Task definitions (thin wrappers)
│   │   ├── outbox.py               # Outbox event processor
│   │   ├── scheduler_jobs.py       # scan_due_planner_tasks, reconcile_stuck_generations
│   │   ├── deferred.py             # deferred task helpers
│   │   ├── dispatch.py             # event → handler routing
│   │   ├── event_types.py          # ET.* event type constants
│   │   └── handlers.py             # per-event-type handler functions
│   │
│   ├── core/
│   │   ├── config.py               # Settings (pydantic-settings, reads .env)
│   │   ├── security.py             # JWT helpers
│   │   └── cache.py                # get_cache / set_cache / delete_cache (Redis)
│   │
│   └── db/
│       └── session.py              # SessionLocal, Base, get_db
│
└── csv/                            # Processed seed data (git-ignored)
    ├── seed_interview_questions_clean.csv   # 33,807 rows
    ├── seed_quiz_questions.csv              # 5,816 rows
    └── ultimate_master_coding_questions.csv # 3,632 unique problems
```

---

## Quick start — local dev

Requires PostgreSQL and Redis running locally (or via Docker).

```powershell
cd Workspace\backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
# fill in DATABASE_URL, REDIS_URL, and GEMINI_API_KEY in .env
alembic upgrade head
uvicorn main:app --reload
```

- API: http://localhost:8000
- Swagger docs: http://localhost:8000/docs

Then in two separate terminals:

```powershell
# Terminal 2 — Celery worker
celery -A app.workers.celery_app worker --loglevel=info --concurrency=4 --without-gossip --without-mingle --without-heartbeat

# Terminal 3 — Celery Beat (cron scheduler)
celery -A app.workers.celery_app beat --loglevel=info
```

---

## Running all three processes

The backend runs as **three separate processes**. All three must be running for full functionality — there is no embedded/single-process mode.

```powershell
# 1. API server
uvicorn main:app --host 0.0.0.0 --port 8000

# 2. Celery worker — handles roadmap generation, outbox dispatch, planner reminders
celery -A app.workers.celery_app worker --loglevel=info --concurrency=4 --without-gossip --without-mingle --without-heartbeat

# 3. Celery Beat — triggers scheduled jobs (outbox scan, planner reminders, reconcile)
celery -A app.workers.celery_app beat --loglevel=info
```

> **Note:** Never combine Beat and worker into one process (`celery worker -B`) when running multiple worker instances — Beat will fire duplicate schedules.

Or with Docker Compose:

```powershell
cd Workspace
docker compose up --build
```

| Service | URL / Port |
|---|---|
| API | http://localhost:8000 |
| Postgres | localhost:5432 |
| Redis | localhost:6379 |
| Celery worker | — |
| Celery Beat | — |

---

## Environment variables

Copy `.env.example` to `.env` and fill in values.

```env
# App
SECRET_KEY=change-me
FRONTEND_URL=http://localhost:3000

# Database
DATABASE_URL=postgresql+psycopg2://user:pass@localhost:5432/blueprint

# Redis
REDIS_URL=redis://localhost:6379/0
# For Upstash: rediss://:<token>@<host>:6380

# Email (leave blank to log emails to console instead of sending)
SMTP_HOST=
SMTP_PORT=587
SMTP_USE_TLS=true
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM=noreply@blueprint.com
EMAIL_VERIFICATION_EXPIRE_HOURS=24

# Google Gemini (AI Mentor + roadmap generation)
GEMINI_API_KEY=AIza...
```

---

## Database

```bash
alembic upgrade head
```

### Models and what they store

| Model | Table | Purpose |
|---|---|---|
| `User` | `users` | Auth credentials, onboarding state, target role/companies |
| `Profile` | `profiles` | Full name, college, CGPA, GitHub, LinkedIn, avatar |
| `EmailVerification` | `email_verifications` | Token hash + expiry for email verify flow |
| `OutboxEvent` | `outbox_events` | Transactional outbox — events queued for async dispatch |
| `Notification` | `notifications` | In-app notification feed per user |
| `WeeklyPlan` | `weekly_plans` | AI or manual weekly prep plan |
| `PlannerTask` | `planner_tasks` | Individual tasks inside a weekly plan |
| `RoleRoadmap` | `role_roadmaps` | Custom role-specific roadmap for a user |
| `RoadmapMilestone` | `roadmap_milestones` | Ordered tasks inside a role roadmap |
| `UserSkillAssessment` | `user_skill_assessments` | Self-rated confidence per skill (onboarding) |
| `DashboardStatistics` | `dashboard_statistics` | Denormalised readiness score row per user |
| `MentorConversation` | `mentor_conversations` | AI chat session header |
| `MentorMessage` | `mentor_messages` | Individual messages within a conversation |
| `DSAProblem` | `dsa_problems` | 3,632 LeetCode-style problems with HTML content + code snippets |
| `InterviewQuestion` | `interview_questions` | 33,807 open-ended Q&A rows with category, skill, roles |
| `QuizQuestion` | `quiz_questions` | 5,816 MCQ rows with 4 options + correct answer |
| `UserCodingProgress` | `user_coding_progress` | Per-user DSA solve status, bookmarks, notes, streak data |
| `UserQuizAttempt` | `user_quiz_attempts` | Per-user quiz answer history and accuracy tracking |
| `UserQuestionProgress` | `user_question_progress` | Per-user interview Q&A bookmark and revision state |
| `VaultItem` | `vault_items` | Polymorphic knowledge vault — bookmarks, AI insights, personal notes |

---

## Data pipeline — Interview Hub

The hub tables are populated from processed CSV files. The processing scripts live in the separate **`blueprint-data-processing`** repository — run them once offline before seeding.

### Step 1 — Refine + clean (blueprint-data-processing repo)

```bash
python refine_quiz_and_interview_questions.py   # merges raw sources → seed_interview_questions.csv
python clean_seed_interview_questions.py        # normalises categories, roles, skills → seed_interview_questions_clean.csv
```

Copy the three output CSVs into this repo's `csv/` folder:
- `seed_interview_questions_clean.csv`
- `seed_quiz_questions.csv`
- `ultimate_master_coding_questions.csv`

### Step 2 — Seed the database

```bash
python seeds/seed_hub.py
```

Seeds all three hub tables in batches of 500 with `ON CONFLICT DO NOTHING` — safe to re-run.

Also populates permanent Redis metadata keys used by filter dropdowns:

```
meta:interview:categories          → {category: count}
meta:interview:skills              → {skill: count}
meta:interview:skills:<category>   → {skill: count, …}   (per category)
meta:coding:topics                 → [topic list]
meta:coding:companies              → [company list]
meta:coding:counts                 → {Easy: N, Medium: N, Hard: N}
```

### Category → skill breakdown (Interview Q&A)

| Category | Skills (sub-filter) | Rows |
|---|---|---|
| Programming Languages | Python, Java, C, C++, Rust, Go, TypeScript, Swift, Kotlin, … (41 languages) | ~6,150 |
| AI & ML | Data Science Concepts, Machine Learning, Deep Learning, NLP, … | ~7,800 |
| Backend | Django, FastAPI, Spring Boot, Node.js, ASP.NET Core, … | ~3,500 |
| Frontend | React.js, Next.js, Angular, Vue.js, Svelte, … | ~2,800 |
| Database | PostgreSQL, MySQL, MongoDB, Redis, Cassandra, … | ~2,100 |
| DSA | Arrays, Trees, Graphs, Dynamic Programming, … | ~1,900 |
| Core Subjects | OOP, Operating Systems, DSA | ~450 |
| DevOps | Docker, Kubernetes, CI/CD, Terraform, … | ~1,200 |
| Security & Networking | — | ~900 |
| Behavioral | — | ~800 |
| … | … | … |

---

## Background workers

### Celery tasks

| Task name | Trigger | What it does |
|---|---|---|
| `process_outbox_task` | Every 30 s (Beat) | Picks up pending `OutboxEvent` rows and dispatches (email, notifications) |
| `scan_planner_reminders_task` | Every 5 min (Beat) | Finds `PlannerTask` rows with `reminder_enabled=True` due soon, creates notifications |
| `reconcile_generations_task` | Every 10 min (Beat) | Requeues stuck `PlannerGeneration` jobs (status=processing, stale) |
| `generate_roadmap_task` | On demand (API trigger) | Runs AI roadmap generation for a given `generation_id` |

### Outbox event types

| `event_type` | Dispatched when | Effect |
|---|---|---|
| `ET.EMAIL_VERIFICATION` | User registers | Sends verification email via SMTP |
| `ET.WELCOME_EMAIL` | Onboarding completes | Sends welcome email |
| `ET.RESUME_ANALYSIS` | Resume uploaded | Triggers async ATS scoring |
| `ET.PLANNER_REMINDER` | Task due soon | Sends reminder email + in-app notification |
| `ET.ROADMAP_READY` | Plan generation finishes | Sends "your plan is ready" email |

### Worker health check

```bash
curl http://localhost:8000/api/v1/status/workers
```

---

## API overview

All routes are prefixed `/api/v1/`.

### Auth & onboarding

| Method | Path | Description |
|---|---|---|
| `POST` | `/auth/register` | Create account, queue verification email |
| `POST` | `/auth/login` | Returns access + refresh JWT |
| `GET` | `/auth/verify` | Consume email verification token |
| `POST` | `/auth/refresh` | Rotate access token using refresh token |
| `GET` | `/profile` | Get current user profile |
| `PATCH` | `/profile` | Update profile (invalidates `dashboard:{user_id}` cache) |
| `POST` | `/onboarding/target` | Set target role + companies |
| `POST` | `/onboarding/assessment` | Submit skill confidence ratings |

### Dashboard

| Method | Path | Description |
|---|---|---|
| `GET` | `/dashboard/summary` | Readiness score, weekly tasks, profile strength, quiz accuracy — Redis `dashboard:{user_id}` TTL 5 min |

### Planner

| Method | Path | Description |
|---|---|---|
| `GET` | `/planner/plans` | List weekly plans (paginated) |
| `POST` | `/planner/plans` | Create manual plan |
| `POST` | `/planner/generate` | Trigger AI plan generation (async) |
| `GET` | `/planner/plans/{id}` | Get plan with tasks |
| `PATCH` | `/planner/tasks/{id}` | Update task (status change invalidates dashboard cache) |

### Interview Hub

| Method | Path | Description |
|---|---|---|
| `GET` | `/hub/coding` | List DSA problems — keyset pagination, filters: `difficulty`, `topic`, `company` |
| `GET` | `/hub/coding/{id}` | Problem detail — includes full HTML content + code snippets |
| `GET` | `/hub/coding/{id}/progress` | Get user's solve status for a problem |
| `POST` | `/hub/coding/{id}/progress` | Mark problem solved / attempted |
| `GET` | `/hub/stats/dsa` | Per-user stats: solved count, difficulty breakdown, streak |
| `GET` | `/hub/interview` | List Q&A — filters: `category`, `skill`, `difficulty`, `role` |
| `GET` | `/hub/interview/{id}` | Question detail with full answer body |
| `GET` | `/hub/quiz` | List MCQ — filters: `section`, `topic`, `difficulty` (correct answer omitted) |

### AI Mentor (Gemini)

The AI Mentor uses a **Stateful Routing Architecture** (`app/services/ai_service.py`):
- Conversations maintain a persistent `agent_mode` (Teacher or Mentor), `active_topic`, and `current_task`.
- A deterministic router fast-paths follow-up messages (0 LLM calls for routing) using fast heuristic scoring to reduce latency.
- Ambiguous initial messages fall back to an LLM router to classify the intent.

| Method | Path | Description |
|---|---|---|
| `GET` | `/mentor/conversations` | List user's conversations |
| `POST` | `/mentor/conversations` | Start new conversation |
| `GET` | `/mentor/conversations/{id}` | Get conversation with all messages |
| `POST` | `/mentor/conversations/{id}/message` | Send message, resolve state, get Gemini response |

### Knowledge Vault

| Method | Path | Description |
|---|---|---|
| `GET` | `/vault` | List all vault items for current user (bookmarks, AI insights, notes) |
| `POST` | `/vault` | Create a new vault item |
| `PATCH` | `/vault/{id}` | Update a vault item (e.g. edit note content) |
| `DELETE` | `/vault/{id}` | Delete a vault item |

### Search

| Method | Path | Description |
|---|---|---|
| `GET` | `/search?q=...&type=coding,interview,quiz` | Unified full-text search across all three hub tables — PostgreSQL `tsvector` GIN index |

### Notifications

| Method | Path | Description |
|---|---|---|
| `GET` | `/notifications` | List unread notifications for current user |
| `PATCH` | `/notifications/{id}/read` | Mark notification as read |

---

## Caching strategy

All cache operations go through `app/core/cache.py` (`get_cache` / `set_cache` / `delete_cache`).

| Redis key | TTL | Invalidated by |
|---|---|---|
| `dashboard:{user_id}` | 5 min | `PATCH /profile`, task status → Completed, quiz attempt |
| `iq:list:{md5(filters)}` | 1 hr | Re-seed only |
| `iq:q:{id}` | 12 hr | Re-seed only |
| `coding:list:{md5(filters)}` | 2 hr | Re-seed only |
| `coding:q:{id}` | 12 hr | Re-seed only |
| `quiz:list:{md5(filters)}` | 1 hr | Re-seed only |
| `dsa:stats:{user_id}` | 5 min | `POST /hub/coding/{id}/progress` |
| `meta:interview:*` | permanent | Re-seed |
| `meta:coding:*` | permanent | Re-seed |