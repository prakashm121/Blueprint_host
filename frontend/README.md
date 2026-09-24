# Blueprint — Frontend

React 19 + Vite SPA for the Blueprint placement-prep platform. Auth is Supabase Google OAuth only — there's no email/password flow. Data fetching is a **hybrid model**: some pages go through the FastAPI backend, others query Supabase directly (with RLS) for reads.

---

## Table of contents

- [Tech stack](#tech-stack)
- [Project structure](#project-structure)
- [Quick start](#quick-start)
- [Environment variables](#environment-variables)
- [Routes](#routes)
- [Auth](#auth)
- [Data fetching — the hybrid model](#data-fetching--the-hybrid-model)
- [State management](#state-management)
- [Rate limits in the UI](#rate-limits-in-the-ui)
- [Security notes](#security-notes)
- [Known gaps](#known-gaps)

---

## Tech stack

| Layer | Technology |
|---|---|
| Framework | React 19 |
| Build tool | Vite (+ `@vitejs/plugin-react`) |
| Routing | React Router 7 |
| Server-state cache | `@tanstack/react-query` — used in ~12 pages, not just "fetch on mount" |
| Client state | Zustand — just auth (`user`, `token`, `isAuthLoading`) |
| Backend/Auth client | `@supabase/supabase-js` — auth session + direct DB queries for several pages |
| HTTP client (backend API) | Axios (`src/api.js`) |
| Styling | Tailwind CSS v4, via the first-party `@tailwindcss/vite` plugin |
| Icons | `lucide-react` |
| Markdown rendering | `react-markdown` + `remark-gfm` (mentor chat) |
| HTML sanitising | `dompurify` — cleans database-sourced problem HTML before `dangerouslySetInnerHTML` |
| 3D graphics | `three` (landing page hero) |
| Linting | `oxlint` (the actual `lint` script — `eslint` is present but not what's wired up) |

Not used, despite older docs claiming otherwise: **Zod** (not a dependency, no usage anywhere).

---

## Project structure

```
frontend/
├── index.html
├── vite.config.js                  # react() + tailwindcss() plugins only, no aliases/proxy
├── vercel.json                     # single SPA rewrite rule for client-side routing
├── package.json
├── .env.example                    # copy to .env (the real .env is git-ignored)
│
└── src/
    ├── main.jsx                    # React entry point
    ├── App.jsx                     # Router + Supabase session bootstrap (see Auth)
    ├── api.js                      # Axios instance for the FastAPI backend
    ├── index.css
    │
    ├── lib/
    │   └── supabase.js             # Supabase client (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)
    │
    ├── components/
    │   ├── Layout.jsx               # Sidebar + <Outlet/> shell for protected pages
    │   ├── Sidebar.jsx               # Nav + mounts Notifications as a slide-over panel
    │   └── ProtectedRoute.jsx        # Auth gate — checks session + onboarding_completed
    │
    ├── data/                        # Static filter option mirrors (no API round-trip)
    │   ├── filters.json
    │   ├── qa_filters.json
    │   └── quiz_filters.json
    │
    ├── pages/
    │   ├── Landing/                 # Landing.jsx, GraphBackground.jsx, BlueprintScene.jsx (three.js), landingData.js
    │   ├── Auth/                    # Login.jsx (Google OAuth), Register.jsx (redirect stub → /login), CheckEmail.jsx
    │   ├── Onboarding/               # Multi-step wizard — role, skills, goals
    │   ├── Dashboard/                # Readiness score + summary — queries Supabase directly
    │   ├── Planner/                  # Weekly plan + tasks
    │   ├── Roadmap/                  # Role roadmap view + generate
    │   ├── Mentor/                   # AI mentor chat (SSE streaming)
    │   ├── InterviewHub/             # DSAEngine, DSAProblemDetail, InterviewQAEngine, QuizEngine
    │   ├── Vault/                    # VaultDashboard (bookmarks/AI insights/notes)
    │   ├── Profile/                  # Profile edit form
    │   ├── ResumeAnalyser/           # Upload, async polling, ATS score + feedback breakdown, history
    │   ├── Subjects/                 # Subject confidence self-assessment
    │   ├── Notifications/            # Notification feed (rendered from Sidebar, not routed)
    │   └── Misc/NotFound.jsx
    │
    └── store/
        └── authStore.js              # Zustand — { user, token, isAuthLoading, setAuth(), logout(), setAuthLoading() }
```

---

## Quick start

```powershell
cd frontend
npm install
copy .env.example .env   # then fill in the values — see below
npm run dev
```

- App: http://localhost:5173

```powershell
npm run build
npm run preview
```

---

## Environment variables

Copy `.env.example` to `.env` (the real `.env` is git-ignored and is no longer committed):

```env
VITE_API_BASE_URL=http://localhost:8000   # FastAPI backend base URL, no trailing slash
VITE_SUPABASE_URL=                        # Supabase dashboard > Settings > API
VITE_SUPABASE_ANON_KEY=                   # the publishable (anon) key
```

Everything prefixed `VITE_` is bundled into the browser build, so never put secrets here. The variable the code reads for the backend URL is `VITE_API_BASE_URL` (`src/api.js`, `App.jsx`, `Mentor.jsx`). An older `.env` used `VITE_API_URL`, which the code never read — if you have one locally, rename it. On Vercel, set all three variables in the project's Environment Variables settings.

---

## Routes

| Path | Component | Protected |
|---|---|---|
| `/` | `Landing` — authenticated users are redirected to `/dashboard` | No |
| `/login` | `Login` (Google OAuth via Supabase) | No |
| `/register` | redirects to `/login` — registration and login are the same OAuth flow | No |
| `/check-email` | `CheckEmail` | No |
| `/onboarding` | `Onboarding` | Yes |
| `/dashboard` | `Dashboard` | Yes |
| `/planner` | `Planner` | Yes |
| `/roadmap` | `Roadmap` | Yes |
| `/mentor` | `Mentor` | Yes |
| `/interview-hub/dsa` | `DSAEngine` | Yes |
| `/interview-hub/dsa/:id` | `DSAProblemDetail` | Yes |
| `/interview-hub/qa` | `InterviewQAEngine` | Yes |
| `/interview-hub/quiz` | `QuizEngine` | Yes |
| `/vault` | `VaultDashboard` | Yes |
| `/profile` | `Profile` | Yes |
| `/resume-analyser` | `ResumeAnalyser` | Yes |
| `/subjects` | `Subjects` | Yes |
| `*` | `NotFound` | No |

Notifications are a slide-over panel mounted from `Sidebar.jsx`, not a routed page.

---

## Auth

Auth is Supabase's own session — there is no custom register/login call to the backend:

- `Login.jsx` calls `supabase.auth.signInWithOAuth({ provider: 'google' })`. That's the only sign-in method; there's no password form.
- `App.jsx` bootstraps auth on mount via `supabase.auth.getSession()` and stays in sync via `supabase.auth.onAuthStateChange()`, calling `setAuth(user, access_token)` / `logout()`. The token lives **in memory only** (Zustand) — there is no auth cookie and no duplicate copy in `localStorage` (Supabase's own client still persists its session). The backend accepts the `Authorization` header only.
- **Landing redirect:** the `/` route sends logged-in users to `/dashboard`. This also covers the case where Supabase's OAuth redirect falls back to the Site URL because `/dashboard` isn't in its allowed Redirect URLs.
- **Wake-on-visit:** on every page load `App.jsx` fires a fire-and-forget `fetch` to the backend's `/health`, so a sleeping Render free-tier instance starts waking while the user is still on the landing/login page.
- `ProtectedRoute.jsx` reads the Zustand auth state and additionally calls `GET /api/v1/auth/me` to check `onboarding_completed`, redirecting to `/login` or `/onboarding` as appropriate.
- `src/api.js`'s request interceptor attaches `Authorization: Bearer <token>` (the Supabase access token) to every backend API call. **There's no response interceptor** — no automatic 401/refresh-retry logic. If a token expires mid-session, the request just fails; the user has to be redirected by the auth-state listener picking up the change, not by axios retrying.

---

## Data fetching — the hybrid model

This is the single most important architectural fact for understanding the frontend: **not everything goes through the FastAPI backend.** A meaningful chunk of pages query Supabase directly (RLS-protected) instead:

**Through the backend API (`src/api.js` / axios):** Onboarding, Roadmap, Notifications, Profile, resume upload/history.

**Direct Supabase queries (`supabase.from(...)`, RLS-enforced) — reads bypass the backend entirely:**
- `Dashboard.jsx` — `users`, `profiles`, `weekly_plans`, `role_roadmaps`, `roadmap_milestones`, `notifications`, `user_coding_progress`, `dsa_problems`, `user_quiz_sessions`
- `DSAEngine.jsx` — `dsa_problems`
- `DSAProblemDetail.jsx` — `dsa_problems`, `users`, `vault_items`
- `InterviewQAEngine.jsx` — `interview_questions`, `users`, `vault_items`
- `Planner.jsx` — `profiles`
- `Mentor.jsx` — `users` directly, but mentor *messages* go straight to the backend via `fetch(VITE_API_BASE_URL + ...)`, not through `api.js`
- `ResumeAnalyser.jsx` — `users`
- `VaultDashboard.jsx` — `@tanstack/react-query`'s `useInfiniteQuery` against Supabase `vault_items`

If you're adding a new page, decide deliberately which model fits: backend API when there's business logic, AI calls, or write validation involved; direct Supabase reads when it's a simple RLS-scoped query and the round-trip through FastAPI would just be a pass-through.

---

## State management

`authStore.js` (Zustand) is intentionally thin — it only holds auth state:

```js
{ user, token, isAuthLoading, setAuth(user, token), logout(), setAuthLoading() }
```

Everything else — hub content, planner tasks, vault items, resume analysis status — is server state, fetched per page via either React Query or a direct Supabase call. There is no global store for that data; React Query's cache is the closest thing to one, scoped per query key.

---

## Rate limits in the UI

The backend rate-limits AI features (see the backend README). The UI surfaces the server's explanation rather than a generic error:

- **Mentor:** a `429` on the stream request is shown as an assistant message with the server's `detail` (e.g. the per-conversation, per-day, or per-minute limit), not "Sorry, I could not respond".
- **Resume Analyser:** shows the `detail` from a `429` ("one new resume per day"). Re-uploading the **same** file is free — the backend returns the existing analysis and the page polls it as normal.

---

## Security notes

- Problem HTML from the database is sanitised with DOMPurify before rendering; `react-markdown` is used without raw-HTML plugins.
- `vercel.json` sets `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy` and HSTS.
- No auth cookie is set by the app; the token is only ever sent in the `Authorization` header.

---

## Known gaps

- **No response interceptor / token refresh** in `api.js` — a 401 just fails the request rather than transparently retrying after a session refresh.
- **No Content-Security-Policy header yet.** The app needs three.js, Supabase and the Render API allowed, so a CSP has to be tested in a browser (start with `Content-Security-Policy-Report-Only`) rather than added blind.
- Supabase's own client keeps its session in `localStorage`, so any script-injection bug could still read it — the sanitising and headers above are what reduce that risk.
- Two data-fetching paths (backend API vs direct Supabase) with no single documented rule for which a new feature should use — see [Data fetching](#data-fetching--the-hybrid-model) for the current de facto pattern.
