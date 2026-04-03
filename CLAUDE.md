# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development commands

### Backend (`cd backend`)
```bash
npm run dev          # nodemon, port 3001
npm test             # Jest (unit + integration, with mocks)
npm run test:watch   # Jest in watch mode
npm run test:coverage
npm run db:migrate:dev --name <name>  # create and apply a migration
npm run db:migrate   # deploy migrations (production)
npm run db:seed      # seed admin user, default roles, and Bliss project
npx prisma studio    # visual DB browser
```

### Frontend (`cd frontend`)
```bash
npm run dev          # Vite dev server, port 5173
npm run build        # production build
npm test             # Vitest in watch mode
npm run test:run     # Vitest single run
npm run test:coverage
```

### Environment variables

**backend/.env**
```
DATABASE_URL=postgresql://user:pass@localhost:5432/team_tracker
JWT_SECRET=<long random string>
RESEND_API_KEY=re_xxxx
FRONTEND_URL=http://localhost:5173
GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com
ANTHROPIC_API_KEY=sk-ant-...
```

**frontend/.env.development**
```
VITE_API_URL=http://localhost:3001
VITE_GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com
```

Default admin credentials after seed: `admin@blissmkt.ar` / `admin123`

## Architecture

### Overview
Full-stack task tracker for a marketing agency. Backend is a REST API; frontend is a React SPA. No shared code between them — they communicate only via HTTP.

### Backend (`backend/src/`)
- **Express + Prisma + PostgreSQL.** Entry point `index.js` imports the Express app from `app.js` (separated so tests can import the app without starting the server). Routes are mounted under `/api/<resource>`.
- **Auth:** JWT (12h expiry) stored in `localStorage`. Google OAuth 2 via `google-auth-library` (ID token verification, no secret needed). The `auth` middleware attaches `req.user` (decoded JWT payload). `adminOnly` middleware gates admin routes.
- **Tests:** Jest + Supertest. `jest.config.js` at backend root. All tests in `backend/tests/`. Prisma is mocked with `jest.mock('../lib/prisma')` — no real DB needed. `assertNoActiveTask()` is exported from `tasks.controller.js` for unit testing.
- All dates for workday logic use `America/Argentina/Buenos_Aires` (UTC-3). Task timestamps are stored in UTC.
- **Email** is sent via Resend HTTP API (`src/services/email.service.js`) — not SMTP. Railway blocks outbound SMTP ports.
- **Prisma singleton** at `src/lib/prisma.js` — all controllers import from here to avoid connection pool exhaustion.
- **Shared utilities:** `src/utils/dates.js` exports `todayString()` (Buenos Aires timezone).
- **Weekly AI report** at `src/services/weeklyReport.service.js` — generates productivity analysis with Claude Haiku, sent every Friday at 14:00 ART via `node-cron`. Users are processed sequentially with a 3s delay between each to stay within the Claude API rate limit (5 req/s).

