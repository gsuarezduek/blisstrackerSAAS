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
- **Prisma error helper** at `src/lib/prismaError.js` — `handlePrismaError(err, res)` maps P2025→404, P2002→409, P2003→400. Used in the global error handler in `app.js` as a catch-all for any Prisma error not explicitly handled by individual controllers.
- **Shared utilities:** `src/utils/dates.js` exports `todayString()` (Buenos Aires timezone).
- **Shared task include:** `tasks.controller.js` and `workdays.controller.js` each define a `taskInclude` constant (`{ project, createdBy, _count: { comments } }`) used in all task queries so the comment count is always returned.
- **Weekly AI report** at `src/services/weeklyReport.service.js` — generates productivity analysis with Claude Haiku, sent every Friday at 14:00 ART via `node-cron`. Users are processed sequentially with a 3s delay between each to stay within the Claude API rate limit. Includes user memory profile (if `insightMemoryEnabled`) and role expectations in the prompt context, producing an additional `omisionesRol` field in the analysis (missing recurring role tasks for the week). Both Claude responses strip markdown code fences before JSON parsing.
- **Insight memory** at `src/services/insightMemory.service.js` — generates a weekly learning profile per user (tendencias, fortalezas, areasDeAtencion, estadisticas) using Claude Haiku. Updated every Saturday at 00:00 ART via `node-cron`. Sequential processing with 3s delay.

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

**Starred tasks:** Up to 3 tasks can be starred simultaneously. `starred` is an Int 0–3 (0=none, 1=green, 2=yellow, 3=red). The star is the sole status indicator on TaskCard — the separate status dot was removed. `starred=0` + `IN_PROGRESS` → pulsing green empty star; `starred=0` + other → gray empty star; filled stars pulse when `IN_PROGRESS`. Starred tasks appear in a dedicated "Destacadas: Foco del día" section above other statuses but below "En curso". A starred IN_PROGRESS task appears only in "En curso".

**Task ordering:** Tasks are displayed newest-first within each section. The backend returns tasks with `orderBy: { createdAt: 'desc' }` and the Dashboard also sorts in the frontend to guarantee order after local state updates.

**Task comments:** Any project member can comment on any task in the project. Comments are stored in `TaskComment` with `content` (text), `taskId`, `userId`, and optional `parentId` (for future threading). The `_count.comments` field is always included in task responses so the 💬 indicator stays accurate across all state transitions. Notifications of type `TASK_COMMENT` are sent to the task owner and all previous unique commenters (excluding the current commenter). Comments are accessible via `GET/POST /api/tasks/:id/comments` — both require project membership.

**@mentions in comments:** Typing `@` in the comment box opens an autocomplete dropdown showing project members (fetched from `GET /api/projects/:id/members`). Selecting a member inserts `@Name` and sends a `TASK_MENTION` notification to that user — they do NOT also receive the regular `TASK_COMMENT` notification (deduplication). The backend matches mentions against project member names (full name or first name), handling multi-word names robustly. In the rendered comment, `@Name` is highlighted in purple.

**Task description editing:** Inside `TaskCommentsModal`, the task owner or any admin can edit the task description inline (pencil icon, Ctrl+Enter to save). Callback `onTaskEdited` propagates the update to the parent component.**Task duration editing:** Any user can edit the duration of their own completed tasks from Mis Reportes (not just admins). Uses the same `EditDurationModal` as the admin Reports view. Edited tasks are permanently marked with a ✎ amber icon (`isOverride` flag).

**Notifications:** Typed with `NotificationType` enum (`COMPLETED` / `BLOCKED` / `ADDED_TO_PROJECT` / `TASK_COMMENT` / `TASK_MENTION`). Color scheme: BLOCKED = red, ADDED_TO_PROJECT = green, TASK_COMMENT = blue with 💬 badge, TASK_MENTION = purple with @ badge, COMPLETED = primary (orange). `TASK_MENTION` is used for both @mentions in comments and when someone assigns you a task.

