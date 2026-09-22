# Blueprint

**The operating system for engineering placement preparation.**

Blueprint is an AI-powered platform that helps engineering students systematically prepare for software engineering internships and placements. Instead of another task tracker, Blueprint continuously measures a student's readiness across DSA, core CS subjects, projects, resume quality, GitHub activity, and company-specific prep — then turns that into a personalized, adaptive weekly plan.

> Students today juggle LeetCode, YouTube, Notion, GitHub, resume builders, and AI chatbots — with no single view of how ready they actually are. Blueprint unifies these signals into one dashboard, tells you what's weak, and tells you exactly what to do next.

---

## Table of contents

- [Why Blueprint](#why-blueprint)
- [Features](#features)
- [Tech stack](#tech-stack)
- [Architecture](#architecture)
- [Monorepo structure](#monorepo-structure)
- [Quick start](#quick-start)
- [Environment variables](#environment-variables)
- [Interview Hub content bank](#interview-hub-content-bank)
- [API overview](#api-overview)
- [Caching & performance](#caching--performance)
- [Background workers](#background-workers)
- [Non-functional requirements](#non-functional-requirements)
- [Project status](#project-status)
- [Contributing](#contributing)

---

## Why Blueprint

Engineering students preparing for placements typically can't answer simple questions: *How prepared am I? What's my weakest subject? Which company am I closest to? What should I study this week?*

Blueprint is built on five principles:

1. **Measure everything** — DSA progress, subject knowledge, resume strength, GitHub quality, and interview readiness are all quantified.
2. **Action over information** — insights always come with a recommended next step (e.g. *"Study Transactions, Indexing, and Joins this week — est. 4 hours"* instead of *"Your DBMS score is low"*).
3. **Personalization** — roadmaps adapt to the student's target role (Backend, Frontend, AI, Platform, SDE, Systems).
4. **Continuous improvement** — recommendations update based on performance, time available, target companies, and missed tasks.
5. **Engineering first** — every feature should improve engineering ability, not just productivity.

---

## Features

| Module | What it does | Status |
|---|---|---|
| Auth & onboarding | Register/login (JWT access + refresh), email verification, target role + companies, skill self-assessment | Live |
| Dashboard | Readiness score, weekly tasks, profile strength, quiz accuracy — served from a denormalised, Redis-cached row | Live |
| Weekly Planner | AI-generated or manual weekly plans; async generation with job tracking and stuck-job reconciliation | Live |
| Interview Hub — DSA Engine | 3,632 problems, keyset-paginated, filterable by difficulty/topic/company, per-user solve tracking | Live |
| Interview Hub — Q&A Engine | 33,807 open-ended questions, filterable by category/skill/role/difficulty | Live |
| Interview Hub — Quiz Engine | 5,816 MCQs, filterable by section/topic/difficulty, per-user attempt history | Live |
| AI Mentor | Context-aware stateful chat (Teacher/Mentor modes) with deterministic routing | Live |
| Knowledge Vault | Bookmarks, AI insights, and personal notes in one polymorphic store | Live |
| Notifications | In-app feed + email, driven by a transactional outbox and scheduled reminder jobs | Live |
| Resume Analysis | Resume PDF text extraction (via `pdfminer.six`), ATS scoring, and targeted feedback with daily rate limits | Live |
| GitHub Analysis | Repository quality/activity signals feeding into readiness | Planned |
| Company Readiness | Gap analysis against role-specific requirements per target company | Planned |

**Explicitly out of scope for MVP:** competitive coding contests, an online IDE, video courses, community forums, team collaboration, a recruiter dashboard, a mobile app, subscriptions, real-time collaboration, and enterprise features.

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend framework | React 18 |
| Frontend build tool | Vite |
| Routing | React Router |
| Frontend state | Zustand |
| Frontend validation | Zod |
| API framework | FastAPI + Uvicorn |
| ORM | SQLAlchemy 2.x |
| Database | PostgreSQL (full-text search via `tsvector` + GIN index) |
| Migrations | Alembic |
| Cache / broker | Redis (Upstash-compatible) |
| Background tasks | Celery + Celery Beat |
| AI (Mentor + roadmap generation) | Google Gemini API |
| Email | SMTP (configurable), dispatched via a transactional outbox |
| Auth | JWT access + refresh tokens |
| Frontend hosting | Vercel |
| Backend hosting | Render |

---

## Architecture

The backend runs as **three independent processes** — there is no single-process/embedded mode:

```
┌─────────────┐      ┌──────────────────┐      ┌─────────────────┐
│  React SPA  │ ───► │   FastAPI API     │ ───► │   PostgreSQL     │
│  (Vercel)   │      │   (Uvicorn)       │      │   (SQLAlchemy)   │
└─────────────┘      └──────────────────┘      └─────────────────┘
                              │      ▲
                              ▼      │
                      ┌──────────────────┐      ┌─────────────────┐
                      │      Redis        │◄────►│  Celery Worker   │
                      │ (cache + broker)   │      │  + Celery Beat   │
                      └──────────────────┘      └─────────────────┘
                                                        │
                                                        ▼
                                                    SMTP outbox
```

- The **API server** handles requests and reads/writes Postgres directly, using Redis for cached reads.
- The **Celery worker** handles AI roadmap generation, outbox dispatch (email/notifications), and anything too slow to run inline.
- **Celery Beat** is the cron layer — it fires the outbox scan, planner reminder scan, and stuck-job reconciliation on schedule. Beat and worker must run as separate processes; combining them (`celery worker -B`) causes duplicate schedules once you scale to multiple workers.

---

## Monorepo structure

```
Blueprint/
├── frontend/                       # React + Vite SPA
│   └── src/
│       ├── main.jsx / App.jsx / api.js
│       ├── components/             # Layout.jsx, Sidebar.jsx, ProtectedRoute.jsx
│       ├── data/                   # filters.json, qa_filters.json, quiz_filters.json
│       │                           #   — static mirror of backend Redis `meta:*` keys
│       ├── pages/
│       │   ├── Auth/               # Login, Register, CheckEmail, VerifyEmail
│       │   ├── Landing/            # Landing page
│       │   ├── Dashboard/          # Dashboard
│       │   ├── Planner/            # Weekly Planner
│       │   ├── Mentor/             # AI Mentor
│       │   ├── InterviewHub/       # DSAEngine, InterviewQAEngine, QuizEngine
│       │   ├── Vault/              # VaultDashboard
│       │   └── ...                 # ResumeAnalyser, Onboarding, Notifications, Profile, Roadmap, Misc
│       └── store/authStore.js      # Zustand — tokens, user, login/logout
│
└── backend/                        # FastAPI service
    ├── main.py                     # app entry point
    ├── seed_hub.py                 # seeds DSA + Interview + Quiz tables
    ├── alembic/versions/           # 10 migrations
    ├── app/
    │   ├── api/                    # auth, onboarding, profile, dashboard, planner,
    │   │                           #   hub, mentor, notifications, vault, resume
    │   ├── models/                 # User, Profile, RoleRoadmap, WeeklyPlan, DSAProblem,
    │   │                           #   MentorConversation, InterviewQuestion, QuizQuestion, VaultItem, …
    │   ├── prompts/                # mentor.py, teacher.py (LLM System prompts)
    │   ├── services/               # ai_service (stateful router), context_builder, email_service,
    │   │                           #   notification_service, roadmap_service
    │   ├── workers/                # celery_app, celery_tasks, outbox, scheduler_jobs,
    │   │                           #   dispatch, event_types, handlers
    │   └── core/                   # config (pydantic-settings), security (JWT), cache (Redis)
    └── csv/                        # git-ignored seed data
        ├── seed_interview_questions_clean.csv   (33,807 rows)
        ├── seed_quiz_questions.csv              (5,816 rows)
        └── ultimate_master_coding_questions.csv (3,632 rows)
```

Full file-by-file breakdowns live in [`frontend/README.md`](./frontend/README.md) and [`backend/README.md`](./backend/README.md).

---

## Quick start

Requires PostgreSQL and Redis running locally (or via Docker).

```powershell
git clone https://github.com/<org>/blueprint.git
cd blueprint

# --- Backend ---
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
# fill in DATABASE_URL, REDIS_URL, and GEMINI_API_KEY
alembic upgrade head
uvicorn main:app --reload
```

In two more terminals (the backend needs all three running):

```powershell
celery -A app.workers.celery_app worker --loglevel=info --concurrency=4 --without-gossip --without-mingle --without-heartbeat
celery -A app.workers.celery_app beat --loglevel=info
```

```powershell
# --- Frontend ---
cd frontend
npm install
copy .env.example .env   # set VITE_API_URL
npm run dev
```

| Service | URL |
|---|---|
| Frontend | http://localhost:5173 |
| API | http://localhost:8000 |
| Swagger docs | http://localhost:8000/docs |
| Postgres | localhost:5432 |
| Redis | localhost:6379 |

Or spin up the backend, Postgres, and Redis together:

```powershell
docker compose up --build
```

---

## Environment variables

**Frontend (`frontend/.env`)**
```env
VITE_API_URL=http://localhost:8000/api/v1
```

**Backend (`backend/.env`)**
```env
SECRET_KEY=change-me
FRONTEND_URL=http://localhost:3000

DATABASE_URL=postgresql+psycopg2://user:pass@localhost:5432/blueprint

REDIS_URL=redis://localhost:6379/0
# For Upstash: rediss://:<token>@<host>:6380

# Leave SMTP_* blank to log emails to console instead of sending
SMTP_HOST=
SMTP_PORT=587
SMTP_USE_TLS=true
SMTP_FROM=noreply@blueprint.com
EMAIL_VERIFICATION_EXPIRE_HOURS=24

GEMINI_API_KEY=AIza...
```

---

## Interview Hub content bank

The Interview Hub is backed by **~43,000 rows** of prep content, seeded from cleaned CSVs produced by a separate `blueprint-data-processing` repo and loaded in batches of 500 with `ON CONFLICT DO NOTHING` (safe to re-run):

| Table | Rows | Contents |
|---|---|---|
| `dsa_problems` | 3,632 | LeetCode-style problems, full HTML content + code snippets |
| `interview_questions` | 33,807 | Open-ended Q&A across category, skill, and target role |
| `quiz_questions` | 5,816 | MCQs, 4 options + correct answer |

**Interview Q&A category breakdown:**

| Category | Skills (sub-filter) | Rows |
|---|---|---|
| AI & ML | Data Science, ML, Deep Learning, NLP, … | ~7,800 |
| Programming Languages | Python, Java, C, C++, Rust, Go, TypeScript, … (41 languages) | ~6,150 |
| Backend | Django, FastAPI, Spring Boot, Node.js, ASP.NET Core, … | ~3,500 |
| Frontend | React.js, Next.js, Angular, Vue.js, Svelte, … | ~2,800 |
| Database | PostgreSQL, MySQL, MongoDB, Redis, Cassandra, … | ~2,100 |
| DSA | Arrays, Trees, Graphs, Dynamic Programming, … | ~1,900 |
| DevOps | Docker, Kubernetes, CI/CD, Terraform, … | ~1,200 |
| Security & Networking | — | ~900 |
| Behavioral | — | ~800 |
| Core Subjects | OOP, Operating Systems, DSA | ~450 |

Seeding also writes permanent Redis metadata keys (`meta:interview:categories`, `meta:coding:topics`, `meta:coding:companies`, `meta:coding:counts`, …) that back every filter dropdown — the frontend mirrors these as static JSON so filter UIs render with zero API round-trip.

---

## API overview

All routes are prefixed `/api/v1/`. Full request/response details are in [`backend/README.md`](./backend/README.md).

| Group | Endpoints |
|---|---|
| Auth & onboarding | register, login, verify email, refresh, profile get/patch, set target role/companies, skill assessment |
| Dashboard | `GET /dashboard/summary` — Redis-cached, 5 min TTL |
| Planner | list/create plans, trigger AI generation, get plan + tasks, update task |
| Interview Hub | list/detail for coding, interview Q&A, and quiz, plus per-user progress and DSA stats |
| Search | `GET /search?q=...&type=coding,interview,quiz` — unified full-text search |
| AI Mentor | list/create conversations, get conversation, send message → Gemini response |
| Knowledge Vault | list, create, update, delete vault items |
| Notifications | list unread, mark as read |

---

## Caching & performance

Everything routes through a single cache helper (`app/core/cache.py`), keeping cache logic in one place:

| Redis key | TTL | Invalidated by |
|---|---|---|
| `dashboard:{user_id}` | 5 min | Profile update, task marked complete, quiz attempt |
| `iq:list:{md5(filters)}` | 1 hr | Re-seed only |
| `iq:q:{id}` | 12 hr | Re-seed only |
| `coding:list:{md5(filters)}` | 2 hr | Re-seed only |
| `coding:q:{id}` | 12 hr | Re-seed only |
| `quiz:list:{md5(filters)}` | 1 hr | Re-seed only |
| `dsa:stats:{user_id}` | 5 min | New solve/attempt logged |
| `meta:interview:*` / `meta:coding:*` | permanent | Re-seed only |

On top of caching:

- **Keyset (cursor) pagination** on the DSA problem list — avoids the performance cliff of offset pagination on a 3,600+ row, frequently-filtered table.
- **PostgreSQL full-text search** (`tsvector` + GIN index) across all three hub tables, rather than `LIKE`-based search.
- **Async background jobs** for anything slow — AI roadmap generation, resume parsing, GitHub sync, email — so the request path never blocks on them.

---

## Background workers

| Task | Trigger | Does |
|---|---|---|
| `process_outbox_task` | Every 30 s (Beat) | Dispatches pending outbox events (email, notifications) |
| `scan_planner_reminders_task` | Every 5 min (Beat) | Creates notifications for tasks due soon |
| `reconcile_generations_task` | Every 10 min (Beat) | Requeues stuck AI plan-generation jobs |
| `generate_roadmap_task` | On demand | Runs AI weekly roadmap generation |

Outbox events (`ET.EMAIL_VERIFICATION`, `ET.WELCOME_EMAIL`, `ET.RESUME_ANALYSIS`, `ET.PLANNER_REMINDER`, `ET.ROADMAP_READY`) decouple "something happened" from "send the email/notification" — the API just writes an outbox row, and the worker fans it out. Worker health is checkable at `GET /api/v1/status/workers`.

---

## 📸 Platform Screenshots

### Landing Page
| Hero Section | Feature Modules |
| :---: | :---: |
| ![Landing 1](Images/LandingPage1.png) | ![Landing 2](Images/LandingPage2.png) |
| **How It Works** | |
| ![Landing 3](Images/LandingPage3.png) | |

### User Dashboard & AI Mentor
| Main Dashboard | Dashboard Metrics |
| :---: | :---: |
| ![Dashboard](Images/Dashboard1.png) | ![Dashboard Metrics](Images/Dashboard2.png) |
| **AI Mentor** | |
| ![AI Mentor](Images/AI%20mentor.png) | |

### Interview Hub (Coding & Q&A)
| DSA Problem List | DSA Workspace |
| :---: | :---: |
| ![DSA Hub](Images/DSAHUB1.png) | ![DSA Details](Images/DSAHUB2.png) |
| **Interview Q&A Bank** | |
| ![Interview QA](Images/InterviewQA.png) | |

### Interactive Quiz Engine
| Quiz Dashboard | Category Filters |
| :---: | :---: |
| ![Quiz Overview](Images/QUIZ1.png) | ![Quiz Filters](Images/QUIZfilters.png) |
| **Active Quiz Session (Timer)** | |
| ![Quiz Timer](Images/Quizwithtimer.png) | |
  
## Contributing

This repository is under active development. Please open an issue or discussion before starting significant work.

- **Frontend:** React, functional components (TypeScript migration planned)
- **Backend:** FastAPI, Python type hints, Pydantic validation, Alembic migrations for schema changes
