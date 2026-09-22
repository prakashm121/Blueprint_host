# Blueprint — Frontend

A React + Vite SPA for the Blueprint placement preparation platform. Connects to the Blueprint backend API for auth, onboarding, dashboard, planner, interview hub, AI mentor, vault, and notifications.

---

## Table of contents

- [Tech stack](#tech-stack)
- [Project structure](#project-structure)
- [Quick start](#quick-start)
- [Environment variables](#environment-variables)
- [Pages and routes](#pages-and-routes)
- [State management](#state-management)
- [API layer](#api-layer)

---

## Tech stack

| Layer | Technology |
|---|---|
| Framework | React 18 |
| Build tool | Vite |
| Routing | React Router |
| State | Zustand |
| Validation | Zod |
| Styling | CSS (App.css + index.css) |

---

## Project structure

```
frontend/
├── index.html
├── vite.config.js
├── package.json
├── .env.example
│
├── public/
│   ├── favicon.svg
│   └── icons.svg
│
└── src/
    ├── main.jsx                        # React entry point
    ├── App.jsx                         # Router setup, route definitions
    ├── api.js                          # Axios instance + all API call functions
    ├── App.css
    ├── index.css
    │
    ├── assets/
    │   ├── LogoBlueprint.png
    │
    ├── components/
    │   ├── Layout.jsx                  # Main wrapper layout with Sidebar
    │   ├── Sidebar.jsx                 # Persistent global navigation sidebar
    │   └── ProtectedRoute.jsx          # Wraps routes that require auth
    │
    ├── data/                           # Static filter config (no API call needed)
    │   ├── filters.json                # DSA topic + company filter options
    │   ├── qa_filters.json             # Interview Q&A category + role filters
    │   └── quiz_filters.json           # Quiz section + topic filters
    │
    ├── pages/
    │   ├── Auth/                       # Login.jsx, Register.jsx, CheckEmail.jsx, VerifyEmail.jsx
    │   ├── Landing/                    # Landing.jsx (Public landing page)
    │   ├── Dashboard/                  # Dashboard.jsx (Readiness score + summary cards)
    │   ├── Planner/                    # Planner.jsx (Weekly plan + task management)
    │   ├── Mentor/                     # Mentor.jsx (AI mentor chat)
    │   ├── Onboarding/                 # Onboarding.jsx (Target role, companies, skills)
    │   ├── Notifications/              # Notifications.jsx (In-app notification feed)
    │   ├── Profile/                    # Profile.jsx
    │   ├── Roadmap/                    # Roadmap.jsx
    │   ├── ResumeAnalyser/             # ResumeAnalyser.jsx (Upload, ATS scoring, Feedback, History)
    │   ├── Misc/                       # NotFound.jsx (404 page)
    │   │
    │   ├── InterviewHub/
    │   │   ├── DSAEngine.jsx           # DSA problem list — filters, keyset pagination
    │   │   ├── DSAProblemDetail.jsx    # Full problem view — HTML content + code panel
    │   │   ├── InterviewQAEngine.jsx   # Q&A list — category, skill, role filters
    │   │   └── QuizEngine.jsx          # MCQ quiz — section/topic filters, answer flow
    │   │
    │   └── Vault/
    │       └── VaultDashboard.jsx      # Knowledge vault — bookmarks, AI insights, notes
    │
    └── store/
        └── authStore.js                # Zustand store — tokens, user, login/logout
```

---

## Quick start

```powershell
cd Workspace\frontend
npm install
copy .env.example .env
# set VITE_API_URL in .env
npm run dev
```

- App: http://localhost:5173

Build for production:

```powershell
npm run build
npm run preview
```

---

## Environment variables

```env
VITE_API_URL=http://localhost:8000/api/v1
```

---

## Pages and routes

| Path | Component | Auth required |
|---|---|---|
| `/` | `Landing` | No |
| `/register` | `Register` | No |
| `/login` | `Login` | No |
| `/check-email` | `CheckEmail` | No |
| `/auth/verify` | `VerifyEmail` | No |
| `/onboarding` | `Onboarding` | Yes |
| `/dashboard` | `Dashboard` | Yes |
| `/planner` | `Planner` | Yes |
| `/interview-hub/dsa` | `DSAEngine` | Yes |
| `/interview-hub/dsa/:id` | `DSAProblemDetail` | Yes |
| `/interview-hub/qa` | `InterviewQAEngine` | Yes |
| `/interview-hub/quiz` | `QuizEngine` | Yes |
| `/mentor` | `Mentor` | Yes |
| `/vault` | `VaultDashboard` | Yes |
| `/resume-analyser` | `ResumeAnalyser` | Yes |
| `/notifications` | `Notifications` | Yes |
| `*` | `NotFound` | No |

Protected routes are wrapped in `ProtectedRoute.jsx` which reads auth state from Zustand and redirects to `/login` if unauthenticated.

---

## State management

`authStore.js` (Zustand) holds:

```js
{
  user,           // user object from /profile
  accessToken,    // JWT access token
  refreshToken,   // JWT refresh token
  isAuthenticated,
  login(),        // stores tokens + user
  logout(),       // clears state
  setUser(),      // updates user after profile changes
}
```

All other data (hub questions, planner tasks, vault items) is fetched locally per page — no global store for server data.

---

## API layer

All backend calls go through `src/api.js` which exports:

- An Axios instance with `VITE_API_URL` as the base URL
- Request interceptor — attaches `Authorization: Bearer <accessToken>` from Zustand on every request
- Response interceptor — on 401, attempts token refresh via `/auth/refresh`, retries the original request, logs out on failure
- Named functions for every endpoint (e.g. `getProfile()`, `listDSAProblems(filters)`, `sendMentorMessage(convId, text)`)

Filter options for the hub pages are loaded from the static JSON files in `src/data/` rather than hitting the API on every page load — these are pre-seeded values that match what the backend stores in Redis metadata.