The notification bell panel has 6 filter pills: Todas / @ / 💬 / 🔒 / ✓ / ＋. Each pill shows an unread count badge. Each notification is a clickable `Link` that navigates to `/my-projects/:projectId?task=:taskId` and closes the panel. The task ID causes `ProjectDetail` to auto-open `TaskCommentsModal` for that task on mount. The project name is shown as a pill below the message. On mobile the panel uses `fixed inset-x-2` (≈95% width); on `sm+` it's the standard `absolute right-0 w-80`.

**Project links:** Stored in `ProjectLink`. Any project member (not just admins) can add or delete links via `PUT /api/projects/:id/links`. The backend verifies membership before allowing writes. Links are always visible in `ProjectDetail` even when the list is empty, with an inline form to add new ones.

**Roles and admin access:** `User.role` is a plain `String` referencing `UserRole.name` — it defines the team role (e.g. "DESIGNER", "CM"). Admin access is controlled by a separate `User.isAdmin Boolean` field, fully decoupled from the role. This allows a user to have any team role and also be admin. `adminOnly` middleware checks `req.user.isAdmin`. When a user is deactivated, they are automatically removed from all projects.

**Task assignment:** A task's `userId` is the assignee; `createdById` is set only when someone else creates the task (so `createdBy` appears in the card as "Asignada por X").

**Avatars:** Stored as filenames (e.g. `bee.png`) in `User.avatar`. Images live in `frontend/public/perfiles/`. Validated against `ALLOWED_AVATARS` list in `profile.controller.js` before saving. Referenced as `/perfiles/<filename>` in all components. Current set (15): `bee.png`, `bee2.png`, `babee.png`, `beeartist.png`, `beecoffee.png`, `beecorp.png`, `beecypher.png`, `beefitness.png`, `beegamer.png`, `beehacker.png`, `beeloween.png`, `beenfluencer.png`, `beepunk.png`, `beezen.png`, `beezombie.png`. Clicking any avatar image opens a fullscreen lightbox (`AvatarLightbox.jsx`) — available in MyProfile and the UserTasksModal header.

**User preferences:** Four boolean flags on `User`, all `@default(true)`:
- `weeklyEmailEnabled` — opt-in for AI weekly email every Friday at 14:00 ART.
- `dailyInsightEnabled` — master toggle for the entire AI insight system on the Dashboard.
- `insightMemoryEnabled` — opt-in for weekly learning profile generation; when false, memory is not updated by the cron and not included in the insight context.
- `taskQualityEnabled` — opt-in for GTD task description coaching in the daily insight (`alertaGTD` field).

`insightMemoryEnabled` and `taskQualityEnabled` are subordinate to `dailyInsightEnabled`. In Preferences, there is a single master toggle for the insight system — turning it off sends a single PATCH with all three insight flags set to `false` simultaneously. When the toggle is off, the sub-feature descriptions are dimmed. All flags updated via `PATCH /api/profile/preferences` (accepts any combination of the four fields in a single request).

**Daily AI insight:** Generated by `insights.controller.js` using Claude Haiku. Cached once per user per day in the `DailyInsight` table (`userId + date` unique). On `GET /api/insights`, returns the cached record or generates a new one (with loading state on the frontend). The insight card on the Dashboard shows: `titulo`, `mensaje`, optional `sugerencia` (concrete GTD next action), optional `alertaRol` (amber — missing recurring role tasks), optional `alertaGTD` (blue — vague task descriptions with GTD reformulation suggestions), and feedback buttons (👍/👎) + regenerate (1h cooldown enforced by the backend with 429 + `waitMins`).

The context sent to Claude includes: current task states + blocked reasons + carry-over flags + weekly summary by project + role expectations (if configured via admin panel) + user memory profile (if available and `insightMemoryEnabled`). Output JSON: `{ titulo, mensaje, sugerencia, alertaRol, alertaGTD, tono }`.

**Role expectations:** Admin-configurable per role via the "🎯 Roles IA" tab in the Admin panel. Stored in `RoleExpectation` table with `roleName`, `description`, `recurrentTasks` (JSON array: `[{task, frequency, detail}]`), and `dependencies` (JSON array: `[{direction, roleName, description}]`). Frequencies: `daily`, `weekly`, `monthly`, `first_week`. Included in the daily insight context so Claude can detect missing recurring tasks for the user's role given the current day of the month.

