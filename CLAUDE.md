# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Proyectos

| | Proyecto individual | Proyecto SaaS |
|---|---|---|
| **URL** | https://team.blissmkt.ar | https://blisstracker.app |
| **GitHub** | https://github.com/gsuarezduek/blisstracker | https://github.com/gsuarezduek/blisstrackerSAAS |
| **Vercel** | Proyecto separado | Proyecto separado (Pro, wildcard `*.blisstracker.app`) |
| **Railway** | Proyecto separado | Proyecto separado (DB + backend nuevos) |

Este repositorio (`team-tracker`) corresponde al **Proyecto SaaS** (`blisstrackerSAAS`).

## Development commands

### Backend (`cd backend`)
```bash
npm run dev          # nodemon, port 3001
npm test             # Jest (unit + integration, with mocks)
npm run test:watch   # Jest in watch mode
npm run test:coverage
npm run db:migrate:dev -- --name <name>  # create and apply a migration
npm run db:migrate   # deploy migrations (production)
npm run db:seed      # seed workspace "bliss", admin user, default roles
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
EMAIL_FROM=BlissTracker <noreply@blisstracker.app>
APP_DOMAIN=blisstracker.app
FRONTEND_URL=http://localhost:5173
GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=...              # client secret del OAuth app de Google Cloud
ANTHROPIC_API_KEY=sk-ant-...
STRIPE_SECRET_KEY=sk_live_...          # o sk_test_... en desarrollo
STRIPE_WEBHOOK_SECRET=whsec_...        # secret del webhook en Stripe Dashboard
STRIPE_PRICE_ID=price_...             # ID del precio por seat/mes en Stripe
ENCRYPTION_KEY=<64 chars hex>         # AES-256-GCM key para cifrar tokens OAuth en DB (node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
BACKEND_URL=https://blisstrackersaas-production.up.railway.app  # URL pública del backend (para construir redirect URI de OAuth)
PAGESPEED_API_KEY=...                 # Google Cloud API Key con acceso a PageSpeed Insights API
SERP_API_KEY=...                      # SerpAPI key (serpapi.com) — SERP snapshots, features y competidores
META_APP_ID=...                       # Facebook App ID (Meta for Developers)
META_APP_SECRET=...                   # Facebook App Secret
TIKTOK_CLIENT_KEY=...                 # TikTok App Client Key (TikTok for Developers)
TIKTOK_CLIENT_SECRET=...              # TikTok App Client Secret
```

**frontend/.env.development**
```
VITE_API_URL=http://localhost:3001
VITE_GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com
```

Default credentials after seed: `admin@blissmkt.ar` / `admin123` (workspace slug: `bliss`)

## Architecture

### Overview
Full-stack SaaS task tracker. Multi-tenant: each workspace is a separate subdomain (`slug.blisstracker.app`). Backend is a REST API; frontend is a React SPA. No shared code between them — they communicate only via HTTP.

### Multi-tenancy

**Workspace resolution:** Every authenticated request from the frontend includes `X-Workspace: <slug>`. The `resolveWorkspace` middleware resolves the slug to a `Workspace` row and injects `req.workspace`. If the workspace doesn't exist → 404; if the user isn't a member → 403.

**JWT payload:** `{ userId, workspaceId, role, teamRole, isSuperAdmin, name, email }`. The `role` field is the workspace role (`owner` | `admin` | `member`). When switching workspaces, a new JWT is issued for that workspace context.

**Data isolation:** All workspace-scoped tables have a `workspaceId` FK. Controllers filter by `req.workspace.id`. No cross-workspace data leakage is possible at the query level.

**Workspace roles** (`WorkspaceMember.role`): `owner` > `admin` > `member`. Team role (`WorkspaceMember.teamRole`) is a separate string referencing `UserRole.name` (e.g. `"DESIGNER"`).

### Backend (`backend/src/`)
- **Express + Prisma + PostgreSQL.** Entry point `index.js` imports the Express app from `app.js`. Routes are mounted under `/api/<resource>`.
- **Auth:** JWT (12h expiry) stored in `localStorage`. Google OAuth 2 via `google-auth-library`. The `auth` middleware attaches `req.user` (decoded JWT payload).
- **Workspace middleware** (`middleware/workspace.js`):
  - `resolveWorkspace` — reads `X-Workspace` header → looks up `Workspace` → attaches `req.workspace` + `req.workspaceMember`. Used on all workspace-scoped routes.
  - `workspaceAdminOnly` — verifies `req.workspaceMember.role === 'admin' | 'owner'`.
- **Super admin** — `User.isSuperAdmin Boolean` is a global flag. The `superAdminOnly` middleware in `superadmin.routes.js` gates the internal panel.
- **Tests:** Jest + Supertest. `jest.config.js` at backend root. All tests in `backend/tests/`. Prisma is mocked with `jest.mock('../lib/prisma')` — no real DB needed.
- All dates for workday logic use `America/Argentina/Buenos_Aires` (UTC-3). Task timestamps are stored in UTC.
- **Email** is sent via Resend HTTP API (`src/services/email.service.js`) — not SMTP. Every send (success or failure) is logged to `EmailLog`. Each email function accepts an optional `workspaceId` as last parameter for the log.
- **Prisma singleton** at `src/lib/prisma.js` — all controllers import from here.
- **Stripe singleton** at `src/lib/stripe.js` — returns `null` if `STRIPE_SECRET_KEY` is missing; all billing code checks for null before calling Stripe.
- **Prisma error helper** at `src/lib/prismaError.js` — `handlePrismaError(err, res)` maps P2025→404, P2002→409, P2003→400.
- **Shared utilities:** `src/utils/dates.js` exports `todayString()` (Buenos Aires timezone).
- **Shared task include:** `tasks.controller.js` and `workdays.controller.js` each define a `taskInclude` constant (`{ project, createdBy, _count: { comments } }`) used in all task queries.
- **Weekly AI report** at `src/services/weeklyReport.service.js` — generates productivity analysis with Claude Haiku, sent every Friday at 14:00 ART via `node-cron`. Sequential processing with 3s delay between users.
- **Insight memory** at `src/services/insightMemory.service.js` — weekly learning profile per user (tendencias, fortalezas, areasDeAtencion, estadisticas) using Claude Haiku. Updated every Saturday at 00:00 ART.
- **GEO audit** at `src/services/geoAudit.service.js` — fetches URL with axios + cheerio, analyzes with Claude (claude-haiku), stores result in `GeoAudit`. Async: controller returns auditId immediately, analysis runs via `setImmediate`. Progress tracked via `errorMsg` field during `running` status. Score 0–100 with 4 bands (Crítico/Base/Bueno/Excelente). Checks 23 AI crawlers (citation vs training), llms.txt, robots.txt, JSON-LD schema.
- **Feature flag catalog** at `src/config/featureFlags.js` — array of `{ key, name, description }`. On server start, all flags are upserted to DB automatically. Never create flags manually from SuperAdmin UI — define them in code.