### Frontend (`frontend/src/`)
- **React 18 + Vite + Tailwind CSS + React Router v6.**
- **Color palette:** Custom `primary` tokens in `tailwind.config.js` based on orange (#F7931A). All interactive elements use `primary-*` classes. Status colors: IN_PROGRESS = primary (orange), PAUSED = gray, BLOCKED = red, COMPLETED = green, PENDING = gray.
- **Tests:** Vitest + React Testing Library. Test config in `vite.config.js` (`test` block). All tests in `src/tests/`. API calls mocked with `vi.doMock` + `vi.resetModules()` per test to flush the module-level cache in `useRoles.js`.
- `api/client.js` — Axios instance that reads `VITE_API_URL`, injects the JWT from `localStorage`, and redirects to `/login` on 401.
- `context/AuthContext.jsx` — global auth state; validates token on mount via `GET /auth/me` (hits DB, returns fresh `avatar` and `dailyInsightEnabled`). Exposes `updateUser()` for local state updates without re-login.
- `context/ThemeContext.jsx` — dark mode toggle persisted to `localStorage`.
- `hooks/useRoles.js` — fetches `UserRole` list for label lookups (role names are internal strings like `"DESIGNER"`; labels are display strings like `"Diseñador"`). Has module-level cache so it only fetches once per session.
- `hooks/useInactivity.js` — tracks mouse/keyboard activity; after 60 min idle on an IN_PROGRESS task shows a warning modal + Chrome notification; auto-pauses after a further 10 min.
- `utils/format.js` — shared `fmtMins()`, `activeMinutes()`, `completedDuration()`.
- `utils/linkify.jsx` — converts plain URLs in text to clickable `<a>` tags (returns array of strings/elements, never a plain string).

### Key domain concepts

**WorkDay:** Created automatically when a user visits the Dashboard. One per user per calendar day (keyed on `YYYY-MM-DD` in Buenos Aires time). Closing a workday (`/workdays/finish`) logs out the user. Tasks from previous days that are still PENDING/PAUSED/BLOCKED are carried over and shown in a separate section.

**Task status machine:**
```
PENDING → IN_PROGRESS → PAUSED / BLOCKED / COMPLETED
BLOCKED → IN_PROGRESS (unblock)
PAUSED  → IN_PROGRESS (resume)
```
Only one task can be `IN_PROGRESS` per user at a time (enforced on the backend via `assertNoActiveTask()`). Blocking requires a reason and notifies all project members. Completing also notifies all project members. Auto-pause on inactivity stores the task ID in `localStorage` key `autoPaused` to restore the modal after page reload.

**Starred tasks:** Up to 3 tasks can be starred simultaneously. `starred` is an Int 0–3 (0=none, 1=yellow, 2=orange, 3=red). Starred tasks appear in a dedicated "Destacadas: Foco del día" section above other statuses but below "En curso". A starred IN_PROGRESS task appears only in "En curso".

**Notifications:** Typed with `NotificationType` enum (`COMPLETED` / `BLOCKED`). BLOCKED notifications render with red background in the bell dropdown.

**Roles:** Dynamic — stored in the `UserRole` table, created/deleted from the Admin panel. The role string on `User.role` is the internal name (e.g. `"ADMIN"`). `ADMIN` cannot be deleted if any user holds it. Admin access unlocks Actividad, Reports, and Admin pages.

**Task assignment:** A task's `userId` is the assignee; `createdById` is set only when someone else creates the task (so `createdBy` appears in the card as "Asignada por X").

**Avatars:** Stored as filenames (e.g. `bee.png`) in `User.avatar`. Images live in `frontend/public/perfiles/`. Validated against `ALLOWED_AVATARS` list in `profile.controller.js` before saving. Referenced as `/perfiles/<filename>` in all components. Current set: `bee.png`, `bee2.png`, `beeartist.png`, `beecoffee.png`, `beecorp.png`, `beefitness.png`, `beehacker.png`, `beeloween.png`, `beepunk.png`, `beezen.png`.

**User preferences:** Two boolean flags on `User`, both `@default(true)`:
- `weeklyEmailEnabled` — opt-in for AI-generated weekly email every Friday at 14:00 ART.
- `dailyInsightEnabled` — opt-in for the daily insight banner on the Dashboard. Both updated via `PATCH /api/profile/preferences` (accepts either or both fields in a single request).

**Daily insight:** Pure frontend logic in `getDailyInsight(tasks, carryOver)` in `Dashboard.jsx`. Evaluates task state and returns a one-line message + tone (warning/alert/positive/neutral). Priority order: blocked tasks → too many pending → too many projects → good progress → task in progress → dominant project → fallback. Hidden when jornada is finished or `dailyInsightEnabled` is false.

**Project detail view:** `/my-projects/:id` shows active tasks grouped by user, tasks completed this week, and a lazy-loaded paginated archive of all completed tasks (20 at a time, `GET /api/projects/:id/completed?skip=N`).

**My Projects list:** Shows task count pills per project (IN_PROGRESS, BLOCKED, PAUSED, PENDING, COMPLETED_WEEK). Counts are computed in `list()` via `prisma.task.groupBy` + a separate completed-this-week query, merged into `taskCounts` on each project object.

### Prisma schema notes
- `User.role` is a plain `String` (not an enum) — it references `UserRole.name`.
- When a model has two relations to the same model, named relations are required (see `Task.createdBy` / `Task.user` both pointing to `User`).
- Migrations live in `backend/prisma/migrations/`. Always use `migrate dev` locally and `migrate deploy` in production.
- Current migrations (in order): `add_missing_indexes`, `add_task_starred`, `add_user_avatar`, `add_notification_type`, `add_weekly_email_preference`, `add_project_links`, `add_daily_insight_preference`.

### API routes summary
```
POST   /api/auth/login                   # email/password login
POST   /api/auth/google                  # Google OAuth (ID token)
GET    /api/auth/me                      # returns fresh user from DB (includes avatar, dailyInsightEnabled)
POST   /api/auth/forgot-password
POST   /api/auth/reset-password

GET    /api/profile                      # full profile incl. weeklyEmailEnabled, dailyInsightEnabled
PATCH  /api/profile                      # update personal data fields
PATCH  /api/profile/avatar               # update avatar (validated against ALLOWED_AVATARS)
PATCH  /api/profile/preferences          # update weeklyEmailEnabled and/or dailyInsightEnabled
POST   /api/profile/weekly-email/send    # trigger test weekly email immediately
POST   /api/profile/change-password

GET    /api/workdays/today
POST   /api/workdays/finish

POST   /api/tasks
PATCH  /api/tasks/:id/start
PATCH  /api/tasks/:id/pause
PATCH  /api/tasks/:id/resume
PATCH  /api/tasks/:id/complete
PATCH  /api/tasks/:id/block
PATCH  /api/tasks/:id/unblock
PATCH  /api/tasks/:id/star
PATCH  /api/tasks/:id/duration           # admin only
DELETE /api/tasks/:id

GET    /api/projects                     # user's projects with taskCounts (or all if admin)
GET    /api/projects/:id/tasks           # active tasks + completedThisWeek + project info
GET    /api/projects/:id/completed       # paginated completed history (?skip=N, returns hasMore)
GET    /api/realtime                     # team snapshot for today
GET    /api/reports/by-project
GET    /api/reports/by-user
GET    /api/reports/by-user-summary
GET    /api/reports/mine

GET    /api/notifications
POST   /api/notifications/read-all
```

### Frontend routes
```
/login            → Login2.jsx
/forgot-password  → ForgotPassword.jsx
/reset-password   → ResetPassword.jsx
/                 → Dashboard.jsx        (PrivateRoute)
/my-reports       → MyReports.jsx        (PrivateRoute)
/my-projects      → MyProjects.jsx       (PrivateRoute)
/my-projects/:id  → ProjectDetail.jsx    (PrivateRoute)
/profile          → MyProfile.jsx        (PrivateRoute)
/preferences      → Preferences.jsx      (PrivateRoute)
/realtime         → RealTime.jsx         (PrivateRoute)
/reports          → Reports.jsx          (AdminRoute)
/admin            → Admin.jsx            (AdminRoute)
```

### Testing
```
backend/
  jest.config.js
  tests/
    setup.js                          # JWT_SECRET env + clearAllMocks
    unit/
      auth.middleware.test.js         # auth + adminOnly middleware
      assertNoActiveTask.test.js      # task concurrency logic (Prisma mocked)
    integration/
      auth.test.js                    # POST /login, GET /me via Supertest
      starTask.test.js                # star cycle + limits via Supertest

frontend/
  src/tests/
    setup.js                          # @testing-library/jest-dom
    utils/
      format.test.js                  # fmtMins, activeMinutes, completedDuration
      linkify.test.jsx                # URL → <a> rendering
    hooks/
      useRoles.test.js                # fetch, cache, labelFor
```

### Deploy
- **Backend:** Railway (auto-runs `npm run db:migrate` on deploy; seed must be run manually once via Railway Shell). Add `GOOGLE_CLIENT_ID` and `ANTHROPIC_API_KEY` to Railway env vars.
- **Frontend:** Vercel (root: `/frontend`; `vercel.json` rewrites all paths to `index.html` for SPA routing). Add `VITE_GOOGLE_CLIENT_ID` to Vercel env vars.