**User insight memory:** Generated weekly (Saturday 00:00 ART) by `insightMemory.service.js`. Analyzes the last 4 weeks of task data and uses Claude Haiku to produce: `tendencias`, `fortalezas`, `areasDeAtencion`, and raw `estadisticas` (`{ tasaCompletado, promedioTareasPorDia, proyectosSimultaneos }`). Stored in `UserInsightMemory` (one record per user, upserted weekly). Included in both the daily insight context (when `insightMemoryEnabled` is true) and the weekly email report.

**Project detail view:** `/my-projects/:id` shows active tasks grouped by user, tasks completed this week, and a lazy-loaded paginated archive of all completed tasks (20 at a time, `GET /api/projects/:id/completed?skip=N`). Clicking a user's header row opens `UserTasksModal` with all their active tasks and completed-this-week tasks. Each task (title or 💬 button) opens `TaskCommentsModal`. The info panel (situation, links, members, services) is organized in 4 tabs: **Situación** (default), **Links útiles**, **Personas**, **Servicios**. Top navigation has a "← Mis Proyectos" back link and a "Siguiente proyecto →" link that cycles through the user's project list. Admins can access any project regardless of membership. When arriving from a notification (`?task=:id`), `ProjectDetail` auto-opens `TaskCommentsModal` for that task.

**UserTasksModal:** Tasks in `UserTasksModal` (opened from ProjectDetail or RealTime) are now clickable rows that open `TaskCommentsModal` stacked on top. Comment count is shown inline.

**Backlog:** Tasks have an `isBacklog Boolean @default(false)` field. Backlog tasks belong to the current workday but are hidden from the main focus view. They appear in a collapsible "Backlog" section in the Dashboard. `PATCH /api/tasks/:id/move-to-backlog` sets `isBacklog=true` (blocked for IN_PROGRESS and COMPLETED). `PATCH /api/tasks/:id/add-to-today` sets `isBacklog=false` and moves the task to today's workday — carry-over tasks from previous days can also be added to today this way. Backlog tasks show an "Agregar a hoy" button instead of "Iniciar". The backend blocks `start`, `resume`, and `unblock` on backlog tasks with a 400 error. Carry-over tasks from previous days are grouped into the backlog in the Dashboard.

**Completed history:** `GET /api/tasks/completed?skip=N&before=YYYY-MM-DD` returns paginated completed tasks (10 per page) for the logged-in user, filtered to workdays before the given date when `before` is provided. In the Dashboard, the "Completadas" section shows today's completed tasks from local state by default, then lets the user load historical tasks from previous days (10 at a time) via "Cargar más".

**My Projects list:** Shows task count pills per project (IN_PROGRESS, BLOCKED, PAUSED, PENDING, COMPLETED_WEEK). Counts are computed in `list()` via `prisma.task.groupBy` + a separate completed-this-week query, merged into `taskCounts` on each project object.

**Admin panel deep linking:** `Admin.jsx` reads the `?tab=` query param on mount (`useSearchParams`) to open a specific tab directly (e.g., `/admin?tab=role-ai`). Falls back to `'projects'` if the param is absent or invalid.

**Preferences tabs:** `Preferences.jsx` shows a tab bar for admins: **Globales** (default — AI usage panel, project settings, timezone, email sender) and **Personales** (insight toggles, notifications). Non-admin users see only the personal view without tabs.

**AI insight context — backlog separation:** The context sent to Claude explicitly separates backlog tasks from pending tasks, labeling them as "planificación semanal, no son prioridad inmediata." This prevents Claude from suggesting to remove tasks from the backlog in daily coaching.