### Frontend (`frontend/src/`)
- **React 18 + Vite + Tailwind CSS + React Router v6.**
- **Color palette:** Custom `primary` tokens in `tailwind.config.js` based on orange (#F7931A). Status colors: IN_PROGRESS = primary (orange), PAUSED = gray, BLOCKED = red, COMPLETED = green, PENDING = gray.
- **Tests:** Vitest + React Testing Library. Test config in `vite.config.js` (`test` block). All tests in `src/tests/`.
- `api/client.js` — Axios instance: reads `VITE_API_URL`, injects JWT from `localStorage`, injects `X-Workspace: <slug>` header (derived from `window.location.hostname`), redirects to `/login` on 401.
- `context/AuthContext.jsx` — global auth state; validates token on mount via `GET /auth/me`. Exposes `updateUser()` and `switchWorkspace(slug)` (re-issues JWT for the target workspace).
- `context/WorkspaceContext.jsx` — workspace info (name, slug, status, subscription). Loaded from `GET /api/workspaces/current`. Exposes `trialDaysLeft` (derived from `trialEndsAt`) and `isSubscriptionActive`.
- `context/ThemeContext.jsx` — dark mode toggle persisted to `localStorage`.
- `hooks/useRoles.js` — fetches `UserRole` list for label lookups. Module-level cache (once per session).
- `hooks/useInactivity.js` — tracks mouse/keyboard activity; auto-pauses after 120+10 min idle on an IN_PROGRESS task.
- `utils/format.js` — shared `fmtMins()`, `activeMinutes()`, `completedDuration()`.
- `utils/linkify.jsx` — converts plain URLs in text to clickable `<a>` tags.

### Navbar — single source of truth
`Navbar.jsx` defines three arrays that are the single source of truth for both desktop and mobile navigation. Adding an item to any of these automatically appears in both views without duplication:
- `links` — main nav links (Dashboard, Proyectos, etc.). "Marketing" is conditional on `useFeatureFlag('marketing')`.
- `adminSublinks` — items under the "Administración" dropdown
- `profileSections` — items in the user profile menu (Perfil, Docs, Preferencias, Facturación, Super Admin, workspace switcher, logout). "Facturación" visible only for `isAdmin` (admin/owner). Rendered by `renderProfileSections(onClose)` which is called both for the desktop dropdown and the mobile panel.

### Key domain concepts

**Workspace:** The top-level tenant. Has a `slug` (subdomain), `status` (`trialing` | `active` | `past_due` | `suspended` | `cancelled`), and `timezone`. Members are linked via `WorkspaceMember`. Company profile fields: `companyName`, `companyDescription`, `industry`, `companyWebsite`. Brand identity: `brandColors` (JSON `[{ hex, name? }]`), `brandFonts` (JSON `[{ name, role }]` where `role` is `heading|body|accent`). Logo and banner stored as raw bytes in DB: `logoData`/`logoMimeType` and `bannerData`/`bannerMimeType` (max 5 MB via multer memoryStorage). Feature flag opt-out: `disabledFeatureKeys` (JSON array of keys) — workspace admins can disable globally-enabled flags for their workspace from Preferencias → Módulos adicionales.

**WorkspaceMember:** Joins `User` and `Workspace`. Fields: `role` (owner/admin/member), `teamRole` (internal role name), `active`, `vacationDays`, and the four AI preference flags.

**Team management:** Members are added exclusively by invitation. Admin sends invite from **Admin → Equipo**; backend creates `WorkspaceInvitation` with a 7-day token and sends email. The invitee visits `/join?token=...` to accept. No passwords are set or managed from the admin panel — that's the invitee's responsibility.

**WorkDay:** Created automatically when a user visits the Dashboard. One per user per workspace per calendar day (`YYYY-MM-DD` in Buenos Aires time). Closing a workday logs out the user. Tasks from previous days that are still PENDING/PAUSED/BLOCKED are carried over.

**Task status machine:**
```
PENDING → IN_PROGRESS → PAUSED / BLOCKED / COMPLETED
BLOCKED → IN_PROGRESS (unblock)
PAUSED  → IN_PROGRESS (resume)
```
Only one task can be `IN_PROGRESS` per user at a time (enforced via `assertNoActiveTask()`). Blocking requires a reason and notifies all project members.

**Starred tasks:** Up to 3 tasks can be starred simultaneously. `starred` is an Int 0–3 (0=none, 1=green, 2=yellow, 3=red). The star is the sole status indicator on TaskCard. Starred tasks appear in "Destacadas: Foco del día" section.

**Task ordering:** Newest-first within each section. Backend returns `orderBy: { createdAt: 'desc' }`.

**Task comments:** Any project member can comment on any task. `_count.comments` is always included in task responses. Notifications: `TASK_COMMENT` to owner + previous commenters; `TASK_MENTION` to `@mentioned` users (no duplicate with TASK_COMMENT).

**Notifications:** `NotificationType` enum: `COMPLETED` / `BLOCKED` / `ADDED_TO_PROJECT` / `TASK_COMMENT` / `TASK_MENTION`. Bell panel has 6 filter pills. Each notification is a clickable link that auto-opens `TaskCommentsModal`.

**Project links:** Stored in `ProjectLink`. Any project member can add/delete. `PUT /api/projects/:id/links` replaces all links atomically.

**Project info (websiteUrl + connections):** `Project.websiteUrl String?` used for GEO analysis. `Project.connections String @default("{}")` — JSON with keys `instagram`, `facebook`, `linkedin`, `twitter`, `tiktok`, `youtube`. Managed from the **Info** tab in `ProjectDetail.jsx` via `ProjectInfoTab.jsx`. Admins no longer manage URL/links from the Admin panel.

**Billing:** Workspace has `status` (`trialing` | `active` | `past_due` | `suspended` | `cancelled`) and `trialEndsAt`. Trial = 14 days from registration. A cron runs at 03:00 ART daily to mark expired trials as `past_due`. Stripe integration: Customer created async on workspace registration; Checkout session creates the Stripe subscription; webhooks sync status back to DB. `Subscription` model stores `stripeSubId`, `seats`, `periodStart/End`. Billing actions (Checkout + Portal) require `admin` or `owner` role. `TrialBanner` component shows in Navbar when `trialDaysLeft <= 7` or `status === 'past_due'`. The `bliss` workspace is exempt — set `status = 'active'` manually via SuperAdmin; no Stripe subscription is ever created for it.

**Feature flags:** Defined in `src/config/featureFlags.js`. Auto-upserted on server startup. SuperAdmin manages which workspaces have access (enabledGlobally or per-workspace list). Frontend uses `useFeatureFlag(key)` hook — cached in memory per session. Never create flags manually from the UI. **Workspace opt-out:** even if a flag is enabled by SuperAdmin, a workspace admin can disable it for their workspace via `PATCH /api/workspaces/current/features/:key` (stored in `Workspace.disabledFeatureKeys`). Visible in Preferencias → Módulos adicionales.

**GEO Audit (Marketing):** `GeoAudit` model stores per-project AI analysis results. Score 0–100, 6 components (citability, brandAuthority, eeat, technical, schema, platforms), unified items list, negative signals. Async pattern: `POST /api/marketing/geo/audit` creates record with `status: 'running'` and returns `auditId` immediately; frontend polls `GET /api/marketing/geo/audits/:id` every 3s. Progress steps stored in `errorMsg` during running, cleared on completion. Tasks can be created directly from audit items with "GEO - " prefix.

**Roles:** `WorkspaceMember.teamRole` is a plain `String` referencing `UserRole.name`. Admin access is `WorkspaceMember.role === 'admin' | 'owner'`, fully decoupled from team role.

**Avatars:** Stored as filenames in `User.avatar`. Default: `2bee.png`. Images live in `frontend/public/perfiles/`. Validated against `ALLOWED_AVATARS` in `profile.controller.js`. Clicking opens a fullscreen lightbox.

**User preferences:** Four boolean flags on `WorkspaceMember`, all `@default(true)`:
- `weeklyEmailEnabled` — AI weekly email every Friday 14:00 ART.
- `dailyInsightEnabled` — master toggle for the entire AI insight system.
- `insightMemoryEnabled` — weekly learning profile generation.
- `taskQualityEnabled` — GTD task description coaching in the daily insight.

`insightMemoryEnabled` and `taskQualityEnabled` are subordinate to `dailyInsightEnabled`. Turning off the master toggle sends a single PATCH with all three insight flags set to `false`. Managed via `PATCH /api/profile/preferences`.

**Daily AI insight:** Generated by `insights.controller.js` using Claude Haiku. Cached once per user per day in `DailyInsight` (`userId + workspaceId + date` unique). Context: current task states + carry-over flags + weekly summary by project + role expectations + user memory profile. Output JSON: `{ titulo, mensaje, sugerencia, alertaRol, alertaGTD, tono }`. Regenerate has 1h cooldown (429 + `waitMins`).

**Role expectations:** Admin-configurable per role via "🎯 Roles IA" tab in Admin panel. Stored in `RoleExpectation` with `roleName`, `description`, `recurrentTasks` (JSON: `[{task, frequency, detail}]`), `dependencies` (JSON). Frequencies: `daily`, `weekly`, `monthly`, `first_week`.

**User insight memory:** Generated weekly (Saturday 00:00 ART) by `insightMemory.service.js`. Stored in `UserInsightMemory` (one record per user per workspace per weekStart, upserted).

**Admin panel deep linking:** `Admin.jsx` reads `?tab=` query param on mount. Valid tabs: `projects`, `team`, `services`, `roles`, `role-ai`, `empresa`. Falls back to `'projects'`.

**Preferences:** For admins, shows two tabs — **Globales** (workspace settings: timezone, project settings) and **Personales** (AI feature toggles + **Módulos adicionales**: opt-out de feature flags habilitados por SuperAdmin para este workspace). Non-admins see only the personal view without the modules section.

**Login tracking:** Every successful login records a `UserLogin` row (userId, workspaceId, loginAt UTC, method). Used in the RRHH panel for login history and average login time.

**RRHH panel (`/admin/rrhh`):** Three-part structure:
- **MiniDashboard** — active users, avg tenure, incomplete profiles, upcoming birthdays/anniversaries (30d), role distribution, last login per person.
- **Legajos tab** — per-person view: avg login time, projects, vacation days (±1 buttons), personal data grid.
- **Ingresos tab** — date range filter + person filter, login history grouped by user, sort by avg time.

**Super Admin panel (`/superadmin`):** Internal panel for the BlissTracker team (requires `User.isSuperAdmin`). Sidebar navigation:
- **Dashboard** — global stats (workspaces, users, AI tokens) + workspace list with search + status management + impersonation.
- **Billing** — MRR, ARR, conteos por estado (activos/trial/past_due), tabla de todos los workspaces con filtros. Precio base `$10 USD/seat/mes` hardcodeado en `superadmin.controller.js`.
- **Feedback** — all feedback from all workspaces with read/unread filtering.
- **Emails** — full `EmailLog` history with type/status filters and pagination.
- **Announcements** — banners globales visibles en la app.
- **Avatares** — gestión de fotos de perfil disponibles.
- **Feature Flags** — toggle de flags por workspace o globalmente. Los flags se definen en código, no se crean desde la UI.

**Email logging:** All emails (sent or failed) are written to `EmailLog` with: workspaceId?, to, subject, type, status, errorMsg?, createdAt. The `email.service.js` wraps every send in try/catch and logs both outcomes. Visible in the Super Admin panel → Emails section.

**Workspace deletion:** Owner can schedule deletion from Preferences → Zona de peligro. Creates `WorkspaceDeletionRequest` with 48h grace period. A warning email is sent to all admins. Any admin can cancel. A cron job checks for due deletions and executes `executeWorkspaceDeletion()`.

**Backlog:** `isBacklog Boolean @default(false)` on Task. Backlog tasks are hidden from the main focus view. `add-to-today` sets `isBacklog=false` and moves to today's workday. The insight context labels backlog tasks as "planificación semanal, no son prioridad inmediata."

**AI insight context — backlog separation:** Backlog tasks are explicitly separated from pending tasks in the Claude prompt to prevent suggesting their removal.

**EOS module (`/admin/eos`):** Sistema Operativo Empresarial basado en *Traction* de Gino Wickman. Seis componentes implementados:
- **Visión** — datos estratégicos del workspace (valores, misión, BHAG, estrategia, metas 1 año). Toggle "Ver VTO" muestra el Vision/Traction Organizer en formato del libro.
- **Personas** — People Analyzer (ratings GWC por persona) + Accountability Chart (árbol de responsabilidades jerárquico) + Strikes.
- **Datos** — Scorecard semanal con métricas numéricas, responsables y objetivos. Períodos: `YYYY-Www` (ISO week).
- **Asuntos** — Issues IDS (Identify-Discuss-Solve). Tipos: `weekly` | `quarterly`. Estados: `open` | `solved`. Prioridades: `high` | `medium` | `low`.
- **Procesos** — Documentación de procesos con pasos ordenados.
- **Tracción** — Rocks trimestrales (`YYYY-Q1..Q4`) + reuniones L10 semanales (ISO week) + To-Dos de la reunión.
- **Evaluación** — 18 preguntas (6 componentes EOS × 3) calificadas 1–5 por cada admin. Genera resultado grupal promediado con análisis Claude Haiku. Modelos: `OrgAssessmentRound` (estado `open`/`closed`) + `OrgAssessmentResponse` (única por round+user). Ruta: `GET/POST /api/eos/assessment`.

Todos los modelos EOS tienen `workspaceId` como scope. Las rutas `/api/eos/*` requieren `workspaceAdminOnly`.

**VacationRequest:** Sistema de licencias del equipo. Tipos: `vacaciones` | `estudio` | `maternidad` | `paternidad` | `enfermedad` | `duelo` | `mudanza` | `otro`. Flujo: member crea solicitud → admin aprueba/rechaza → notificaciones + email a ambos lados. Validación: `startDate` debe ser con al menos 48h de anticipación. Estados: `pending` | `approved` | `rejected`. Admins también pueden ajustar el saldo de días de vacaciones manualmente (`VacationAdjustment`).

### Prisma schema notes
- `WorkspaceMember.role`: `owner` | `admin` | `member` (workspace-level permissions).
- `WorkspaceMember.teamRole`: plain `String` referencing `UserRole.name` (e.g. `"DESIGNER"`).
- `User.isSuperAdmin Boolean @default(false)` — global flag for the BlissTracker internal team only.
- `User.avatar String @default("2bee.png")` — filename, validated against `ALLOWED_AVATARS`.
- When a model has two relations to the same model, named relations are required (e.g. `Task.createdBy` / `Task.user` both pointing to `User`).
- `ProjectIntegration.propertyId` tiene distintos usos según `type`: GA4 → Property ID numérico; `google_ads` → Manager Account ID (MCC) si la cuenta es cliente de un manager; Meta Ads → no usado; TikTok → no usado.
- Migrations live in `backend/prisma/migrations/`. Always use `migrate dev` locally and `migrate deploy` in production.
- `prisma migrate dev` fails in non-interactive shells. Workaround: manually create the migration directory + SQL file, then run `prisma migrate deploy` + `prisma generate`.
- Current migrations (in order): `add_missing_indexes`, `add_task_starred`, `add_user_avatar`, `add_notification_type`, `add_weekly_email_preference`, `add_project_links`, `add_daily_insight_preference`, `add_is_admin`, `add_daily_insight_cache`, `add_role_expectation`, `add_alerta_rol_to_insight`, `add_insight_memory`, `add_task_quality`, `add_task_backlog`, `add_project_member_notification`, `add_task_comments`, `v1_5`, `add_project_situation`, `add_project_settings`, `add_missing_indexes` (2nd), `add_project_email_from`, `add_one_active_task_constraint`, `add_ai_token_log`, `add_task_mention_type`, `add_workday_composite_index`, `add_memory_history`, `add_role_structure`, `add_user_login_history`, `add_vacation_days`, `add_bank_name`, `add_task_sessions`, `add_saas_multitenancy` (Workspace + WorkspaceMember + Subscription + scoped all tables), `add_workspace_invitation`, `add_email_log`, `add_vacation_management` (VacationRequest + VacationAdjustment), `add_workspace_deletion_request`, `add_announcements`, `add_avatars`, `fix_vacation_schema`, `add_feature_flags`, `add_marketing_geo` (GeoAudit + Project.websiteUrl), `add_project_connections` (Project.connections JSON), `fix_service_unique_index`, `add_legal_document`, `add_project_integration` (ProjectIntegration — tokens OAuth cifrados), `fix_project_name_unique`, `add_analytics_snapshot` (AnalyticsSnapshot + AnalyticsInsight), `add_instagram_snapshot`, `add_integration_country`, `add_keyword_tracking` (TrackedKeyword + KeywordRanking), `add_pagespeed_result` (PageSpeedResult), `add_instagram_follower_log`, `add_tiktok` (TikTokSnapshot + TikTokFollowerLog), `add_monthly_report` (MonthlyReport — token UUID para URL pública), `add_monthly_report_analysis`, `add_seo_snapshot` (SEOSnapshot para Google Search Console), `add_ai_traffic_snapshot`, `add_cannibal_report`, `add_eos_data`, `add_eos_focus`, `add_eos_ten_year_target`, `add_eos_vision_remaining`, `add_eos_issues` (EOSIssue), `add_eos_personas`, `add_eos_processes`, `add_eos_scorecard`, `add_eos_traction` (EOSRock + EOSTodo + EOSMeeting), `add_org_assessment` (OrgAssessmentRound + OrgAssessmentResponse), `add_workspace_branding` (companyName, companyDescription, industry, companyWebsite, logoData, bannerData + brandColors, brandFonts), `add_workspace_brand_identity` (disabledFeatureKeys en Workspace + dataCache en MonthlyReport).
- `TaskComment.content` is the text field (not `text`). The `parentId` self-relation exists for future threading but is not used by the UI yet.

### API routes summary
```
POST   /api/auth/login
POST   /api/auth/google
GET    /api/auth/me
POST   /api/auth/forgot-password
POST   /api/auth/reset-password

GET    /api/profile
PATCH  /api/profile
PATCH  /api/profile/avatar
PATCH  /api/profile/preferences          # weeklyEmailEnabled, dailyInsightEnabled, insightMemoryEnabled, taskQualityEnabled
POST   /api/profile/weekly-email/send    # trigger test email immediately
POST   /api/profile/change-password

# Workspace
POST   /api/workspaces                    # crear workspace (registro público)
GET    /api/workspaces/info               # info pública (no auth, usa X-Workspace header)
GET    /api/workspaces/mine              # workspaces del usuario autenticado
GET    /api/workspaces/current
PATCH  /api/workspaces/current           # admin: editar nombre, timezone, datos de empresa, brandColors, brandFonts
GET    /api/workspaces/current/members
PUT    /api/workspaces/current/members/:userId        # admin: editar teamRole, memberRole
PATCH  /api/workspaces/current/members/:userId/toggle-active
POST   /api/workspaces/current/invitations            # admin: invitar por email
GET    /api/workspaces/current/invitations
DELETE /api/workspaces/current/invitations/:id
GET    /api/workspaces/invitations/:token             # info pública de invitación
POST   /api/workspaces/join                           # aceptar invitación
GET    /api/workspaces/current/deletion-request
POST   /api/workspaces/current/deletion-request      # owner: programar eliminación (48h)
DELETE /api/workspaces/current/deletion-request      # admin: cancelar eliminación
POST   /api/workspaces/current/logo                  # admin: subir logo (multipart image, max 5MB)
DELETE /api/workspaces/current/logo                  # admin: eliminar logo
POST   /api/workspaces/current/banner                # admin: subir banner (multipart image, max 5MB)
DELETE /api/workspaces/current/banner                # admin: eliminar banner
GET    /api/workspaces/current/features              # admin: listar feature flags habilitados + opt-out state
PATCH  /api/workspaces/current/features/:key         # admin: toggle opt-out de un feature flag

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
PATCH  /api/tasks/:id/add-to-today
PATCH  /api/tasks/:id/move-to-backlog
GET    /api/tasks/completed              # ?skip=N&before=YYYY-MM-DD, 10/page
PATCH  /api/tasks/:id/duration           # task owner or admin
DELETE /api/tasks/:id
GET    /api/tasks/:id/comments
POST   /api/tasks/:id/comments

GET    /api/projects
PUT    /api/projects/:id                 # admin: editar nombre, websiteUrl, connections, serviceIds, memberIds
GET    /api/projects/:id/members
GET    /api/projects/:id/tasks
GET    /api/projects/:id/completed       # ?skip=N
PUT    /api/projects/:id/links
GET    /api/realtime
GET    /api/reports/by-project
GET    /api/reports/by-user
GET    /api/reports/by-user-summary
GET    /api/reports/mine

GET    /api/users                        # workspace members (admin)
GET    /api/users/:id/tasks

GET    /api/admin/rrhh/logins
GET    /api/admin/rrhh/last-logins
GET    /api/admin/rrhh/user-summary/:id
PATCH  /api/admin/rrhh/vacation-days/:id

GET    /api/notifications
POST   /api/notifications/read-all

# Vacaciones y licencias
GET    /api/vacation/my                           # saldo + solicitudes propias
POST   /api/vacation/my/request                  # crear solicitud (≥48h anticipación)
PATCH  /api/vacation/admin/adjust/:userId         # admin: ajustar saldo de días
GET    /api/vacation/admin/adjustments/:userId    # admin: historial de ajustes
GET    /api/vacation/admin/requests               # admin: listar todas las solicitudes
PATCH  /api/vacation/admin/requests/:id          # admin: aprobar o rechazar

# EOS (requiere workspaceAdminOnly)
GET    /api/eos                                   # datos del workspace EOS
PATCH  /api/eos                                  # actualizar datos EOS
GET    /api/eos/personas
PATCH  /api/eos/people-analyzer                  # upsert rating GWC de un miembro
POST   /api/eos/strikes
DELETE /api/eos/strikes/:id
POST   /api/eos/accountability                   # crear nodo del Accountability Chart
PATCH  /api/eos/accountability/:id
DELETE /api/eos/accountability/:id
GET    /api/eos/scorecard                        # ?period=YYYY-Www
POST   /api/eos/scorecard
PATCH  /api/eos/scorecard/:id
DELETE /api/eos/scorecard/:id
PUT    /api/eos/scorecard/:id/entries/:period    # upsert entrada semanal de métrica
GET    /api/eos/processes
POST   /api/eos/processes
PATCH  /api/eos/processes/:id
DELETE /api/eos/processes/:id
POST   /api/eos/processes/:id/steps
PATCH  /api/eos/processes/:id/steps/:stepId
DELETE /api/eos/processes/:id/steps/:stepId
GET    /api/eos/issues                           # ?type=weekly|quarterly
POST   /api/eos/issues
PATCH  /api/eos/issues/:id
DELETE /api/eos/issues/:id
GET    /api/eos/traction/rocks                   # ?quarter=YYYY-Q1
POST   /api/eos/traction/rocks
PATCH  /api/eos/traction/rocks/:id
DELETE /api/eos/traction/rocks/:id
GET    /api/eos/traction/week                    # ?week=YYYY-Www — rocks + todos + meeting
POST   /api/eos/traction/todos
PATCH  /api/eos/traction/todos/:id
DELETE /api/eos/traction/todos/:id
PUT    /api/eos/traction/meetings/:week          # upsert datos de la reunión L10
GET    /api/eos/assessment                       # ronda actual + mis respuestas + historial
POST   /api/eos/assessment/start                 # admin: abrir nueva ronda
POST   /api/eos/assessment/rounds/:id/response   # enviar respuestas (upsert)
POST   /api/eos/assessment/rounds/:id/close      # admin: cerrar ronda + generar análisis IA

GET    /api/insights
POST   /api/insights/refresh
POST   /api/insights/feedback

GET    /api/role-expectations/mine
GET    /api/role-expectations
GET    /api/role-expectations/:roleName
PUT    /api/role-expectations/:roleName

# Marketing (requiere feature flag 'marketing')
POST   /api/marketing/geo/audit          # dispara audit async, devuelve { auditId }
GET    /api/marketing/geo/audits         # lista audits del workspace (?projectId=)
GET    /api/marketing/geo/audits/:id     # detalle completo de un audit

# Marketing — OAuth callbacks (sin auth — vienen de Google/Meta/TikTok)
GET    /api/marketing/integrations/google/callback          # callback Google OAuth
GET    /api/marketing/integrations/meta/callback            # callback Instagram Business Login
GET    /api/marketing/integrations/meta-ads/callback        # callback Meta Ads (Facebook Login)
GET    /api/marketing/integrations/tiktok/callback          # callback TikTok OAuth (PKCE)

# Marketing — Integraciones (requieren auth)
GET    /api/marketing/integrations/google/auth-url          # ?projectId=&type=google_analytics
GET    /api/marketing/integrations/meta/auth-url            # ?projectId=
GET    /api/marketing/integrations/meta-ads/auth-url        # ?projectId=
GET    /api/marketing/integrations/tiktok/auth-url          # ?projectId=
POST   /api/marketing/projects/:id/integrations/connect-existing  # reutiliza tokens vigentes del workspace (mismo type)
GET    /api/marketing/projects/:id/integrations             # lista integraciones del proyecto
PATCH  /api/marketing/projects/:id/integrations/:type       # actualizar propertyId / customerId
DELETE /api/marketing/projects/:id/integrations/:type       # desconectar integración + revocar token

# Marketing — Analytics GA4
GET    /api/marketing/projects/:id/analytics                # ?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD

# Marketing — Google Ads
GET    /api/marketing/projects/:id/google-ads               # ?datePreset= — requiere customerId en integration + GOOGLE_ADS_DEVELOPER_TOKEN

# Marketing — Meta Ads
GET    /api/marketing/projects/:id/meta-ads                 # ?datePreset= — usa token de ProjectIntegration type=meta_ads

# Marketing — Instagram
GET    /api/marketing/projects/:id/instagram                # métricas del mes actual
GET    /api/marketing/projects/:id/instagram/snapshots      # ?months=12
POST   /api/marketing/projects/:id/instagram/snapshots      # body: { month }
GET    /api/marketing/projects/:id/instagram/followers      # ?from=YYYY-MM-DD&to=YYYY-MM-DD

# Marketing — TikTok
GET    /api/marketing/projects/:id/tiktok                   # métricas del mes actual
GET    /api/marketing/projects/:id/tiktok/snapshots         # ?months=12
POST   /api/marketing/projects/:id/tiktok/snapshots         # body: { month }
GET    /api/marketing/projects/:id/tiktok/followers         # ?from=YYYY-MM-DD&to=YYYY-MM-DD

# Marketing — Snapshots GA4 e Insights IA
GET    /api/marketing/projects/:id/snapshots                # ?month=YYYY-MM
POST   /api/marketing/projects/:id/snapshots                # body: { month } — guarda snapshot GA4 del mes
GET    /api/marketing/projects/:id/insights/:month          # análisis IA del mes (YYYY-MM)
POST   /api/marketing/projects/:id/insights/:month          # genera análisis IA con Claude Haiku

# Marketing — PageSpeed Insights
POST   /api/marketing/projects/:id/pagespeed                # body: { strategy } — dispara análisis async, devuelve { resultId }
GET    /api/marketing/projects/:id/pagespeed                # ?strategy=mobile&limit=5 — historial de resultados
GET    /api/marketing/projects/:id/pagespeed/:resultId      # estado y detalle de un análisis

# Marketing — Search Console (SEO)
GET    /api/marketing/projects/:id/search-console           # ?startDate=&endDate=&compare=true — datos live GSC
GET    /api/marketing/projects/:id/search-console/query-pages  # top queries + páginas
GET    /api/marketing/projects/:id/seo/snapshot/:month      # obtener SEOSnapshot guardado (YYYY-MM)
POST   /api/marketing/projects/:id/seo/snapshots            # body: { month } — guardar snapshot GSC manualmente
GET    /api/marketing/projects/:id/seo/ai-insights          # análisis IA SEO del mes
POST   /api/marketing/projects/:id/seo/ai-insights          # generar análisis IA SEO

# Marketing — Keyword Tracking
GET    /api/marketing/projects/:id/keywords                 # lista keywords trackeadas (?country=)
POST   /api/marketing/projects/:id/keywords                 # body: { query } — agregar keyword
DELETE /api/marketing/projects/:id/keywords/:kwId           # eliminar keyword
GET    /api/marketing/projects/:id/keywords/suggest         # sugerencias GSC (?country=)
GET    /api/marketing/projects/:id/keywords/heatmap         # heatmap de posiciones (últimos 6 meses)
GET    /api/marketing/projects/:id/keywords/history-batch   # ?months=6 — historial de múltiples keywords
GET    /api/marketing/projects/:id/keywords/:kwId/history   # historial de una keyword
POST   /api/marketing/projects/:id/keywords/:kwId/analysis  # análisis IA de una keyword

# Marketing — Informes mensuales (autenticados)
GET    /api/marketing/projects/:id/reports                  # lista informes del proyecto
GET    /api/marketing/projects/:id/reports/:month           # obtiene/crea informe (YYYY-MM) + agrega datos
PATCH  /api/marketing/projects/:id/reports/:month           # actualiza objectives y notes

# Informes — acceso público (sin auth)
GET    /api/public/report/:token                            # datos completos del informe para el cliente

# Billing
GET    /api/billing/status               # estado trial/suscripción del workspace
POST   /api/billing/checkout             # crea Stripe Checkout session (admin/owner)
POST   /api/billing/portal               # abre Stripe Customer Portal (admin/owner)
POST   /api/billing/webhook              # webhook Stripe (raw body, no auth)

# Super Admin (requiere isSuperAdmin)
GET    /api/superadmin/stats
GET    /api/superadmin/billing           # MRR, ARR, tabla de todos los workspaces
GET    /api/superadmin/workspaces
GET    /api/superadmin/workspaces/:id
PATCH  /api/superadmin/workspaces/:id/status
POST   /api/superadmin/impersonate
GET    /api/superadmin/feedback
PUT    /api/superadmin/feedback/:id/read
GET    /api/superadmin/email-logs
GET    /api/superadmin/feature-flags
POST   /api/superadmin/feature-flags
PATCH  /api/superadmin/feature-flags/:id
DELETE /api/superadmin/feature-flags/:id
GET    /api/feature-flags/:key           # check flag para workspace actual (autenticado)
```

### Frontend routes
```
/login            → Login2.jsx
/register         → Register.jsx        (crear workspace)
/join             → Join.jsx            (aceptar invitación, ?token=)
/forgot-password  → ForgotPassword.jsx
/reset-password   → ResetPassword.jsx
/                 → Dashboard.jsx        (PrivateRoute)
/my-reports       → MyReports.jsx        (PrivateRoute)
/my-projects      → MyProjects.jsx       (PrivateRoute)
/my-projects/:id  → ProjectDetail.jsx    (PrivateRoute)
/profile          → MyProfile.jsx        (PrivateRoute)
/preferences      → Preferences.jsx      (PrivateRoute)
/realtime         → RealTime.jsx         (PrivateRoute)
/docs             → Docs.jsx             (PrivateRoute)
/marketing        → Marketing.jsx        (PrivateRoute) — tabs GEO y Web operativos; Informes con informe mensual consolidado
/report/:token    → ReportPublic.jsx     (pública, sin auth) — informe mensual para clientes identificado por token UUID
/oauth-result     → OAuthResult.jsx      (pública) — puente de callback OAuth: postMessage al opener y cierra popup
/billing          → Billing.jsx          (PrivateRoute) — visible para todos; acciones solo admin/owner
/reports             → Reports.jsx          (AdminRoute)
/admin               → Admin.jsx            (AdminRoute)  — ?tab= query param
/admin/productivity  → Productivity.jsx     (AdminRoute)
/admin/rrhh          → RRHH.jsx             (AdminRoute)
/admin/eos           → EOS.jsx              (AdminRoute)  — 7 tabs: Visión, Personas, Datos, Asuntos, Procesos, Tracción, Evaluación
/superadmin          → SuperAdmin.jsx        (SuperAdminRoute — requiere isSuperAdmin)
```

### Cron jobs (`backend/src/index.js`)

| Schedule | Timezone | Descripción |
|----------|----------|-------------|
| `1 0 * * 5` (viernes 00:01) | ART | Envía resúmenes semanales de IA por email a todos los miembros |
| `0 0 * * 6` (sábados 00:00) | ART | Actualiza perfil de memoria de insights por usuario |
| `0 1 1 * *` (1° mes 01:00) | ART | Corre audits GEO mensuales para todos los proyectos con websiteUrl |
| `0 2 1 * *` (1° mes 02:00) | ART | Guarda snapshot de analytics GA4 del mes anterior |
| `30 2 1 * *` (1° mes 02:30) | ART | Guarda snapshot de Google Search Console del mes anterior |
| `30 3 1 * *` (1° mes 03:30) | ART | Corre análisis PageSpeed (mobile + desktop) para todos los proyectos con websiteUrl |
| `0 4 1 * *` (1° mes 04:00) | ART | Guarda rankings de keywords (Google Search Console) del mes anterior |
| `30 4 1 * *` (1° mes 04:30) | ART | Guarda snapshot de Instagram del mes anterior |
| `0 5 1 * *` (1° mes 05:00) | ART | Envía informe mensual de marketing (legacy service) |
| `30 5 1 * *` (1° mes 05:30) | ART | Guarda snapshot de TikTok del mes anterior |
| `0 6 * * 1` (lunes 06:00) | ART | Actualiza rankings de keywords del mes actual (upsert semanal) |
| `0 3 * * *` (diario 03:00) | ART | Marca trials expirados como `past_due` |
| `0 0 * * *` (medianoche) | ART | Auto-pausa tareas `IN_PROGRESS` al cierre del día |
| `0 3 * * 0` (domingos 03:00) | ART | Limpia notificaciones antiguas (leídas >30d, no leídas >90d) |
| `*/15 * * * *` (cada 15 min) | — | Ejecuta eliminaciones de workspaces programadas vencidas |

Todos los jobs con lógica pesada usan in-memory locks (`let jobRunning = false`) para evitar solapamiento.

### Testing
```
backend/
  jest.config.js
  tests/
    setup.js          ← define JWT_SECRET, NODE_ENV, RESEND_API_KEY (dummy) para evitar que email.service.js falle al importarse
    unit/
      auth.middleware.test.js
      assertNoActiveTask.test.js
      analyticsSnapshot.helpers.test.js   # monthBounds, prevMonth, delta helpers
      pageSpeed.helpers.test.js           # URL normalization, scoreRating, parseAudit
    integration/
      auth.test.js
      starTask.test.js
      taskComments.test.js
      announcements.controller.test.js
      backlog.test.js
      projectLinks.test.js
      vacation.controller.test.js         # usa fechas dinámicas (futureDate) para respetar validación ≥48h

frontend/
  src/tests/
    setup.js
    utils/
      format.test.js
      linkify.test.jsx
      webTabDates.test.js                 # getDateParams, formatDateLabel, currentMonthStr, prevMonthStr
    hooks/
      useRoles.test.js
```

### Deploy
- **Backend:** Railway (auto-runs `npm run db:migrate` on deploy; seed must be run manually once). Required env vars: `DATABASE_URL`, `JWT_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM`, `APP_DOMAIN`, `GOOGLE_CLIENT_ID`, `ANTHROPIC_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID`, `GOOGLE_CLIENT_SECRET`, `ENCRYPTION_KEY`, `BACKEND_URL`, `PAGESPEED_API_KEY`, `META_APP_ID`, `META_APP_SECRET`, `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`.
- **Scripts de utilidad:** `backend/scripts/` — scripts de uso único para operaciones directas en DB (ej: `insert-meta-ads-token.js`, `create-test-user.js`). Ejecutar con `DATABASE_URL=... ENCRYPTION_KEY=... node scripts/<nombre>.js`.
- **Frontend:** Vercel Pro (root: `/frontend`; `vercel.json` rewrites all paths to `index.html`). Add `*.blisstracker.app` as Custom Domain. Required env vars: `VITE_API_URL`, `VITE_GOOGLE_CLIENT_ID`.
- **DNS (Cloudflare):** `A blisstracker.app → Vercel` + `A *.blisstracker.app → Vercel` (wildcard requires Vercel Pro).
- **Backend CORS:** `app.js` allows `*.blisstracker.app` via regex — do not hardcode a single origin.
- **Stripe webhook:** must point to `https://<railway-backend-url>/api/billing/webhook`. Events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_succeeded`, `invoice.payment_failed`. Accepts all events — unhandled ones are silently ignored.
- **`bliss` workspace:** permanently exempt from billing. Set `status = 'active'` via SuperAdmin → Workspaces. No Stripe subscription ever created; cron and webhooks never affect it.

### Google Cloud APIs habilitadas

Proyecto OAuth: el mismo que usa el login con Google (`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`).

| API | Uso actual | Autenticación |
|-----|-----------|---------------|
| **Google Analytics Data API** | Marketing → Informes: métricas GA4 por proyecto | OAuth (refresh token por proyecto) |
| **Google Analytics Admin API** | Futuro: listar properties disponibles (evitar tipear Property ID a mano) | OAuth |
| **Google Analytics API** | Legacy / fallback UA — habilitada por si acaso | OAuth |
| **Google Search Console API** | Futuro: tab SEO — impresiones, clicks, posición | OAuth |
| **PageSpeed Insights API** | Marketing → Web: performance score, CWV, oportunidades y diagnósticos | API Key (`PAGESPEED_API_KEY`) |
| **YouTube Analytics API** | Futuro: métricas de canal YouTube por proyecto | OAuth |
| **Business Profile Performance API** | Futuro: métricas de Google My Business | OAuth |

**Redirect URIs registradas en Cloud Console (Google):**
- `https://blisstrackersaas-production.up.railway.app/api/marketing/integrations/google/callback` (producción)
- `http://localhost:3001/api/marketing/integrations/google/callback` (desarrollo)

**Redirect URIs registradas en Meta for Developers (Instagram):**
- `https://blisstrackersaas-production.up.railway.app/api/marketing/integrations/meta/callback` (producción)
- `http://localhost:3001/api/marketing/integrations/meta/callback` (desarrollo)

**Redirect URIs registradas en Meta for Developers:**
- Instagram Business Login: `https://blisstrackersaas-production.up.railway.app/api/marketing/integrations/meta/callback`
- Meta Ads (Facebook Login): `https://blisstrackersaas-production.up.railway.app/api/marketing/integrations/meta-ads/callback`
- (+ variantes `http://localhost:3001/...` para desarrollo)

**Redirect URIs registradas en TikTok for Developers:**
- `https://blisstrackersaas-production.up.railway.app/api/marketing/integrations/tiktok/callback`
- `http://localhost:3001/api/marketing/integrations/tiktok/callback`

**OAuth Consent Screen scopes habilitados (Google):**
- `https://www.googleapis.com/auth/analytics.readonly` — verificación en curso
- `https://www.googleapis.com/auth/adwords` — pendiente Standard Access approval de Google Ads

**Permisos requeridos en Meta App:**
- Instagram Business Login: `instagram_business_basic`, `instagram_business_manage_insights` — App Review en curso
- Facebook Login (Meta Ads): `ads_read` — requiere Business Verification + App Review. En desarrollo: usar System User Token generado desde Business Manager → Settings → System Users → Generate Token (Never expiry).
- Notas de implementación Instagram:
  - Usar `instagram.com/oauth/authorize` (NO `facebook.com/dialog/oauth`)
  - Token exchange: POST `api.instagram.com/oauth/access_token`
  - Long-lived token: GET `graph.instagram.com/access_token?grant_type=ig_exchange_token`
  - Todas las llamadas de datos usan `graph.instagram.com/me` (NO `/{user_id}` — da OAuthException code 2)
  - El `user_id` del token exchange es app-scoped; usar el `id` de `/me` como `propertyId`

**Permisos requeridos en TikTok App:**
- `user.info.basic`, `user.info.profile`, `user.info.stats`, `video.list` — App Review en curso
- OAuth v2 requiere PKCE obligatorio: `code_verifier` generado con `crypto.randomBytes(32).toString('base64url')`, `code_challenge = base64url(sha256(codeVerifier))`. El `codeVerifier` se almacena en el JWT state (10min) y se recupera en el callback.
- Access tokens duran 24h, refresh tokens duran 365 días. `tiktokTokenRefresh.service.js` renueva automáticamente.

**Token expiry — patrón unificado:**
- Todos los servicios de integración detectan tokens expirados y marcan `ProjectIntegration.status = 'expired'`
- Los controllers devuelven `{ error: '...', code: 'TOKEN_EXPIRED' }` con status HTTP 400 (nunca 401 — evita logout del usuario)
- El frontend detecta `code === 'TOKEN_EXPIRED'` y muestra prompt de reconexión
- `connect-existing` solo reutiliza tokens con `status: 'active'` y `expiresAt > now` — si todos expiraron cae al flujo OAuth completo
- Google tokens: `invalid_grant` → status `expired`, requiere reconectar. App en modo Testing expira tokens a los 7 días — publicar la app en Google Cloud Console para tokens permanentes.