### Prisma schema notes
- `User.role` is a plain `String` (not an enum) — it references `UserRole.name`.
- `User.isAdmin` is a separate `Boolean` — not derived from `role`.
- When a model has two relations to the same model, named relations are required (see `Task.createdBy` / `Task.user` both pointing to `User`).
- Migrations live in `backend/prisma/migrations/`. Always use `migrate dev` locally and `migrate deploy` in production.
- `prisma migrate dev` fails in non-interactive shells. Workaround: manually create the migration directory + SQL file, then run `prisma migrate deploy` + `prisma generate`.
- Current migrations (in order): `add_missing_indexes`, `add_task_starred`, `add_user_avatar`, `add_notification_type`, `add_weekly_email_preference`, `add_project_links`, `add_daily_insight_preference`, `add_is_admin`, `add_daily_insight_cache`, `add_role_expectation`, `add_alerta_rol_to_insight`, `add_insight_memory`, `add_task_quality`, `add_task_backlog`, `add_task_comments`, `add_project_situation`, `add_project_settings`, `add_missing_indexes` (2nd), `add_project_email_from`, `add_one_active_task_constraint`, `add_ai_token_log`, `add_task_mention_type`, `add_workday_composite_index`.
- `TaskComment.content` is the text field (not `text`) — the table existed prior to migration with this column name. The `parentId` self-relation field exists in the DB for future threading but is not used by the UI yet.
- `WorkDay` has `@@index([userId, date])` (composite) in addition to the individual indexes — added for performance on carry-over queries.

### API routes summary
```
POST   /api/auth/login                   # email/password login
POST   /api/auth/google                  # Google OAuth (ID token)
GET    /api/auth/me                      # returns fresh user from DB (includes avatar, dailyInsightEnabled)
POST   /api/auth/forgot-password
POST   /api/auth/reset-password

GET    /api/profile                      # full profile incl. all preference flags
PATCH  /api/profile                      # update personal data fields
PATCH  /api/profile/avatar               # update avatar (validated against ALLOWED_AVATARS)
PATCH  /api/profile/preferences          # update weeklyEmailEnabled, dailyInsightEnabled, insightMemoryEnabled, taskQualityEnabled
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
PATCH  /api/tasks/:id/add-to-today       # move to today's workday + isBacklog=false
PATCH  /api/tasks/:id/move-to-backlog    # isBacklog=true (blocked if IN_PROGRESS or COMPLETED)
GET    /api/tasks/completed              # paginated history (?skip=N&before=YYYY-MM-DD, 10/page)
PATCH  /api/tasks/:id/duration           # task owner or admin (not admin-only)
DELETE /api/tasks/:id
GET    /api/tasks/:id/comments           # list comments (project member or admin)
POST   /api/tasks/:id/comments           # add comment + notify owner + previous commenters

GET    /api/projects                     # user's projects with taskCounts (or all if admin)
GET    /api/projects/:id/members         # project member list [{id, name, avatar}] (member or admin)
GET    /api/projects/:id/tasks           # active tasks + completedThisWeek + project info
GET    /api/projects/:id/completed       # paginated completed history (?skip=N, returns hasMore)
PUT    /api/projects/:id/links           # save all links for a project (any project member or admin)
GET    /api/realtime                     # team snapshot for today
GET    /api/reports/by-project
GET    /api/reports/by-user
GET    /api/reports/by-user-summary
GET    /api/reports/mine

GET    /api/users                        # list all users (admin only)
GET    /api/users/:id/tasks              # active tasks + completedThisWeek for a user

GET    /api/notifications
POST   /api/notifications/read-all

GET    /api/insights                     # get (or generate) today's AI insight (cached by day)
POST   /api/insights/refresh             # regenerate insight (1h cooldown, returns 429 with waitMins)
POST   /api/insights/feedback            # save "up" | "down" | null feedback

GET    /api/role-expectations/mine       # get role expectation for the current user's role (auth only)
GET    /api/role-expectations            # list all role expectations (admin only)
GET    /api/role-expectations/:roleName  # get one by role name (admin only)
PUT    /api/role-expectations/:roleName  # create or update role expectation (admin only)
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
/admin            → Admin.jsx            (AdminRoute)  — accepts ?tab= query param
```

### Testing
```
backend/
  jest.config.js
  tests/
    setup.js                          # JWT_SECRET env + clearAllMocks
    unit/
      auth.middleware.test.js         # auth + adminOnly middleware (uses isAdmin flag)
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
