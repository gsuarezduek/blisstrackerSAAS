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
LINKEDIN_CLIENT_ID=...                # LinkedIn App Client ID (developer.linkedin.com)
LINKEDIN_CLIENT_SECRET=...            # LinkedIn App Client Secret
APIFY_API_TOKEN=apify_api_...         # Token de Apify (apify.com) para scraping de RRSS. Sin esto, el scraping devuelve SCRAPE_NOT_CONFIGURED
APIFY_INSTAGRAM_ACTOR=...             # (opcional) actor de Apify para Instagram. Default: apify~instagram-profile-scraper
APIFY_INSTAGRAM_POSTS_LIMIT=60        # (opcional) posts recientes a traer por scrape. Default 60 — debe cubrir el mes completo; subir para cuentas muy activas
APIFY_LINKEDIN_ACTOR=...             # actor de Apify para Company Pages de LinkedIn. FALLBACK del PlatformSetting `apifyLinkedinActor` (editable desde SuperAdmin → Configuración, que tiene prioridad). Sin el setting NI la env → SCRAPE_NOT_CONFIGURED. El normalizador tolera varios shapes de actor; si tu actor usa otras claves de input/output, el punto único de ajuste es runApifyLinkedin/normalizeApifyCompany en socialScrape.service.js
APIFY_LINKEDIN_POSTS_LIMIT=30        # (opcional) posts recientes a traer por scrape de LinkedIn. FALLBACK del PlatformSetting `apifyLinkedinPostsLimit` (>0 tiene prioridad). Default 30 — las empresas postean menos que IG
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
- **Shared utilities:** `src/utils/dates.js` exports `todayString()` (Buenos Aires timezone). `src/lib/monthUtils.js` exports helpers de meses (`monthBounds`, `prevMonthStr`, `prevMonthsArr`, `monthLabel`, y `periodMonths`/`periodLabel` para períodos calendario de objetivos). `src/lib/objectiveCatalog.js` es el catálogo único de métricas de objetivos (categoría, unit, direction, aggregation flow/stock, param requerido).
- **Shared task include:** `tasks.controller.js` and `workdays.controller.js` each define a `taskInclude` constant (`{ project, createdBy, _count: { comments } }`) used in all task queries.
- **Weekly AI report** at `src/services/weeklyReport.service.js` — generates productivity analysis with Claude Haiku, sent every Friday at 14:00 ART via `node-cron`. Sequential processing with 3s delay between users.
- **Insight memory** at `src/services/insightMemory.service.js` — weekly learning profile per user (tendencias, fortalezas, areasDeAtencion, estadisticas) using Claude Haiku. Updated every Saturday at 00:00 ART.
- **GEO audit** at `src/services/geoAudit.service.js` — fetches URL with axios + cheerio, analyzes with Claude (claude-haiku), stores result in `GeoAudit`. Async: controller returns auditId immediately, analysis runs via `setImmediate`. Progress tracked via `errorMsg` field during `running` status. Score 0–100 with 4 bands (Crítico/Base/Bueno/Excelente). Checks 23 AI crawlers (citation vs training), llms.txt, robots.txt, JSON-LD schema.
- **Feature flag catalog** at `src/config/featureFlags.js` — array of `{ key, name, description }`. On server start, all flags are upserted to DB automatically. Never create flags manually from SuperAdmin UI — define them in code. Flags actuales: `marketing` (sección Marketing) y `eos` (Sistema EOS).
- **Token budget** at `src/lib/tokenBudget.js` — presupuesto mensual de tokens de IA por workspace. `Workspace.monthlyTokenLimit` (default `1000000`, `0` = ilimitado). Funciones:
  - `getTokenBudget(workspaceId)` → `{ used, limit, pct, exceeded, status }` (status: `ok` | `warning` ≥90% | `critical` ≥95% | `exceeded`).
  - `assertTokenBudget(workspaceId)` — lanza `err.status = 429` + `code: TOKEN_BUDGET_EXCEEDED` si superado. Llamar antes de toda invocación a Claude.
  - `hasTokenBudget(workspaceId)` — versión booleana para crons (no lanza).
  - Se acumula vía `AiTokenLog` (inputTokens + outputTokens) en el mes calendario actual. Configurable por workspace desde SuperAdmin (`PATCH /api/superadmin/workspaces/:id/token-limit`).
- **SerpAPI service** at `src/services/serpApi.service.js` — captura snapshots SERP (posición, features, competidores, "People Also Ask", "Related Searches") usando `SERP_API_KEY` (serpapi.com). Cooldown de 15 minutos para refresh manual; reutiliza snapshot si <24h.
- **Cannibalization service** at `src/services/cannibalization.service.js` — detecta canibalización de keywords entre páginas del mismo sitio usando datos de Google Search Console + análisis IA.
- **Social scrape service** at `src/services/socialScrape.service.js` — motor de scraping de RRSS abstraído por proveedor (actual: Apify, `APIFY_API_TOKEN`). `scrapeInstagramProfile(usernameOrUrl, { postsLimit, targetMonth })` corre el actor de Apify y normaliza la respuesta al **mismo shape** que `instagram.service.computeInstagramMetrics` (followers, mediaCount, avgLikes/Comments, engagementRate, postsThisMonth, topPosts, recentMedia) + `{ isPrivate, scraped }`. `parseInstagramUsername()` acepta handle, `@handle` o URL. Trae `APIFY_INSTAGRAM_POSTS_LIMIT` (default 60) posts para cubrir el mes; las métricas de engagement/posts se calculan **por mes calendario** vía el `targetMonth` que se le pasa a `computeInstagramMetrics`. Devuelve `monthCoverageComplete` (false + warning si la cuenta postea más que el tope). Errores estructurados con `code`: `SCRAPE_NOT_CONFIGURED` (503, falta token), `PROFILE_NOT_FOUND` (404), `SCRAPE_PROVIDER_ERROR` (502), `INVALID_USERNAME` (400). `computeInstagramMetrics` fue extraído de `instagram.service.js` y se comparte entre la API oficial y el scraping. **LinkedIn (Company Pages):** `scrapeLinkedinCompany(urlOrSlug, { postsLimit, targetMonth })` corre `APIFY_LINKEDIN_ACTOR` y normaliza la respuesta al **mismo shape** que `linkedin.service.fetchLinkedinMetrics`, dejando en `null` lo que el scraping no ve (impresiones, clicks, CTR, page views, visitantes, demographics). `parseLinkedinCompany()` acepta slug, `@slug` o URL `/company|/showcase|/school/`. `normalizeApifyCompany` tolera dos formas de actor (item de empresa con posts anidados, o N items = posts) y lee campos por varios alias posibles (`pick`/`toCount`); es el punto único a ajustar si cambiás de actor. **El actor y el tope de posts se eligen desde SuperAdmin → Configuración** (PlatformSettings `apifyLinkedinActor` string y `apifyLinkedinPostsLimit` int; ambos con prioridad sobre las envs `APIFY_LINKEDIN_ACTOR`/`APIFY_LINKEDIN_POSTS_LIMIT`) — `runApifyLinkedin`/`scrapeLinkedinCompany` resuelven `setting || env || default`, así se puede probar y cambiar de actor sin redeploy. `computeLinkedinScrapeMetrics` (en `linkedin.service.js`, espejo de `computeInstagramMetrics`) filtra posts al `targetMonth`, suma likes/comments/shares, calcula `engagementRate` "por seguidores" (engagement promedio por post ÷ followers) y arma el top 5. Mismos `code` de error que Instagram (+ requiere también `APIFY_LINKEDIN_ACTOR`, si falta → `SCRAPE_NOT_CONFIGURED`).
- **Competitor snapshot service** at `src/services/competitorSnapshot.service.js` — `saveAllMonthlyCompetitorSnapshots()` scrapea todos los `CompetitorAccount` (Instagram) el 1° del mes, guardando snapshot del mes anterior + log diario de seguidores. Secuencial con delay de 3s entre cuentas.
- **Marketing objectives engine** at `src/services/marketingObjectives.service.js` — `computeObjectives({ projectId, workspaceId, dataMonth, googleAds, metaAds })` calcula el progreso de cada `MarketingObjective` contra los datos reales según periodicidad calendario (flujo acumula meses del período; stock toma el último valor). No persiste — se recalcula en cada carga del informe. Devuelve por objetivo `{ target, actual, pct, unit, direction, status, periodLabel, detail }`. Lo invoca `aggregateReportData` (expone `data.objectives`). Ver concepto "Objetivos de marketing".

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

**Atajos de teclado globales:** `GlobalShortcuts.jsx` se monta una sola vez en `App.jsx` (dentro de `<BrowserRouter>`, después de `<Routes>`) y maneja atajos para todo usuario autenticado en un subdominio de workspace (`enabled = !!user && isWorkspaceSubdomain()`). Maneja: `N` → nueva tarea (renderiza un `AddTaskModal` global, sin proyecto bloqueado), **navegación con `Shift + tecla`**: `Shift+D` Dashboard, `Shift+Y` Mis Proyectos, `Shift+A` Actividad (`/realtime`), `Shift+M` Marketing, `Shift+R` Reportes (`/reports` si `user.isAdmin`, si no `/my-reports`); `?` → overlay de ayuda (catálogo agrupado en Navegación / Tareas / General), `Esc` → cierra la ventana abierta. La navegación y las acciones de tarea comparten el modificador `Shift` pero usan **letras disjuntas** (nav D/Y/A/M/R · tareas C/P/B/I): `GlobalShortcuts` solo navega si la tecla está en su `navDest`, así que las teclas de tarea pasan de largo y las atrapa el Dashboard. El catálogo de ayuda también lista, **solo como documentación**, atajos manejados por otros componentes: `Ctrl/Cmd+B` (pizarra, en `NotesBoard.jsx`) y las acciones de tarea con Shift (en `Dashboard.jsx`).

**Atajos de acciones de tarea (Dashboard):** `Dashboard.jsx` tiene su propio listener de teclado (engancha una vez vía un `shortcutRef` que mantiene `{ activeTask, focusTasks, ended, update }` fresco). Solo combinaciones **Shift + tecla** sin otros modificadores y nunca mientras se escribe en un campo editable. Con una tarea en curso (`activeTask`, status `IN_PROGRESS`): `Shift+C` completar, `Shift+P` pausar, `Shift+B` bloquear (pide motivo con `window.prompt`, ya que el backend exige `reason`). Sin tarea en curso: `Shift+I` inicia la primera tarea de `focusTasks` que esté `PENDING` (→ `start`) o `PAUSED` (→ `resume`). Cada acción pega al endpoint PATCH correspondiente y refresca con `handleUpdateTask`. Solo operan en el Dashboard (es donde está la lista y la tarea en curso); en otras páginas no se disparan. Las teclas de una sola letra **no** se disparan mientras el foco está en un campo editable (`input`/`textarea`/`select`/contenteditable) ni con modificadores (Ctrl/Cmd/Alt). Cuando se crea una tarea desde el modal global, `GlobalShortcuts` emite el evento `window` `bliss:task-created` (detalle = la tarea); `Dashboard.jsx` lo escucha y recarga con `loadToday()` (el botón "+ Agregar tarea" del propio Dashboard usa su modal local y **no** emite el evento, así no hay doble refresco).

### Key domain concepts

**Workspace:** The top-level tenant. Has a `slug` (subdomain), `status` (`trialing` | `active` | `past_due` | `suspended` | `cancelled`), and `timezone`. Members are linked via `WorkspaceMember`. Company profile fields: `companyName`, `companyDescription`, `industry`, `companyWebsite`. Brand identity: `brandColors` (JSON `[{ hex, name? }]`), `brandFonts` (JSON `[{ name, role }]` where `role` is `heading|body|accent`). Logo and banner stored as raw bytes in DB: `logoData`/`logoMimeType` and `bannerData`/`bannerMimeType` (max 5 MB via multer memoryStorage). Las subidas (logo/banner/avatares) se validan por **magic bytes** (`lib/imageType.js` → `validateImageUpload`), no por extensión ni `Content-Type` del cliente; sólo PNG/JPG/WEBP (avatares también GIF). **SVG no se acepta** (riesgo de XSS al servirse same-origin); el serve público de logo agrega `X-Content-Type-Options: nosniff` y fuerza `Content-Disposition: attachment` si quedó algún SVG legacy. Feature flag opt-out: `disabledFeatureKeys` (JSON array of keys) — workspace admins can disable globally-enabled flags for their workspace from Preferencias → Módulos adicionales.

**WorkspaceMember:** Joins `User` and `Workspace`. Fields: `role` (owner/admin/member), `teamRole` (internal role name), `active`, `vacationDays`, `workStartTime`/`workEndTime` (horario laboral, ver concepto "Horario laboral y tardanzas"), and the four AI preference flags.

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

**Notifications:** `NotificationType` enum: `COMPLETED` / `BLOCKED` / `ADDED_TO_PROJECT` / `TASK_COMMENT` / `TASK_MENTION` (+ `VACATION_REQUEST` / `VACATION_REVIEWED`). Bell panel (`NotificationBell.jsx`) tiene 6 filtros **solo-icono** (sin "Todas"): el encabezado muestra "Notificaciones · {tipo activo}" y cada icono lleva un badge con la cantidad **sin leer de ese tipo**. Modelo de lectura **por tipo**: abrir el panel marca leído solo el tipo que se está viendo (no todo); cambiar de icono marca leído ese tipo. Así cada icono indica qué quedó sin ver. Backend: `POST /api/notifications/read` body `{ types: [...] }` (marca leídas por tipo) además de `/read-all`. Cada notificación es un link que abre `TaskCommentsModal`.

**Project links:** Stored in `ProjectLink`. Any project member can add/delete. `PUT /api/projects/:id/links` replaces all links atomically.

**Project access model (team = etiqueta, no barrera):** `ProjectMember` ya **no** es una barrera de acceso, sino la etiqueta del "equipo principal" (los que trabajan principalmente en el proyecto). Cualquier integrante del workspace puede **ver cualquier proyecto** y **crear/asignar tareas** en él sin pasar a ser miembro del equipo. Concretamente: `GET /api/projects` devuelve **todos** los proyectos activos del workspace (no solo los del usuario); las lecturas de proyecto (`getMembers`, `projectTasks`, `projectCompletedHistory`) están abiertas a cualquier miembro del workspace; `POST /api/tasks` solo valida que el destinatario sea un miembro **activo del workspace** (no del proyecto), y el colaborador puntual **no** se agrega al equipo. Las escrituras de ficha del proyecto (`saveLinks`, `saveSituation`, `saveInfo`) siguen siendo member-only. En `AddTaskModal.jsx` el selector "Asignar a" lista a todo el workspace agrupado en `<optgroup>` "Equipo del proyecto" / "Otros del workspace".

**Starred projects (`/my-projects`):** `ProjectStar` (join `projectId` + `userId`) marca proyectos destacados **por usuario** (preferencia personal, análoga al starring de tareas pero booleana). `GET /api/projects` incluye `starred` por proyecto; `PATCH /api/projects/:id/star` togglea. `MyProjects.jsx` agrupa en 3 secciones en orden: **Proyectos destacados** (estrella, si hay) → **Mis proyectos** (donde soy del equipo) → **Otros proyectos del workspace**. Un destacado se saca de su grupo original y sube a Destacados. La estrella amarilla reemplazó al viejo punto verde/rojo; el estado "tiene bloqueadas" se indica ahora con un puntito rojo condicional + la pill roja existente.

**Project info (websiteUrl + connections):** `Project.websiteUrl String?` used for GEO analysis. `Project.connections String @default("{}")` — JSON with keys `instagram`, `facebook`, `linkedin`, `twitter`, `tiktok`, `youtube`. Managed from the **Info** tab in `ProjectDetail.jsx` via `ProjectInfoTab.jsx`. Admins no longer manage URL/links from the Admin panel.

**Billing:** Workspace has `status` (`trialing` | `active` | `past_due` | `suspended` | `cancelled`) and `trialEndsAt`. Trial = 14 days from registration. A cron runs at 03:00 ART daily to mark expired trials as `past_due`. Stripe integration: Customer created async on workspace registration; Checkout session creates the Stripe subscription; webhooks sync status back to DB. `Subscription` model stores `stripeSubId`, `seats`, `periodStart/End`. Billing actions (Checkout + Portal) require `admin` or `owner` role. `TrialBanner` component shows in Navbar when `trialDaysLeft <= 7` or `status === 'past_due'`. The `bliss` workspace is exempt — set `status = 'active'` manually via SuperAdmin; no Stripe subscription is ever created for it.

**Feature flags:** Defined in `src/config/featureFlags.js`. Auto-upserted on server startup. SuperAdmin manages which workspaces have access (enabledGlobally or per-workspace list). Frontend uses `useFeatureFlag(key)` hook — cached in memory per session. Never create flags manually from the UI. **Workspace opt-out:** even if a flag is enabled by SuperAdmin, a workspace admin can disable it for their workspace via `PATCH /api/workspaces/current/features/:key` (stored in `Workspace.disabledFeatureKeys`). Visible in Preferencias → Módulos adicionales.

**GEO Audit (Marketing):** `GeoAudit` model stores per-project AI analysis results. Score 0–100, 6 components (citability, brandAuthority, eeat, technical, schema, platforms), unified items list, negative signals. Async pattern: `POST /api/marketing/geo/audit` creates record with `status: 'running'` and returns `auditId` immediately; frontend polls `GET /api/marketing/geo/audits/:id` every 3s. Progress steps stored in `errorMsg` during running, cleared on completion. Tasks can be created directly from audit items with "GEO - " prefix. Generación adicional: `GET /api/marketing/geo/audits/:id/llms-txt` produce un archivo `llms.txt` estándar; `POST /api/marketing/geo/audits/:id/schema` genera JSON-LD Schema.org sugerido.

**Health Score (Marketing):** `GET /api/marketing/projects/:id/health-score` agrega métricas de GEO (último audit), Keywords (posición promedio mes actual), GA4 (snapshots con deltas vs mes anterior) y PageSpeed (mobile + desktop) en un score unificado. Visible en la pestaña **Salud** (`SaludTab.jsx`). No persiste — se calcula en cada request.

**Cannibalization (Marketing):** Detección de canibalización SEO usando datos de Google Search Console. Rutas: `POST /api/marketing/projects/:id/cannibal` dispara análisis; `GET .../cannibal` lista reportes; `GET .../cannibal/:rid` detalle; `DELETE .../cannibal/:rid` elimina. Visible en la pestaña **Canibalización** (`CanibalizacionTab.jsx`).

**Domain Rating (Marketing, SEO):** Métrica de autoridad de dominio de Ahrefs (0–100, fuerza del perfil de backlinks). Usa el endpoint **público y gratuito** de Ahrefs (`GET https://api.ahrefs.com/v3/public/domain-rating-free?target=<dominio>`) — **no requiere API key ni env var**. Servicio `backend/src/services/ahrefs.service.js`: `fetchDomainRating(websiteUrl)` (devuelve Number o null, nunca lanza; reutiliza `extractDomain` de `serpApi.service.js`), `refreshProjectDomainRating(project)` (persiste en `Project.domainRating` + `domainRatingAt`) y `refreshAllDomainRatings()` (cron, refresca todos los proyectos activos con `websiteUrl`). Almacenamiento dual: **cacheado en `Project`** (`domainRating Float?` + `domainRatingAt DateTime?`, para la lista general y la card SEO) **+ histórico mensual** en `SearchConsoleSnapshot.domainRating` (lo guarda `saveMonthSnapshot` con su propio fetch, aislado en try). Actualización: **manual** vía `POST /api/marketing/projects/:id/domain-rating/refresh` (botón "Actualizar DR" en `SeoTab.jsx`) **+ automática** en el cron mensual de snapshots SEO (`30 2 1 * *`, tras `saveAllSearchConsoleSnapshots` se llama a `refreshAllDomainRatings`). En el frontend: `DomainRatingCard` (card con banda de color ≥60 fuerte / ≥30 medio / <30 débil, independiente de que GSC esté conectado) y `CrossProjectSeoPanel` (vista sin proyecto seleccionado: lista todos los sitios web ordenados por DR desc, vía `GET /api/marketing/summary/seo`).

**LinkedIn (Marketing):** `LinkedinSnapshot` y `LinkedinFollowerLog` por proyecto. Captura mensual de seguidores, impresiones, clicks, CTR, engagement rate, total likes/comments/shares, posts del mes (`postsThisMonth`), top 5 posts (JSON con likes/comments/shares/impressions), y demographics (industry, seniority, function, region — JSON con conteos absolutos). Patrón idéntico a TikTok/Instagram: `GET /api/marketing/projects/:id/linkedin` devuelve datos en vivo + auto-snapshot mensual + log diario; cron mensual `45 5 1 * *` ART persiste snapshot del mes anterior. `propertyId` es el `Organization ID` numérico de la Company Page (auto-detectado tras OAuth, o elegido por el admin desde un dropdown si tiene varias páginas). Tab `LinkedinTab.jsx` en RRSS. Visible en informes mensuales (sección `linkedin` en `aggregateReportData`). Hay **dos métodos de conexión** (ver concepto "LinkedIn — scraping").

**LinkedIn — scraping (método de conexión alternativo):** Mientras la app oficial de LinkedIn está en aprobación, se puede conectar una Company Page por **scraping** vía Apify (mismo patrón que el scraping de Instagram). `POST /integrations/linkedin/connect-scrape` (body `{ url | company }`) valida con un scrape inicial y crea una `ProjectIntegration` type=`linkedin` con `scopes='scrape'`, `propertyId=<slug de la company>` y **sin token**. Reutiliza toda la infraestructura existente de LinkedIn (modelo `LinkedinSnapshot`/`LinkedinFollowerLog`, snapshot service, vistas, informes) **sin migración de DB**: el scraping llena el subconjunto **público** (followersCount, postsThisMonth, totalLikes/Comments/Shares, engagementRate, topPosts) y deja en `null` lo que solo da la API oficial (pageViews, uniqueVisitors, impressions, clicks, ctr, demographics). `getMetrics` detecta `scopes==='scrape'` y devuelve el **snapshot cacheado** (no le pega a Apify en cada visita, por costo); el refresh manual `POST /linkedin/scrape/refresh` (cooldown 30 min in-memory por integrationId) trae datos frescos. `saveLinkedinSnapshot` usa scraping cuando la integración es `scrape` (también en el cron mensual) y cachea las imágenes de los top posts vía `SocialImage`. Engagement/posts se calculan **por mes calendario** (`computeLinkedinScrapeMetrics` filtra al `targetMonth`); `monthCoverageComplete=false` + warning si la página postea más que `APIFY_LINKEDIN_POSTS_LIMIT`. La UI de `LinkedinTab.jsx` ofrece 2 métodos (Scraping recomendado / Oficial); en modo scrape el header muestra un botón "↻ Actualizar", un badge "vía scraping", oculta los KPIs de Impresiones/Clicks y muestra un banner aclaratorio con un botón "🔍 Diagnóstico" (`GET .../linkedin/scrape-debug` → `debugScrapeLinkedin`) que muestra el **output crudo de Apify** + lo normalizado, para depurar cuando un actor devuelve datos en 0 (input incorrecto vs. nombres de campo distintos). Solo páginas públicas. Requiere `APIFY_API_TOKEN` + el actor de LinkedIn configurado (PlatformSetting `apifyLinkedinActor` desde SuperAdmin → Configuración, o env `APIFY_LINKEDIN_ACTOR`).

**SERP snapshots (Marketing):** `SerpSnapshot` model captura snapshot completo de SerpAPI por keyword (posición, features del SERP, competidores top, "People Also Ask", "Related Searches"). Rutas:
- `GET /api/marketing/projects/:id/keywords/:kwId/serp` — devuelve snapshot reciente (reutiliza si <24h).
- `POST /api/marketing/projects/:id/keywords/:kwId/serp/refresh` — fuerza nueva captura (cooldown 15min).
- `GET /api/marketing/projects/:id/keywords/serp-batch` — tabla resumen "SERP Live" cross-keyword.

Requiere `SERP_API_KEY` configurado. Los snapshots SE GUARDAN aunque sólo se use el más reciente — útiles para análisis histórico futuro.

**Instagram — scraping (tercer método de conexión):** Además de la conexión oficial (Instagram Business Login, hoy deshabilitada hasta aprobación de Meta) y el token de Business Manager, hay un método de **Scraping** vía Apify. `POST /integrations/instagram/connect-scrape` (body `{ url | username }`) valida con un scrape inicial y crea una `ProjectIntegration` type=`instagram` con `scopes='scrape'`, `propertyId=username` y **sin token**. La integración reutiliza toda la lógica de "conectado" existente (vistas, snapshots, follower logs, informes). `getMetrics` detecta `scopes==='scrape'` y devuelve el **snapshot cacheado** (no le pega a Apify en cada visita, por costo); el refresh manual `POST /instagram/scrape/refresh` (cooldown 30 min, in-memory por integrationId) trae datos frescos. `saveInstagramSnapshot` y el cron mensual de Instagram también usan scraping cuando la integración es `scrape`. La UI de conexión de `InstagramTab.jsx` está ordenada en 3 métodos (Oficial deshabilitado / Token recomendado / Scraping). Solo cuentas públicas. **Engagement/posts se calculan por mes calendario**: `computeInstagramMetrics` filtra las publicaciones al `targetMonth` (avgLikes/avgComments/engagementRate/postsThisMonth/topPosts son del mes). Para cubrir meses completos el scrape trae `APIFY_INSTAGRAM_POSTS_LIMIT` posts (default 60); si una cuenta postea más que eso en el mes, `scrapeInstagramProfile` devuelve `monthCoverageComplete: false` y loguea un warning (subir el límite).

**Competidores (Marketing, RRSS):** Seguimiento por scraping de cuentas de la competencia (por ahora solo Instagram). Modelos: `CompetitorAccount` (projectId, workspaceId, platform, username, displayName, profilePicUrl) + `CompetitorSnapshot` (por mes: followersCount, mediaCount, postsCount, avgLikes, avgComments, engagementRate, topPosts) + `CompetitorFollowerLog` (seguidores por día). El alta/refresh usa `socialScrape.service`. La lista calcula "nuevos en el mes" comparando el snapshot actual con el primer follower log del mes. Refresh manual con cooldown 30 min; cron mensual `15 6 1 * *` ART. Tab `CompetitorsTab.jsx` — sub-tab `🏁 Competidores` en RRSS. Cascada: borrar un proyecto elimina sus competidores y, en cascada, sus snapshots/logs. **En informes mensuales**: `aggregateReportData` agrega una sección `competitors` (en `sections`) que se incluye **solo si la cuenta propia lidera (rank #1, estrictamente mejor que todos)** frente a los competidores en al menos una de: engagement, crecimiento de seguidores o promedio de likes (comparación determinística por `dataMonth`, helper `buildCompetitorComparison`). Si no lidera nada, la sección es `null` y se omite. `ReportViewer.jsx` la renderiza con un ranking por métrica ganada.

**Cache de imágenes de RRSS (`SocialImage`):** Las URLs de imágenes de los CDN de Instagram/Facebook/TikTok vienen **firmadas y vencen** (horas/días), por lo que los `imgSrc`/`coverUrl` guardados en los top posts de snapshots o cacheados en informes terminan rotos ("URL signature expired"). Para evitarlo, al guardar un snapshot descargamos los bytes de la imagen **mientras la URL es válida** y los servimos desde nuestro backend. Modelo `SocialImage` (id UUID, workspaceId, sourceUrl, imageData Bytes, mimeType) servido por `GET /api/social-image/:id` (público, cache 1 año inmutable, mismo patrón que avatares). Servicio `backend/src/services/socialImageCache.service.js`: `cacheSocialImage(url, workspaceId)` descarga y persiste, devolviendo una URL absoluta a `BACKEND_URL/api/social-image/:id` (o la URL original si falla — fallback no destructivo, nunca lanza); `cacheImagesInArray(items, field, workspaceId)` mapea un array de posts reemplazando el campo de imagen. Se invoca al persistir snapshots: Instagram (`instagramSnapshot.service.js`, campo `imgSrc`), TikTok (`tiktokSnapshot.service.js`, campo `coverUrl`), Competidores (`competitors.controller.js` `persistCompetitorData` + `competitorSnapshot.service.js`, campo `imgSrc`) y el fallback en vivo de Instagram del informe (`monthlyReport.service.js`). **Es hacia adelante**: los snapshots ya guardados con URLs vencidas no se recuperan (la firma ya expiró); un refresh manual o el próximo snapshot mensual los re-cachea. Los informes leen de snapshots, así que heredan las URLs estables. `SocialImage` cae en cascada con el workspace.

**Generación de informes (bajo demanda + selección de secciones):** El informe **no** se genera al entrar a la pestaña. `GET /api/marketing/projects/:id/reports/:month` es **perezoso**: crea el registro `MonthlyReport` si no existe pero solo agrega datos (`aggregateReportData`) si el informe ya fue generado (`enabledSections != null`, o legacy con `dataCache`/`analysis`). Devuelve además `availableSections` (estado por sección) e `isGenerated`. Para generar/regenerar se usa `POST .../reports/:month/regenerate` con body `{ enabledSections: [...] }` (limpia `analysis` + `dataCache`, agrega solo las secciones elegidas y guarda la selección). El endpoint liviano `GET /api/marketing/projects/:id/report-sections` devuelve, por sección, `{ available, integration: 'active'|'expired'|'missing'|null }` para el modal "Generar informe" (`GenerateModal` en `InformesTab.jsx`), que muestra chips de conexión y avisa si una integración está caída antes de generar. Las secciones **no** seleccionadas se excluyen por completo (no se consultan, no se cachean, no viajan al link público). Si el análisis IA falla, `generateAnalysis` devuelve `data.analysisError` con el motivo (truncación/JSON inválido/HTTP 4xx-5xx) que `InformesTab` muestra en un banner ámbar (solo vista admin, no público).

**Informe público — navegación + Open Graph:** El link `/report/:token` (`ReportPublic.jsx`) sirve a clientes sin auth. `GET /api/public/report/:token` devuelve `siblings` = todos los informes **generados** del mismo proyecto (`{ token, month, label }`, más reciente primero; "generado" = `enabledSections | dataCache | analysis` no nulos, filtro `GENERATED_WHERE`). `ReportPublic` renderiza un `ReportSwitcher` (pills por mes) que navega client-side entre tokens. **Implicación de privacidad:** un solo link da acceso a toda la historia de informes generados del proyecto. **Preview de WhatsApp/redes (Open Graph):** como el front es un SPA estático en Vercel (los scrapers no ejecutan JS), una **función serverless** `frontend/api/report-og.js` intercepta `/report/:token` (vía rewrite en `vercel.json`), trae `GET /api/public/report/:token/meta` del backend y reescribe los OG del `index.html` (título `Informe {Proyecto} · {Mes Año} · BlissTracker`, descripción, url, y og:image = banner del informe si tiene, si no `og-image.png`). El SPA igual bootea normal. La función necesita la env var `VITE_API_URL` (o `BACKEND_URL`) disponible en runtime de Functions en Vercel.

**TikTok — mejor video del mes:** `TikTokSnapshot.topVideos` (JSON, top 3 por engagement = likes + comments + shares; el #1 es `bestVideo`), análogo a `InstagramSnapshot.topPosts`. `tiktok.service.js` lo calcula, `tiktokSnapshot.service.js` lo persiste, `aggregateReportData` lo expone en la sección `tiktok` y `ReportViewer.jsx` lo renderiza con `BestTikTokVideo`.

**Objetivos de marketing (Marketing):** Objetivos **estructurados y persistentes por proyecto** (modelo `MarketingObjective`) — se mantienen mes a mes hasta editarse/eliminarse; reemplazan el viejo JSON de texto libre `MonthlyReport.objectives` (deprecado, no migrado). Campos: `category` (`web`|`seo`|`rrss`|`ads`), `metric`, `periodicity` (`monthly`|`quarterly`|`annual`), `target` (Float) + params opcionales `platform` (ads), `trackedKeywordId` (seo, `onDelete: SetNull`), `competitorId` (rrss, `onDelete: SetNull`). Catálogo único en `backend/src/lib/objectiveCatalog.js` (espejo en `frontend/src/components/marketing/objectiveCatalog.js`): métricas `leads`/`visitas`/`performance` (web), `posicionamiento` (seo), `seguidores`/`interaccion`/`competidores` (rrss), `inversion`/`clicks`/`ctr` (ads). CRUD bajo `/api/marketing/projects/:id/objectives` (`marketingObjectives.controller.js`), gestionado desde `ObjectivesManager.jsx` (botón 🎯 Objetivos en `InformesTab`; alta de a uno con formulario en cascada categoría→métrica→periodicidad→params→target). El **motor `marketingObjectives.service.js` → `computeObjectives()`** compara contra datos reales por período **calendario** (`periodMonths`/`periodLabel` en `backend/src/lib/monthUtils.js`): métricas de **flujo** (visitas=`AnalyticsSnapshot.sessions`, leads=`conversions`, seguidores nuevos sumando IG+TikTok+LinkedIn, interacción, ads spend/clicks) **acumulan** los meses del trimestre/año; métricas de **stock** (performance=PageSpeed desktop, posición SEO `KeywordRanking.position` con dirección "menor es mejor", CTR) toman el último valor del período. `competidores` arma un head-to-head **siempre visible** vs el competidor elegido (ignora la regla de `buildCompetitorComparison`); `inversion` es informativo (más/menos que el presupuesto). Estados por objetivo: `ok`/`partial`/`fail`/`info`/`no_data`/`orphaned` (ref borrada)/`disconnected` (ads sin datos). **Los objetivos NO se cachean** — se recalculan en cada carga (queries livianas), por lo que un target editado se refleja al instante. `aggregateReportData` los expone como `data.objectives` (top-level, fuera de `sections`; gateados por el flag de sección `objectives` de `enabledSections`) y alimentan el bloque de cumplimiento del prompt de IA. `ReportViewer.jsx` los renderiza con `ObjectivesResults` (barra de progreso, etiqueta de período, breakdown por red, head-to-head); el gestor CRUD no aparece en el informe público, solo los resultados. Facebook orgánico no se incluye (no existe como fuente, solo Meta Ads).

**Briefs (ficha del proyecto):** Cuestionarios de relevamiento del cliente por proyecto (modelo `ProjectBrief`, una fila por `(projectId, type)`, `answers` JSON `{ fieldKey: value }`). Se completan **modularmente** — no hace falta llenar todos los briefs ni todos los campos. Seis tipos: `marca` (documento madre, transversal, se completa una sola vez), `organico`, `meta_ads`, `web`, `seo_sem`, `crm` (los 5 últimos son por servicio y asumen Marca ya completo). Catálogo de tipos en `backend/src/lib/briefCatalog.js` (solo valida `type`) con espejo de preguntas/campos en `frontend/src/components/briefs/briefCatalog.js` (secciones + campos `{ k, q, short? }`; las claves `k` solo necesitan ser únicas dentro de cada brief). CRUD bajo `/api/projects/:id/briefs` (`briefs.controller.js`): `GET` lista (abierta a cualquier miembro del workspace) + `PUT .../:type` upsert (admin/owner o miembro del proyecto — mismo criterio que `saveInfo`/`saveSituation`); el controller descarta valores vacíos antes de persistir. UI: pestaña **Briefs** en `ProjectDetail.jsx` (componente `ProjectBriefs.jsx`) — grilla de 6 tarjetas con progreso (`X/Y campos`, pill Sin empezar / En progreso / Completo; "Completo" = ≥80% de campos respondidos) → editor master-detail por brief con guardado independiente. No depende del feature flag `marketing`. La sección se puede apagar globalmente con `Project.briefsEnabled` (default `true`) desde Preferencias → Globales → Proyectos, igual que `linksEnabled`/`situationEnabled`/`hoursEnabled` (toggle global aplicado a todos los proyectos vía `updateMany` en `saveGlobalSettings`); con `briefsEnabled=false` la pestaña no se muestra.

**Roles:** `WorkspaceMember.teamRole` is a plain `String` referencing `UserRole.name`. Admin access is `WorkspaceMember.role === 'admin' | 'owner'`, fully decoupled from team role.

**Avatars:** `User.avatar` stores a filename. Default: `2bee.png`. The image bytes live in the DB (`Avatar` model: `imageData` + `mimeType`) and are served via `GET /api/avatars/img/:filename` (public, 24h cache). The frontend builds URLs with `utils/avatarUrl.js`. Validation on `PATCH /api/profile/avatar` checks the filename exists in the `Avatar` table and is `active` (no static `ALLOWED_AVATARS` list anymore). Avatars are managed from SuperAdmin → Avatares (upload/rename/reorder/toggle/delete; delete blocked while any user still uses it; `listAll` returns `usageCount` = users currently on each avatar). Seeds: `backend/prisma/seeds/seedAvatarsIfEmpty.js` (runs on Railway start only if the table is empty) and `avatarSeed.js` (manual force-upsert); both read PNGs from `backend/prisma/seeds/perfiles/`. Clicking an avatar opens a fullscreen lightbox.

**User preferences:** Four boolean flags on `WorkspaceMember`, all `@default(true)`:
- `weeklyEmailEnabled` — AI weekly email every Friday 14:00 ART.
- `dailyInsightEnabled` — master toggle for the entire AI insight system.
- `insightMemoryEnabled` — weekly learning profile generation.
- `taskQualityEnabled` — GTD task description coaching in the daily insight.

`insightMemoryEnabled` and `taskQualityEnabled` are subordinate to `dailyInsightEnabled`. Turning off the master toggle sends a single PATCH with all three insight flags set to `false`. Managed via `PATCH /api/profile/preferences`.

Hay además un quinto flag de preferencia personal, `notesBoardEnabled` (`@default(true)`), de **UI** (no IA): controla si se muestra la **pizarra de notas** (`NotesBoard.jsx`). Vive en `WorkspaceMember`, se actualiza por el mismo `PATCH /api/profile/preferences` (está en `PREF_FLAGS`) y viaja en el objeto `user` (incluido en `formatUser`/`me` de `auth.controller.js` y en `getProfile`/`updateProfile` de `profile.controller.js`). Se togglea desde **Preferencias → Personales → Interfaz**; el handler llama a `updateUser({ notesBoardEnabled })` para que `NotesBoard` (que lee `user.notesBoardEnabled`) aparezca/desaparezca al instante. `NotesBoard` se oculta solo si el valor es **explícitamente** `false` (undefined → visible, default ON). Apagarlo no borra las notas (siguen en localStorage por usuario).

**Daily AI insight:** Generated by `insights.controller.js` using Claude Haiku. Cached once per user per day in `DailyInsight` (`userId + workspaceId + date` unique). Context: current task states + carry-over flags + weekly summary by project + role expectations + user memory profile. Output JSON: `{ titulo, mensaje, sugerencia, alertaRol, alertaGTD, tono }`. Regenerate has 1h cooldown (429 + `waitMins`).

**Role expectations:** Admin-configurable per role via "🎯 Roles IA" tab in Admin panel. Stored in `RoleExpectation` with `roleName`, `description`, `recurrentTasks` (JSON: `[{task, frequency, detail}]`), `dependencies` (JSON). Frequencies: `daily`, `weekly`, `monthly`, `first_week`.

**User insight memory:** Generated weekly (Saturday 00:00 ART) by `insightMemory.service.js`. Stored in `UserInsightMemory` (one record per user per workspace per weekStart, upserted). El contexto del prompt incluye **asistencia** (días con actividad vs días hábiles del período y licencias aprobadas) para que la IA no lea "menos días" como bajo rendimiento (puede ser licencia/ausencia).

**Productividad (`/admin/productivity`, admin):** Métricas determinísticas por persona y por proyecto, sin IA en el cálculo (la IA solo aporta el texto del insight memory). Datos en `productivityStats.service.js`; controller `adminProductivity.controller.js`; UI `ProductivityTab.jsx`.
- **Período de comparación** (`getProductivityPeriod` en `lib/timeMetrics.js`): `current` (mes en curso) compara el **mes a la fecha contra los mismos días del mes anterior** (ventanas de igual largo, `lengthMatched: true`, ej. 1–16 jun vs 1–16 may) para que los números absolutos sean comparables; `closed` compara el último mes completo vs el anterior. El bucketing usa dos ventanas explícitas `[curStart,curEnd]` y `[prevStart,prevEnd]` (puede haber un "hueco" que se descarta).
- **Métricas**: `Tareas` (completadas en el período **por fecha de completado** — `fetchRows` adjunta `completedDate` en la TZ del workspace, así cuenta lo terminado aunque la tarea se haya arrastrado de días previos), `Horas` (tiempo activo de esas tareas: completado−iniciado−pausas, tope 8h, o `minutesOverride` — son las **"horas registradas"**), `Δ horas` (**métrica principal** = horas registradas ÷ **horas disponibles**; ver Asistencia), `Tasa` (completadas÷creadas: ritmo de cierre vs creación; >100% = bajando backlog), `atascadas` (PAUSED/BLOCKED sin moverse >7d), `Estado` (semáforo determinístico `memberStatus`: `inactive`/`down`/`stuck`/`up`/`ok`/`nodata`). El delta interno **por día trabajado** (`delta.horasPct`/`tareasPct` = `pctChange` del ritmo/día vs período previo) ya **no se muestra como columna** (la columna `Δ tareas` está oculta) pero sigue alimentando el semáforo `Estado`.
- **Asistencia** (`getAttendanceStats`): por persona en el período actual — `businessDays` (lun-vie), `daysPresent` (días hábiles con WorkDay), `leaveDays` (días hábiles de `VacationRequest` aprobadas, recortados al período), `expectedDays` (= hábiles − licencias), `absentDays` (= esperados − presentes), `lateDays` (tardanzas: primer login del día vs `workStartTime` + tolerancia; `null` sin horario), `dailyHours`/`availableHours` (**horas disponibles** = `expectedDays` × jornada, jornada = `workEndTime − workStartTime`; `null` si falta horario completo). El controller agrega por persona `registeredHours` (= `Horas`), `availableHours` y `utilization` (= **Δ horas**, `null` sin horario). Separa "el mes está a medias / hubo licencia" de "faltó". Se muestra como columna compacta y como bloque **"Horas y Asistencia"** en la fila expandida (Δ horas · disponibles · registradas · presencia · tardanzas).
- **Comparación con el equipo**: `computeBenchmark` devuelve la **mediana** (no promedio) de `completed`/`horas`/`tasaCompletado`/`tareasPorDia` de quienes tuvieron actividad; el controller le suma `utilizationMedian` (mediana de Δ horas). El front muestra indicadores `▲/▼ vs equipo` por celda (incluida Δ horas), un bloque comparativo en la expansión y la mediana en el pie.
- **Δ horas del equipo** (encabezado de la sección): el controller expone `teamHours` con `utilizationWeighted` (= Σ horas registradas ÷ Σ horas disponibles del equipo — promedio **ponderado por horas**, lo que muestra el encabezado), `utilizationAvg` (promedio simple), totales `totalRegistered`/`totalAvailable` y `nWithSchedule`/`nTotal`. Sólo cuenta a quienes tienen horario (inicio **y** fin) configurado.
- **UI** (`ProductivityTab.jsx`): la sección es **solo por persona** (la vista por proyecto se movió a Reportes, ver más abajo). El fetch de `/admin/productivity` vive en el componente raíz (alimenta el encabezado "Δ horas del equipo" + la tabla). Tabla por persona en orden `Δ horas · Tareas · Horas · Tasa · Asistencia · Estado`, con panel de ayuda colapsable, chips de estado que filtran, y en la fila expandida: (1) **gráfico de líneas de horas por semana de las últimas 12 semanas** (`getHoursHistory`, independiente del período) a todo el ancho → (2) grid de 3 columnas (Tiempo por proyecto / Horas y Asistencia / comparación con el equipo) → (3) **análisis IA a todo el ancho** abajo. "Tiempo por proyecto" es **expandible a tareas**: al abrir un proyecto trae lazy el drill-down persona→proyecto→tarea vía `GET /admin/productivity/users/:userId/breakdown?mode=` (usa `taskMins`, tope 8h, consistente con las horas de la sección).

**Reportes (`/reports`, admin) — solo proyectos:** `Reports.jsx` muestra **únicamente** la vista por proyecto (proyecto→persona→tarea, drill-down a tarea editable + % presupuesto). El filtro es `DateRangeFilter` en modo **`compact`**: una sola línea de presets (Hoy · Esta semana · Este mes · Mes pasado) + dropdown "Elegir mes…", **sin calendarios** ni rango libre. La barra de cada proyecto compara las **horas registradas contra el 100% de las horas contratadas del mes** (`monthlyHours`, **sin ponderar** por días transcurridos — se sacó el `× monthsInRange`): muestra `horas usadas / Nh contratadas` y `% de las horas contratadas` (rojo si supera el 100%). Se quitó el badge Δ vs período anterior. La lista se ordena con un selector (sin refetch, vía `useMemo`): **Más horas usadas** (default, por `totalMinutes` desc) · **Más horas contratadas** (por `monthlyHours` desc, los sin presupuesto al final) · **Mayor % usado** (por `totalMinutes / horas contratadas`, los sin presupuesto al final). Se eliminó el tab "Por persona" de Reportes (y el endpoint `byUserSummary`); el registro persona→proyecto→tarea ahora vive en el detalle expandido de cada persona en Productividad. `DateRangeFilter` es compartido: `MyReports.jsx` lo sigue usando en modo completo (rango libre con calendarios).

**Mis Reportes (`/my-reports`, usuario) — self-view + registro:** `MyReports.jsx` muestra arriba el componente `MyProductivity.jsx` (self-view filtrado del **mes en curso**, vía `GET /reports/mine/productivity`): Δ horas propio, tareas, horas, tasa (cada uno con la **mediana anónima del equipo**), sparkline de horas de 12 semanas, una **nota suave** que reemplaza al semáforo crudo (no expone etiquetas `down`/`stuck`) y el análisis IA del usuario. Debajo sigue el registro por proyecto de siempre (rango libre, drill a tarea). El self-view **no** incluye asistencia/tardanzas con framing evaluativo.
- **Visibilidad de la sección** (`Workspace.productivityEnabled`, default `true`): toggle workspace-level en **Preferencias → Globales** ("Sección de Productividad"). Con OFF se **oculta el sublink** de Productividad del nav (`Navbar.jsx` lo gatea con `workspace.productivityEnabled`, que viaja en `GET /workspaces/info`) y el cron del digest lo omite. Al togglearlo, Preferencias llama a `refreshWorkspace()` para que el nav se actualice al instante.
- **Aviso semanal por mail** (`productivityDigest.service.js`): cron lunes 08:00 ART (`sendAllProductivityDigests`) que, por cada workspace activo con `productivityEnabled` **y** `productivityDigestEnabled` (ambos default `true`), arma el digest del mes en curso y envía a los **admins/owners** un mail con las personas en alerta (`inactive`/`down`/`stuck`). **Solo envía si hay ≥1 persona en alerta** (cero ruido). Email `sendProductivityDigestEmail` (type `productivityDigest` en `EmailLog`). El toggle del aviso y un botón **"Enviar ahora a mi correo"** viven anidados bajo el toggle de la sección en Preferencias → Globales. **Enviar ahora** (`POST /api/admin/productivity/digest/send-now` → `sendTestDigest`) manda el mail **solo al admin que lo pide** (`req.user.email`) y **siempre** lo envía (incluso sin alertas, con la variante "todo en orden" + nota `[prueba]`), para poder previsualizarlo.

**Admin panel deep linking:** `Admin.jsx` reads `?tab=` query param on mount. Valid tabs: `projects`, `team`, `services`, `roles`, `role-ai`, `legajo`, `empresa`. Falls back to `'projects'`.

**Preferences:** For admins, shows two tabs — **Globales** (workspace settings: timezone, project settings, **seguimiento de horarios/puntualidad** vía `attendanceTrackingEnabled`) and **Personales** (AI feature toggles + **Módulos adicionales**: opt-out de feature flags habilitados por SuperAdmin para este workspace). Non-admins see only the personal view without the modules section.

**Login tracking:** Every successful login records a `UserLogin` row (userId, workspaceId, loginAt UTC, method). Used in the RRHH panel for login history and average login time.

**Horario laboral y tardanzas:** Cada `WorkspaceMember` tiene un horario de jornada opcional: `workStartTime` y `workEndTime` (`String?` formato `"HH:MM"` 24h en la timezone del workspace; `null` = sin horario, único para todos los días de la semana). Se configura desde **Admin → Equipo** (`TeamTab.jsx`, formulario de edición inline de cada miembro, dos `<input type="time">`). El backend valida el formato (`normalizeTime` en `workspace.controller.js` → 400 si es inválido) y expone los campos en `GET /api/workspaces/current/members` y `GET /api/users`. **Tardanza** = el **primer login del día** (la "llegada", en la TZ del workspace) supera `workStartTime` + tolerancia; logins posteriores del mismo día no cuentan. **Tolerancia configurable** (`Workspace.lateToleranceMins`, default `0`, editable en Preferencias → Globales, 0–120): con 5, una llegada 09:05 con horario 09:00 NO es tardanza pero 09:06 sí; el `lateBy`/`avgLateMins` se mide **por encima del límite tolerado** (09:06 con tol. 5 → +1 min). El cálculo es **determinístico, no se persiste** — se recalcula en cada request. Visible en: el legajo (`userSummary` devuelve `punctuality { expectedStart, daysCount, lateDays, onTimeDays, avgLateMins, punctualityPct }`), la pestaña Ingresos (badge por persona + `+N min` por día, client-side) y el MiniDashboard (`dashboard-stats` devuelve `avgFirstLoginTime`, `teamPunctualityPct`, `lateCount`/`scheduledDays`, `membersWithSchedule` y `lateToday: [{ userId, lateBy }]`). **`avgFirstLoginTime`, `teamPunctualityPct`, `lateCount` y `scheduledDays` son del MES EN CURSO** (la query de logins se acota a `[mes-01, hoy]`); el histórico de otros meses vive en los snapshots `avgLoginTime`/`punctuality`. `lateToday` es de hoy. Personas sin horario configurado no muestran tardanzas.

**Seguimiento de horarios (toggle):** `Workspace.attendanceTrackingEnabled Boolean @default(true)` enciende/apaga el bloque de asistencia de RRHH (hora promedio de ingreso, puntualidad del equipo, tardanzas). Se togglea desde **Preferencias → Globales** ("Seguimiento de horarios y puntualidad"); persiste vía `saveGlobalSettings` (workspace-level) y viaja al frontend en `GET /workspaces/info` (contexto). Con OFF, `dashboardStats` deja `scheduleMap` vacío (todos los campos de asistencia null) y `userSummary` no calcula `punctuality`; el MiniDashboard y la pestaña Ingresos ocultan tardanzas. Con ON y **cero horarios configurados** (workspace nuevo), el MiniDashboard muestra un `SetupHintCard` ([SetupHintCard.jsx](frontend/src/components/SetupHintCard.jsx)) que invita a cargar horarios en Admin → Equipo en vez de ocultar la tarjeta. La **hora promedio de ingreso** se calcula **solo sobre personas con horario** (los freelancers / otra franja horaria sin horario no se promedian ni cuentan para puntualidad). `SetupHintCard` es el componente reutilizable para estos estados de "falta configurar X" (también usado en GEO/SEO cuando falta `websiteUrl`). La **tolerancia** (`Workspace.lateToleranceMins`, ver "Horario laboral y tardanzas") también se edita en Preferencias → Globales (campo visible solo con el seguimiento encendido) y viaja por el mismo contexto (`getInfo`); el cálculo de tardanzas (backend en `dashboardStats`/`userSummary`, client-side en la pestaña Ingresos) la suma al `workStartTime`.

**Notificación de tardanzas por email:** Sub-opción de "Seguimiento de horarios" (Preferencias → Globales, visible solo con el seguimiento encendido). Campos en `Workspace`: `lateNotifyEnabled` (bool, default false), `lateNotifyThreshold` (Int 1–10, default 3), `lateNotifyTemplate` (String?; null = texto por defecto `DEFAULT_LATE_TEMPLATE`). Cuando está activa, tras **cada login** se dispara `triggerLateCheck` (fire-and-forget vía `setImmediate`, nunca bloquea ni lanza) → `checkAndNotifyLate` en [lateNotification.service.js](backend/src/services/lateNotification.service.js): solo actúa si la **llegada de hoy** fue tardía (regla `lateMinutes` = `loginMins - workStartTime - tolerancia > 0`), cuenta los **días con tardanza en los últimos 30 días**, y si llega al umbral envía el email (`sendLateNotificationEmail` en `email.service.js`, tipo `lateNotification`). **Dedup**: a lo sumo 1 envío por persona cada 30 días (consulta `EmailLog`). El cuerpo es el `lateNotifyTemplate` con placeholders `[Nombre]` y `[workspace]` interpolados y formateado a HTML (párrafos). El hook está en los 4 puntos donde se crea `UserLogin` (login email/google/switch/record-login en `auth.controller.js`). `getGlobalSettings` devuelve el template efectivo (stored o default); al guardar, un template vacío o igual al default se persiste como `null`. **Vista previa**: `POST /api/projects/settings/late-notification/test` (admin) envía el email al usuario actual usando el `template` del body (para previsualizar ediciones sin guardar) o el guardado/default — botón "✉️ Probar ahora" en Preferencias → Globales.

**Legajo configurable (Admin → 📋 Legajo):** El formulario de datos personales del equipo es **configurable por workspace**. Dos tipos de campo (catálogo único en [legajoCatalog.js](backend/src/lib/legajoCatalog.js), helpers de UI en [frontend/src/components/legajo/](frontend/src/components/legajo/)):
- **builtin** — los 14 campos base (phone, birthday, address, dni, cuit, alias, bankName, maritalStatus, children, educationLevel, educationTitle, bloodType, medicalConditions, healthInsurance, emergencyContact). Mapean a columnas fijas de `User` (globales al usuario, compartidas entre workspaces). No se pueden borrar ni cambiar de tipo/columna; sí ocultar, renombrar, marcar obligatorio, reagrupar y reordenar.
- **custom** — campos propios del workspace (tipos `text`/`textarea`/`number`/`date`/`select`/`boolean`). Se guardan en `WorkspaceMember.legajoData` (JSON `{ key: value }`, **workspace-scoped** — un mismo `User` en dos workspaces tiene legajoData distinto).

La config completa (builtins editados + customs) vive en `Workspace.legajoFields` (JSON array; `[]` = usa el catálogo default). `Workspace.legajoEnabled` togglea la tarjeta/aviso de legajos en RRHH. Endpoints: `GET /api/legajo/fields` (cualquier miembro — lo usan MyProfile y RRHH) y `PUT /api/legajo/fields` (admin — valida con `sanitizeLegajoFieldsInput`, blinda builtins, re-agrega builtins faltantes, exige opciones en selects). **Edición de valores: self-service** — cada persona completa su legajo desde **Mi Perfil** ([MyProfile.jsx](frontend/src/pages/MyProfile.jsx)), que renderiza el form dinámicamente con [LegajoFormFields.jsx](frontend/src/components/legajo/LegajoFormFields.jsx); `PATCH /api/profile` escribe los builtin en columnas de `User` y los custom en `WorkspaceMember.legajoData`. **"Legajo completo"** = todos los campos **obligatorios** cargados (si no hay obligatorios, heurística legacy: al menos un dato). El MiniDashboard de RRHH cuenta incompletos con `isLegajoComplete` y muestra un `SetupHintCard` si hay incompletos (gateado por `legajoEnabled`); la pestaña Legajos renderiza el grid dinámicamente. Hook cacheado `useLegajoFields` (invalidar con `clearLegajoFieldsCache()` tras guardar). El builder ([LegajoTab.jsx](frontend/src/components/admin/LegajoTab.jsx)) no aparece para no-admins. Las opciones de los selects builtin (estado civil, educación, grupo sanguíneo) salen del catálogo único (antes estaban duplicadas y desalineadas entre MyProfile y RRHH).

**RRHH panel (`/admin/rrhh`):** Three-part structure:
- **MiniDashboard** — tarjetas pequeñas: **Iniciaron sesión hoy** (primera; clickeable → modal `PeopleListModal` con quiénes **no** ingresaron, solo si hay alguno), Antigüedad promedio, Proyectos por persona, legajos, y el bloque de asistencia. Las **tarjetas con métrica mensual son clickeables** → abren `MetricHistoryModal` con la evolución mes a mes: Antigüedad promedio, Proyectos por persona, Horario promedio de ingreso y Puntualidad del equipo (ver "Snapshots de métricas de RRHH"). Tarjetas "de hoy" clickeables a una lista de personas (no a historial): Iniciaron sesión hoy y **Llegaron tarde hoy** (→ quiénes llegaron tarde). **Horario promedio de ingreso** y **Puntualidad del equipo** muestran datos del **mes en curso** (`dashboardStats` acota los logins a `[mes-01, hoy]`; el histórico de otros meses está en los snapshots). **Horas disponibles del equipo** (`🕗`, solo con seguimiento de horarios + ≥1 horario): suma de horas diarias (`workEndTime − workStartTime`) de quienes tienen horario; sub "X de Y con horario"; clickeable → `TeamHoursModal` (detalle por persona + quiénes no tienen horario). Cálculo client-side desde `GET /api/users`. (Antes existía "Personas activas", removida por ser redundante con "Iniciaron sesión hoy".)
- **Legajos tab** — per-person view: avg login time + **puntualidad vs horario esperado**, projects, vacation days (±1 buttons), personal data grid. El header muestra la fecha de inicio en el workspace (`workspaceJoinedAt` = `WorkspaceMember.createdAt`, expuesto por `GET /api/users`). **Editar/eliminar ingresos:** el modal "Primer ingreso por día" (`LoginDaysModal`) permite corregir la hora o borrar el primer ingreso de cada día (✏️/🗑️ → `PATCH`/`DELETE /api/admin/rrhh/logins/:loginId`); recalcula promedio y puntualidad al instante. Útil cuando un login de la tarde (fin de semana/feriado) distorsiona el promedio.
- **Ingresos tab** — date range filter + person filter, login history grouped by user, sort by avg time, **badge de tardanza por persona y por día**. Cada ingreso individual se puede **editar (hora) o eliminar** inline (mismos endpoints `PATCH`/`DELETE /api/admin/rrhh/logins/:loginId`).

**Snapshots de métricas de RRHH:** `RrhhMetricSnapshot` (uno por `(workspaceId, metric, month)`, `month` = `"YYYY-MM"` en la TZ del workspace; campos `metric`, `value Float`, `detail Json`). Modelo **genérico** para snapshotear la evolución mensual de las tarjetas del MiniDashboard. Catálogo `METRICS` en `backend/src/services/rrhhMetricSnapshot.service.js`, con dos clases de métrica:
- **Stock** (estado actual, ignoran el mes — el snapshot captura "como está hoy"): `activeMembers` (integrantes activos; detail `{}`), `projectsPerPerson` (proyectos activos ÷ equipo; detail `{ activeMembers, activeProjects }`), `tenure` (antigüedad promedio en años según `User.createdAt`; detail `{ memberCount }`).
- **Período** (valor del mes, calculadas filtrando logins al mes; devuelven `null` si el seguimiento de horarios está apagado o nadie tiene horario → se omiten): `avgLoginTime` (promedio mensual del primer ingreso en minutos desde medianoche, solo quienes tienen horario; detail `{ scheduledDays, membersWithSchedule }`), `punctuality` (% de llegadas a horario; detail `{ lateCount, scheduledDays }`). Ambas comparten el cómputo de asistencia vía un ctx memoizado para no consultar los logins dos veces.

Para agregar otra métrica basta sumar una entrada al catálogo `METRICS` (queda incluida en el upsert perezoso, el cron y el endpoint). **Doble escritura:** upsert perezoso del **mes actual** de todas las métricas en cada llamada a `dashboardStats` (así el historial se construye con el uso; `projectsPerPerson` se pasa precalculado, el resto lo computa el servicio) + cron `30 6 1 * *` ART (`saveAllPreviousMonthSnapshots`) que congela el **mes anterior** de todos los workspaces aunque nadie visite RRHH. `GET /api/admin/rrhh/metric-history?metric=<key>&year=YYYY` devuelve `{ snapshots, availableYears }`: sin `year` → últimos 12 meses (rellena huecos con `value: null`); con `year` → los 12 meses calendario de ese año. El frontend (`MetricHistoryModal`, configurado por `METRIC_HISTORY[metric]` con icono/título/formateo/`barMode`) muestra barras por mes y un selector de año (solo si `availableYears.length > 1`). `barMode: 'range'` (usado en `avgLoginTime`) escala las barras dentro del `[min, max]` del período en vez de desde 0 (mejor para horas del día).

**Landing y funnel de conversión:**
- Landing pública en [Landing.jsx](frontend/src/pages/Landing.jsx) — 15 secciones reposicionadas al ICP "agencias de marketing": Hero ("El sistema operativo de tu agencia"), TrustedByBar (logos), Problem (específico a agencias), Solution, **SegmentCards** (Agencias / EOS / Equipos), Features, How, **ComparisonTable** (vs Asana / Notion / SEMrush), **TestimonialsSection**, Benefits, Pricing summary, **FounderBio**, FAQ agrupada (12 preguntas), Final CTA, Footer expandido.
- Pricing page dedicada en [Pricing.jsx](frontend/src/pages/Pricing.jsx) — 3 planes + calculadora interactiva (slider de seats con cálculo en vivo) + tabla comparativa de 25+ filas agrupadas (Tareas / IA / Marketing / EOS / RRHH / Soporte) + garantías + FAQ específico de billing.
- Componentes reusables en [frontend/src/components/landing/](frontend/src/components/landing/) — `TrustedByBar`, `SegmentCards`, `ComparisonTable`, `TestimonialCard`, `TestimonialsSection`, `FounderBio`.
- SEO base con `react-helmet-async` (HelmetProvider en main.jsx). Cada página inyecta `<title>`, `<meta description>`, OG, canonical y JSON-LD (SoftwareApplication + Organization + FAQPage). Archivos estáticos: `/robots.txt`, `/sitemap.xml`, `/llms.txt`, placeholder `/og-image.png`.
- **Onboarding seed**: al crear un workspace nuevo, [workspaceSeed.service.js](backend/src/services/workspaceSeed.service.js) inserta automáticamente un Service ("Marketing Digital"), un UserRole ("PROJECT_MANAGER"), un WorkDay, y un Project "Demo — Aprendé BlissTracker" con 8 tareas variadas (IN_PROGRESS / PENDING / BLOCKED / PAUSED / COMPLETED) y starreadas. Marca `Workspace.demoSeeded = true`. El admin puede borrar el proyecto demo desde Preferencias → "Proyecto demo".
- **Onboarding tour**: componente [OnboardingTour.jsx](frontend/src/components/OnboardingTour.jsx) en el Dashboard. Modal de 5 pasos para usuarios nuevos. Skippable, persistido en localStorage (`bliss_tour_completed_<userId>`). Trackea `tour_started`, `tour_step_completed`, `tour_skipped`, `tour_completed`.
- **Email lifecycle del trial**: cron diario 09:00 ART en [trialLifecycle.service.js](backend/src/services/trialLifecycle.service.js). Envía 4 emails escalonados a workspaces con `status='trialing'`: día 3 (check-in), día 7 (progreso), día 12 (urgencia), día 13 (último día). Dedupe vía `EmailLog` (no envía 2 veces el mismo type al mismo workspace).
- **Tracking de conversión**: helper [analytics.js](frontend/src/lib/analytics.js) con `trackEvent(name, params)` dual GA4 + backend. Backend escribe en `ConversionEvent` (modelo con allowlist en [events.controller.js](backend/src/controllers/events.controller.js)). Eventos instrumentados: `landing_cta_click`, `pricing_page_viewed`, `pricing_calc_used`, `signup_started`, `signup_completed`, `tour_*`. Endpoint `/api/events` público sin auth (decodifica JWT si está presente para asociar al user/workspace). Funnel agregado disponible en `GET /api/superadmin/conversion-funnel`.

**Super Admin panel (`/superadmin`):** Internal panel for the BlissTracker team (requires `User.isSuperAdmin`). Sidebar navigation:
- **Dashboard** — global stats (workspaces, users, AI tokens) + workspace list con búsqueda + edición de status + impersonación + edición del `monthlyTokenLimit` por workspace. La **impersonación** (`POST /api/superadmin/impersonate`) abre el workspace en una pestaña nueva con un JWT (2h) que actúa con el **rol real** del miembro (owner/admin/member) — **no** lleva `isSuperAdmin` (no puede acceder a `/superadmin` ni a los bypass globales) y lleva un claim `impersonatedBy` con el id del superadmin para auditoría.
- **Usuarios** — lista global cross-workspace con búsqueda por email/nombre, filtros (todos / activos / desactivados / huérfanos sin workspace), badge de SuperAdmin, último login, toggle global de activación (desactiva TODAS las `WorkspaceMember.active` del usuario — kill switch operativo sin migración) y toggle global del insight diario IA (aplica a todas las memberships; al apagar también baja `insightMemoryEnabled` y `taskQualityEnabled` por ser subordinados). El estado del insight se muestra como chip ON/OFF/mixto. Los SuperAdmins no pueden desactivarse desde acá.
- **Billing** — MRR, ARR, conteos por estado (activos/trial/past_due), tabla de todos los workspaces con filtros. Pricing tiers configurables desde **Configuración** (PlatformSetting `pricingTiers`).
- **Configuración** — Ajustes globales de la plataforma (`PlatformSetting`). Settings agrupados en Comercial (trial duration, default token limit, pricing tiers, costos Haiku), Operativo (cooldown IA, warning/critical thresholds, trialing-soon, 6 retention policies, **actor de Apify para LinkedIn** `apifyLinkedinActor` + su tope de posts `apifyLinkedinPostsLimit`) y **Notificaciones de plataforma** (ver concepto "Notificaciones de plataforma"). Catálogo definido en `backend/src/config/platformSettings.js` y auto-upserteado al boot (solo crea, nunca pisa el valor existente). Tipos soportados: `integer`, `float`, `boolean`, `string`, `pricingTiers`. Helper `getSetting()` en `backend/src/lib/platformSettings.js` con caché in-memory TTL 60s + invalidación on-write. Audit log en `PlatformSettingLog` (quién cambió qué cuándo). Soporta batch update con validación de tipos + bounds + cross-field (`tokenCriticalPct > tokenWarningPct`). Cuando se baja un retention setting, la UI ofrece "Aplicar limpieza ahora" con preview de filas afectadas (vía `cleanup.service.js`).
- **Pagos** — historial de invoices reales de Stripe (`GET /api/superadmin/payments`) con paginación.
- **AI Tokens** — uso de tokens de IA agregado por workspace/mes (`GET /api/superadmin/ai-tokens`).
- **Feedback** — all feedback from all workspaces with read/unread filtering.
- **Emails** — full `EmailLog` history with type/status filters and pagination.
- **Announcements** — banners globales visibles en la app.
- **Avatares** — gestión de fotos de perfil disponibles.
- **Feature Flags** — toggle de flags por workspace o globalmente. Los flags se definen en código, no se crean desde la UI.
- **Legal** — edición de los documentos legales (`terms_of_service`, `privacy_policy`) servidos en `/condiciones` y `/privacidad`.

**Email logging:** All emails (sent or failed) are written to `EmailLog` with: workspaceId?, to, subject, type, status, errorMsg?, createdAt. The `email.service.js` wraps every send in try/catch and logs both outcomes. Visible in the Super Admin panel → Emails section.

**Remitente de emails (`From`):** `getEmailFrom(workspaceId)` resuelve el remitente en este orden: `Project.emailFrom` del primer proyecto del workspace → setting global `platformEmailFrom` (SuperAdmin → Configuración) → env `EMAIL_FROM` → hardcodeado. El helper `getPlatformFrom()` aísla la cadena setting→env y lo usan tanto `getEmailFrom` como las notificaciones de plataforma. Así el "From" global es editable sin tocar env vars, manteniendo el override por proyecto.

**Notificaciones de plataforma (avisos internos al equipo BlissTracker):** `sendPlatformNotification(event, { subject, bodyHtml, workspaceId })` en `email.service.js` envía avisos operativos a la casilla interna definida en el setting `platformAdminEmail` (SuperAdmin → Configuración, grupo "Notificaciones de plataforma"). **No-op silencioso** si la casilla está vacía (sistema apagado) o si el toggle del evento está en off; nunca lanza (los hooks la llaman fire-and-forget). `platformAdminEmail` acepta varias direcciones separadas por coma. El remitente sale de `platformEmailFrom`. Los avisos se loguean en `EmailLog` con `type: 'adminAlert'`. Helper `platformCard(title, rows, accent)` arma el HTML de detalle. Cada evento tiene su toggle booleano (`notifyOn*`):
- `feedback` → `notifyOnFeedback` — usuario envía sugerencia/bug (`feedback.controller.js`).
- `newWorkspace` → `notifyOnNewWorkspace` — alta de workspace (`workspace.controller.js` `createWorkspace`).
- `paymentSuccess` → `notifyOnPaymentSuccess` — activación (`checkout.session.completed`) y renovaciones (`invoice.payment_succeeded` solo `billing_reason='subscription_cycle'`, para no duplicar la activación) en `stripe.webhook.js`.
- `paymentFailed` → `notifyOnPaymentFailed` — `invoice.payment_failed`.
- `cancellation` → `notifyOnCancellation` — `customer.subscription.deleted` (churn).
- `deletionRequest` → `notifyOnDeletionRequest` — owner programa borrado de workspace (`scheduleDeletion`).
- `trialExpired` → `notifyOnTrialExpired` — trial vencido sin conversión que pasa a `past_due` (`billingTier.service.js` `reconcileWorkspaceTier`, solo transición `trialing → past_due`).

**Workspace deletion:** Owner can schedule deletion from Preferences → Zona de peligro. Creates `WorkspaceDeletionRequest` with 48h grace period. A warning email is sent to all admins. Any admin can cancel. A cron job checks for due deletions and executes `executeWorkspaceDeletion()`.

**Backlog:** `isBacklog Boolean @default(false)` on Task. Backlog tasks are hidden from the main focus view. `add-to-today` sets `isBacklog=false` and moves to today's workday. The insight context labels backlog tasks as "planificación semanal, no son prioridad inmediata."

**Tareas futuras y recurrentes:** Dos opciones al crear una tarea (toggles debajo del botón en `AddTaskModal.jsx`, mutuamente excluyentes). Comparten una primitiva: `Task.scheduledFor String?` (fecha de aparición `"YYYY-MM-DD"`; null = tarea normal/ya activa). Mientras `scheduledFor > hoy` la tarea **no** aparece en foco/backlog/carry-over/delegadas/realtime/proyecto — se excluye con el predicado `scheduledFor IS NULL OR scheduledFor <= hoy` en todas las consultas que listan tareas. La tarea futura igual necesita un `workDayId` (NOT NULL): se engancha como placeholder al workday del día de creación y se filtra hasta su fecha.
- **Tarea futura (one-off):** `POST /tasks` con `scheduledFor`. Si la fecha es ≤ hoy se trata como tarea normal. Aparece en la sección **Futuras** del dashboard (colapsable, después de Completadas), con botón "Traer a hoy" (`PATCH /tasks/:id/bring-to-today` → limpia `scheduledFor`, la engancha al workday de hoy).
- **Tarea recurrente:** modelo `TaskRecurrence` (plantilla: `frequency` daily|weekly|monthly|annual, `weekdays` JSON `[0-6]` solo weekly — **multi-día**, `dayOfMonth`/`month` derivados de `startDate`, `endDate` null = nunca, `lastSpawnedDate`). `POST /tasks` con `recurrence {frequency, weekdays, endDate}` crea la plantilla + materializa la primera ocurrencia. Cada instancia es un `Task` con `recurrenceId` + `scheduledFor`. No tienen sección propia: aparecen en el flujo normal con un badge 🔁 (`TaskCard`).
- **Materialización perezosa:** `getOrCreateToday` llama a `materializeForUser` (en `recurrence.service.js`): (a) **activa** las tareas vencidas (`scheduledFor <= hoy` → workday de hoy, `scheduledFor=null`) y (b) **rellena** la próxima ocurrencia de cada recurrencia activa (a lo sumo una por adelantado, **sin backfill** de ocurrencias perdidas). TZ-correcto por workspace, sin cron. Aislado en su propio try para no romper el dashboard. Lógica de fechas pura y testeada en `recurrence.service.test.js` + `recurrenceMaterialize.test.js`.
- **No completadas se acumulan:** una instancia que no se completó queda como carry-over normal; la generación de la próxima ocurrencia no depende de que la anterior se complete.
- **Editar/borrar con scope:** `PATCH /tasks/:id?scope=series` y `DELETE /tasks/:id?scope=series`. `series` en editar actualiza la plantilla + instancias futuras no completadas; en borrar elimina la plantilla (las instancias completadas conservan el historial vía `onDelete: SetNull`) + las instancias no completadas. `TaskCard` muestra el modal "Solo esta / Esta y todas las siguientes" cuando `recurrenceId != null`.

**AI insight context — backlog separation:** Backlog tasks are explicitly separated from pending tasks in the Claude prompt to prevent suggesting their removal.

**EOS module (`/admin/eos`):** Sistema Operativo Empresarial basado en *Traction* de Gino Wickman. Requiere feature flag `eos` habilitado para el workspace. Seis componentes implementados:
- **Visión** — datos estratégicos del workspace (valores, misión, BHAG, estrategia, metas 1 año). Toggle "Ver VTO" muestra el Vision/Traction Organizer en formato del libro.
- **Personas** — People Analyzer (ratings GWC por persona) + Accountability Chart (árbol de responsabilidades jerárquico) + Strikes.
- **Datos** — Scorecard semanal/mensual con métricas numéricas, responsables y objetivos. Períodos: `YYYY-Www` (ISO week) | `YYYY-MM`. Dos clases de métrica: **manuales** (`ScorecardMetric` con `autoKey=null`; valores tipeados en `ScorecardEntry`) y **automáticas** (`ScorecardMetric.autoKey`, **solo-lectura**; valores calculados al vuelo, NO se persisten en `ScorecardEntry`). Catálogo de automáticas en [eosAutoMetricCatalog.js](backend/src/lib/eosAutoMetricCatalog.js), cada una con su `frequency`:
  - **Semanales**: `tardanzas` (llegadas tarde del equipo en la semana; menor es mejor) y `ocupacion` (Σ horas trabajadas ÷ Σ horas disponibles de quienes tienen horario, en %; mayor es mejor — ya ponderado por horas, normaliza 4h vs 8h).
  - **Mensuales** (**a mes vencido**: solo se llenan meses cerrados, el mes en curso queda vacío): `delta_horas` (= "Δ horas del equipo" de Productividad = ocupación mensual del equipo, con top 3), `proyectos_nuevos` (altas por `Project.createdAt` en el mes; lista los nombres), `proyectos_perdidos` (bajas por `Project.lostAt` en el mes; lista los nombres) y `equipo` (integrantes activos al cierre del mes, leídos del histórico `RrhhMetricSnapshot` métrica `activeMembers`; meses sin snapshot quedan vacíos).

  El admin las agrega con el botón **⚡ Dato automático** (catálogo; a lo sumo una por tipo vía `@@unique([workspaceId, autoKey])`); de una automática solo se edita la **meta** (name/unit/dirección/frecuencia salen del catálogo) y se puede borrar. Cálculo en [eosAutoScorecard.service.js](backend/src/services/eosAutoScorecard.service.js) → `computeAutoScorecardYear(workspaceId, tz, year, autoKeys)`: separa por frecuencia, bucketea semanales por semana ISO (rango = año con padding, sin futuro) y mensuales por mes calendario cerrado; ocupación semanal y mensual comparten el helper `occupancyByBucket`. Reutiliza los criterios de Productividad/Asistencia (tardanza = primer login > `workStartTime` + `lateToleranceMins`; horas disponibles = días hábiles esperados sin licencia × jornada `workEnd−workStart`; horas trabajadas = `taskMins`, tope 8h). Endpoint perezoso `GET /api/eos/scorecard/auto?year=YYYY` → `{ [autoKey]: { period: { value, top3? } } }`; [DatosTab.jsx](frontend/src/components/eos/DatosTab.jsx) lo carga por año (años cacheados en un `useRef`, para semana y mes) y la **tarjeta del período** muestra el valor + un **top 3** según el tipo (tardanzas: días, desempata minutos; ocupación/Δ horas: los que menos aprovecharon; proyectos: nombres). **El panel destacado arranca en el período ANTERIOR** (semana/mes pasados — los últimos con datos completos, que se cargan a posteriori); "Hoy" vuelve al actual. `upsertEntry` rechaza métricas automáticas (400).
- **Asuntos** — Issues IDS (Identify-Discuss-Solve). Tipos: `weekly` | `quarterly`. Estados: `open` | `solved`. Prioridades: `high` | `medium` | `low`.
- **Procesos** — Documentación de procesos con pasos ordenados. `EOSProcess.ownerRole` referencia el nombre del rol (no un User específico).
- **Tracción** — Rocks trimestrales (`YYYY-Q1..Q4`) + reuniones L10 semanales (ISO week) + To-Dos de la reunión.
- **Evaluación** — 18 preguntas (6 componentes EOS × 3) calificadas 1–5 por cada admin. Genera resultado grupal promediado con análisis Claude Haiku. Modelos: `OrgAssessmentRound` (estado `open`/`closed`) + `OrgAssessmentResponse` (única por round+user). Ruta: `GET/POST /api/eos/assessment`.

Todos los modelos EOS tienen `workspaceId` como scope. Las rutas `/api/eos/*` requieren `workspaceAdminOnly`.

**VacationRequest:** Sistema de licencias del equipo. Tipos: `vacaciones` | `estudio` | `maternidad` | `paternidad` | `enfermedad` | `duelo` | `mudanza` | `otro`. Flujo: member crea solicitud → admin aprueba/rechaza → notificaciones + email a ambos lados. Validación: `startDate` debe ser con al menos 48h de anticipación. Estados: `pending` | `approved` | `rejected`. Admins también pueden ajustar el saldo de días de vacaciones manualmente (`VacationAdjustment`).

### Prisma schema notes
- `WorkspaceMember.role`: `owner` | `admin` | `member` (workspace-level permissions).
- `WorkspaceMember.teamRole`: plain `String` referencing `UserRole.name` (e.g. `"DESIGNER"`).
- `WorkspaceMember.workStartTime` / `workEndTime`: `String?` formato `"HH:MM"` (horario laboral para tardanzas, ver concepto "Horario laboral y tardanzas").
- `WorkspaceMember.legajoData`: `Json @default("{}")` — respuestas de los campos **custom** del legajo (los builtin viven en columnas de `User`). Workspace-scoped. Ver concepto "Legajo configurable".
- `Workspace.attendanceTrackingEnabled`: `Boolean @default(true)` — toggle del bloque de asistencia/puntualidad en RRHH.
- `Workspace.productivityEnabled`: `Boolean @default(true)` — visibilidad de la sección de Productividad (nav + cron del digest).
- `Workspace.productivityDigestEnabled`: `Boolean @default(true)` — toggle del aviso semanal de Productividad por mail a admins/owners.
- `Workspace.lateToleranceMins`: `Int @default(0)` — minutos de gracia para tardanza (tarde solo si supera `workStartTime` + tolerancia).
- `Workspace.lateNotifyEnabled` / `lateNotifyThreshold` / `lateNotifyTemplate`: notificación de tardanzas por email (ver concepto "Notificación de tardanzas por email").
- `Workspace.legajoEnabled` / `legajoFields`: `Boolean @default(true)` / `Json @default("[]")` — toggle del aviso de legajos y config del formulario (builtins editados + custom; `[]` = catálogo default).
- `User.isSuperAdmin Boolean @default(false)` — global flag for the BlissTracker internal team only.
- `User.avatar String @default("2bee.png")` — filename, validated against `ALLOWED_AVATARS`.
- When a model has two relations to the same model, named relations are required (e.g. `Task.createdBy` / `Task.user` both pointing to `User`).
- `ProjectIntegration.propertyId` tiene distintos usos según `type`: GA4 → Property ID numérico; `google_ads` → Manager Account ID (MCC) si la cuenta es cliente de un manager; Meta Ads → no usado; TikTok → no usado; LinkedIn → Organization ID numérico de la Company Page (URN derivado: `urn:li:organization:{id}`). Para Instagram conectado por scraping: `scopes='scrape'`, `propertyId=username`, sin token.
- `ProjectIntegration.scopes` además de los scopes OAuth marca el modo de conexión: `fb_graph...` (token de Business Manager) y `scrape` (scraping de Instagram, sin token). Al desconectar (`DELETE /integrations/:type`) se borra la fila pero los IDs (propertyId/customerId/country) se recuerdan en `Project.integrationDefaults` y se repueblan al reconectar.
- Migrations live in `backend/prisma/migrations/`. Always use `migrate dev` locally and `migrate deploy` in production.
- `prisma migrate dev` fails in non-interactive shells. Workaround: manually create the migration directory + SQL file, then run `prisma migrate deploy` + `prisma generate`.
- Current migrations (in order): `add_missing_indexes`, `add_task_starred`, `add_user_avatar`, `add_notification_type`, `add_weekly_email_preference`, `add_project_links`, `add_daily_insight_preference`, `add_is_admin`, `add_daily_insight_cache`, `add_role_expectation`, `add_alerta_rol_to_insight`, `add_insight_memory`, `add_task_quality`, `add_task_backlog`, `add_project_member_notification`, `add_task_comments`, `v1_5`, `add_project_situation`, `add_project_settings`, `add_missing_indexes` (2nd), `add_project_email_from`, `add_one_active_task_constraint`, `add_ai_token_log`, `add_task_mention_type`, `add_workday_composite_index`, `add_memory_history`, `add_role_structure`, `add_user_login_history`, `add_vacation_days`, `add_bank_name`, `add_task_sessions`, `add_saas_multitenancy` (Workspace + WorkspaceMember + Subscription + scoped all tables), `add_workspace_invitation`, `add_email_log`, `add_vacation_management` (VacationRequest + VacationAdjustment), `add_workspace_deletion_request`, `add_announcements`, `add_avatars`, `fix_vacation_schema`, `add_feature_flags`, `add_marketing_geo` (GeoAudit + Project.websiteUrl), `add_project_connections` (Project.connections JSON), `fix_service_unique_index`, `add_legal_document`, `add_project_integration` (ProjectIntegration — tokens OAuth cifrados), `fix_project_name_unique`, `add_analytics_snapshot` (AnalyticsSnapshot + AnalyticsInsight), `add_instagram_snapshot`, `add_integration_country`, `add_keyword_tracking` (TrackedKeyword + KeywordRanking), `add_pagespeed_result` (PageSpeedResult), `add_instagram_follower_log`, `add_tiktok` (TikTokSnapshot + TikTokFollowerLog), `add_monthly_report` (MonthlyReport — token UUID para URL pública), `add_monthly_report_analysis`, `add_seo_snapshot` (SEOSnapshot para Google Search Console), `add_ai_traffic_snapshot`, `add_cannibal_report`, `add_eos_data`, `add_eos_focus`, `add_eos_ten_year_target`, `add_eos_vision_remaining`, `add_eos_issues` (EOSIssue), `add_eos_personas`, `add_eos_processes`, `add_eos_scorecard`, `add_eos_traction` (EOSRock + EOSTodo + EOSMeeting), `add_org_assessment` (OrgAssessmentRound + OrgAssessmentResponse), `update_eos_process_owner_role` (EOSProcess.ownerId → ownerRole String), `add_analytics_top_pages` (AnalyticsSnapshot.topPages + topSources), `add_monthly_report_data_cache` (MonthlyReport.dataCache), `add_workspace_branding` (companyName, companyDescription, industry, companyWebsite, logoData, bannerData), `add_workspace_brand_identity` (Workspace.brandColors + brandFonts), `add_workspace_disabled_features` (Workspace.disabledFeatureKeys), `add_report_banner` (MonthlyReport.bannerData + bannerMimeType — banner por informe), `add_serp_snapshot` (SerpSnapshot — snapshots SERP de SerpAPI por keyword), `add_workspace_monthly_token_limit` (Workspace.monthlyTokenLimit — presupuesto mensual de tokens de IA), `add_ads_snapshot` (AdsSnapshot — spend/impressions/clicks/ctr/conversions por proyecto+mes+tipo: meta_ads|google_ads), `add_platform_settings` (PlatformSetting + PlatformSettingLog — configuración global del SaaS editable desde SuperAdmin → Configuración), `add_landing_funnel` (Workspace.demoSeeded flag + ConversionEvent — instrumentación del funnel signup→trial→paid y seed del proyecto demo de onboarding), `add_linkedin_integration` (LinkedinSnapshot + LinkedinFollowerLog — métricas mensuales de Company Page de LinkedIn por proyecto), `add_instagram_top_posts` (InstagramSnapshot.topPosts — JSON con top 3 publicaciones del mes ordenadas por engagement = likes + comments), `add_project_integration_defaults` (Project.integrationDefaults JSON — recuerda propertyId/customerId/country por tipo al desconectar, para repoblarlos al reconectar), `add_competitors` (CompetitorAccount + CompetitorSnapshot + CompetitorFollowerLog — seguimiento de competidores de RRSS por scraping), `add_project_star` (ProjectStar — proyectos destacados por usuario en "Mis Proyectos"), `add_tiktok_top_videos` (TikTokSnapshot.topVideos — JSON con top 3 videos del mes por engagement = likes + comments + shares), `add_report_enabled_sections` (MonthlyReport.enabledSections — JSON array de secciones a incluir; null = informe aún no generado), `add_marketing_objective` (MarketingObjective — objetivos estructurados y persistentes por proyecto), `add_project_brief` (ProjectBrief — cuestionarios de relevamiento por proyecto, una fila por `(projectId, type)`, `answers` JSON, completables modularmente), `add_project_briefs_enabled` (Project.briefsEnabled — toggle global de la sección Briefs, default true), `add_recurring_future_tasks` (TaskRecurrence + Task.scheduledFor + Task.recurrenceId — tareas futuras y recurrentes), `add_domain_rating` (Project.domainRating + domainRatingAt + SearchConsoleSnapshot.domainRating — Domain Rating de Ahrefs, cache por proyecto + histórico mensual), `add_social_image` (SocialImage — cache de imágenes de RRSS para que los top posts de snapshots/informes no queden rotos cuando vence la firma del CDN), `add_member_work_schedule` (WorkspaceMember.workStartTime + workEndTime — horario laboral por persona para el cálculo de tardanzas), `add_notes_board_preference` (WorkspaceMember.notesBoardEnabled — preferencia personal para mostrar/ocultar la pizarra de notas), `add_workspace_attendance_tracking` (Workspace.attendanceTrackingEnabled — toggle del seguimiento de horarios/puntualidad en RRHH), `add_legajo_builder` (Workspace.legajoFields + legajoEnabled + WorkspaceMember.legajoData — formulario de legajo configurable por workspace con campos custom), `add_late_tolerance` (Workspace.lateToleranceMins — tolerancia en minutos para el cálculo de tardanzas), `add_late_notification` (Workspace.lateNotifyEnabled + lateNotifyThreshold + lateNotifyTemplate — email automático por acumulación de tardanzas en 30 días), `add_projects_per_person_snapshot` (ProjectsPerPersonSnapshot — snapshot mensual de la métrica "Proyectos por persona" de RRHH), `replace_projects_per_person_with_rrhh_metric` (RrhhMetricSnapshot — generaliza el snapshot anterior a un modelo de métricas de RRHH por `(workspaceId, metric, month)`: `projectsPerPerson` + `tenure`; migra datos y elimina ProjectsPerPersonSnapshot), `add_productivity_digest` (Workspace.productivityDigestEnabled — toggle del aviso semanal de Productividad por mail a admins/owners), `add_productivity_enabled` (Workspace.productivityEnabled — toggle de visibilidad de la sección de Productividad), `add_instagram_insights` (campos de insights extendidos de Instagram: reach/saved/shares/views por post desde la API oficial), `add_notes_board_notes` (NotesBoardNote — persistencia en DB del contenido de la pizarra de notas por usuario+workspace), `add_ai_token_log_workspace_month_index` (índice compuesto `AiTokenLog[workspaceId, createdAt]` — acelera la agregación del presupuesto de tokens por workspace+mes en el hot path del insight diario), `add_eos_scorecard_auto_metric` (ScorecardMetric.autoKey + `@@unique([workspaceId, autoKey])` — métricas automáticas del Scorecard EOS: tardanzas y ocupación, calculadas al vuelo), `add_project_lost_at` (Project.lostAt — fecha de baja de un proyecto, alimenta la métrica automática "Proyectos perdidos" del Scorecard EOS).
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
                                         # PATCH /api/profile además acepta legajoData (campos custom del legajo → WorkspaceMember.legajoData)

# Legajo (formulario configurable de datos personales)
GET    /api/legajo/fields                 # config efectiva de campos (cualquier miembro)
PUT    /api/legajo/fields                 # admin: reemplaza config { fields, legajoEnabled }
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
PATCH  /api/tasks/:id/bring-to-today      # adelantar una tarea futura a hoy
PATCH  /api/tasks/:id/move-to-backlog
PATCH  /api/tasks/:id?scope=series        # editar: scope=series actualiza la serie recurrente
DELETE /api/tasks/:id?scope=series        # borrar: scope=series elimina toda la serie recurrente
POST   /api/tasks  body: { ..., scheduledFor?, recurrence? }  # tarea futura / recurrente
GET    /api/tasks/completed              # ?skip=N&before=YYYY-MM-DD, 10/page
PATCH  /api/tasks/:id/duration           # task owner or admin
DELETE /api/tasks/:id
GET    /api/tasks/:id/comments
POST   /api/tasks/:id/comments

GET    /api/projects                     # todos los proyectos activos del workspace (incluye starred del usuario)
PUT    /api/projects/:id                 # admin: editar nombre, websiteUrl, connections, serviceIds, memberIds
PATCH  /api/projects/:id/star            # toggle destacado del proyecto para el usuario actual (preferencia personal)
GET    /api/projects/:id/members
GET    /api/projects/:id/tasks
GET    /api/projects/:id/completed       # ?skip=N
PUT    /api/projects/:id/links
GET    /api/projects/:id/briefs           # lista briefs del proyecto (cualquier miembro del workspace)
PUT    /api/projects/:id/briefs/:type     # upsert respuestas de un brief (admin/owner o miembro del proyecto)
GET    /api/realtime
GET    /api/reports/by-project              # admin: proyecto→persona→tarea + horas registradas vs 100% horas contratadas
GET    /api/reports/by-user                 # admin: tareas planas por usuario (?userId=) — no usado por el front actual
GET    /api/reports/mine                    # registro propio: proyecto→tarea (rango libre)
GET    /api/reports/mine/productivity       # self-view de productividad del usuario (mes en curso, filtrado)

GET    /api/admin/productivity              # tabla por persona (?mode=current|closed)
GET    /api/admin/productivity/users/:userId/breakdown   # drill persona→proyecto→tarea del período (lazy)
POST   /api/admin/productivity/:userId/refresh           # regenera el análisis IA de una persona
POST   /api/admin/productivity/digest/send-now           # envía el digest de prueba al admin actual

GET    /api/users                        # workspace members (admin)
GET    /api/users/:id/tasks

GET    /api/admin/rrhh/logins
GET    /api/admin/rrhh/last-logins
GET    /api/admin/rrhh/user-summary/:id
PATCH  /api/admin/rrhh/vacation-days/:id
PATCH  /api/admin/rrhh/logins/:loginId          # editar hora/fecha de un ingreso (UserLogin)
DELETE /api/admin/rrhh/logins/:loginId          # eliminar un ingreso
GET    /api/admin/rrhh/metric-history           # ?metric=activeMembers|tenure|projectsPerPerson|avgLoginTime|punctuality&year=YYYY — historial mensual (12 meses)

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
GET    /api/eos/scorecard                        # métricas + entradas manuales + autoCatalog
GET    /api/eos/scorecard/auto                    # ?year=YYYY — valores calculados de métricas automáticas por semana ISO { [autoKey]: { period: { value, top3 } } }
POST   /api/eos/scorecard                         # body: { ...manual } | { autoKey, goal? } para agregar un dato automático
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
POST   /api/marketing/geo/audit                  # dispara audit async, devuelve { auditId }
GET    /api/marketing/geo/audits                 # lista audits del workspace (?projectId=)
GET    /api/marketing/geo/audits/:id             # detalle completo de un audit
DELETE /api/marketing/geo/audits/:id             # elimina audit
GET    /api/marketing/geo/audits/:id/llms-txt    # genera contenido llms.txt con Claude
POST   /api/marketing/geo/audits/:id/schema      # genera JSON-LD Schema.org sugerido

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
POST   /api/marketing/projects/:id/integrations/connect-existing      # reutiliza tokens vigentes del workspace (mismo type)
POST   /api/marketing/projects/:id/integrations/instagram/connect-token  # conectar Instagram con token manual
POST   /api/marketing/projects/:id/integrations/meta-ads/connect-token   # conectar Meta Ads con System User Token
GET    /api/marketing/projects/:id/integrations             # lista integraciones del proyecto
PATCH  /api/marketing/projects/:id/integrations/:type       # actualizar propertyId / customerId
DELETE /api/marketing/projects/:id/integrations/:type       # desconectar integración + revocar token

# Marketing — Analytics GA4
GET    /api/marketing/projects/:id/analytics                # ?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
GET    /api/marketing/projects/:id/ads                      # datos de ads agregados (Meta + Google)
GET    /api/marketing/projects/:id/ai-traffic               # tráfico desde fuentes AI (Perplexity, ChatGPT, etc.)
GET    /api/marketing/projects/:id/health-score             # score compuesto: GEO + keywords + GA4 + PageSpeed

# Marketing — Google Ads
GET    /api/marketing/projects/:id/google-ads               # ?datePreset= — requiere customerId en integration + GOOGLE_ADS_DEVELOPER_TOKEN

# Marketing — Meta Ads
GET    /api/marketing/projects/:id/meta-ads                 # ?datePreset= — usa token de ProjectIntegration type=meta_ads

# Marketing — Instagram
POST   /api/marketing/projects/:id/integrations/instagram/connect-scrape  # conectar por scraping, body: { url | username }
GET    /api/marketing/projects/:id/instagram                # métricas del mes actual (modo scrape: snapshot cacheado)
GET    /api/marketing/projects/:id/instagram/snapshots      # ?months=12
POST   /api/marketing/projects/:id/instagram/snapshots      # body: { month }
GET    /api/marketing/projects/:id/instagram/followers      # ?from=YYYY-MM-DD&to=YYYY-MM-DD
POST   /api/marketing/projects/:id/instagram/scrape/refresh # fuerza scrape fresco (cooldown 30min) — solo integración scrape

# Marketing — Competidores (RRSS, scraping)
GET    /api/marketing/projects/:id/competitors              # ?platform=instagram — lista + ganancia de seguidores del mes
POST   /api/marketing/projects/:id/competitors              # body: { url | username, platform? } — agrega + primer scrape
GET    /api/marketing/projects/:id/competitors/:cid/history # ?months=6 — snapshots + follower logs
POST   /api/marketing/projects/:id/competitors/:cid/refresh # re-scrapea (cooldown 30min)
DELETE /api/marketing/projects/:id/competitors/:cid         # elimina competidor

# Marketing — TikTok
GET    /api/marketing/projects/:id/tiktok                   # métricas del mes actual
GET    /api/marketing/projects/:id/tiktok/snapshots         # ?months=12
POST   /api/marketing/projects/:id/tiktok/snapshots         # body: { month }
GET    /api/marketing/projects/:id/tiktok/followers         # ?from=YYYY-MM-DD&to=YYYY-MM-DD

# Marketing — LinkedIn (Company Page)
GET    /api/marketing/integrations/linkedin/auth-url        # ?projectId=
GET    /api/marketing/integrations/linkedin/callback        # callback OAuth (sin auth)
POST   /api/marketing/projects/:id/integrations/linkedin/connect-scrape  # conectar por scraping, body: { url | company }
GET    /api/marketing/projects/:id/linkedin                 # métricas del mes actual (modo scrape: snapshot cacheado)
GET    /api/marketing/projects/:id/linkedin/orgs            # lista pages donde el user es admin (selector post-OAuth)
GET    /api/marketing/projects/:id/linkedin/snapshots       # ?months=12
POST   /api/marketing/projects/:id/linkedin/snapshots       # body: { month }
GET    /api/marketing/projects/:id/linkedin/followers       # ?from=YYYY-MM-DD&to=YYYY-MM-DD
POST   /api/marketing/projects/:id/linkedin/scrape/refresh  # fuerza scrape fresco (cooldown 30min) — solo integración scrape
GET    /api/marketing/projects/:id/linkedin/scrape-debug    # ?company=<url|slug> — diagnóstico: output crudo de Apify + normalizado (botón "🔍 Diagnóstico")

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
GET    /api/marketing/projects/:id/domain-rating            # Domain Rating (Ahrefs) cacheado del proyecto
POST   /api/marketing/projects/:id/domain-rating/refresh    # refresca el Domain Rating desde Ahrefs (endpoint free)

# Marketing — Keyword Tracking
GET    /api/marketing/projects/:id/keywords                       # lista keywords trackeadas (?country=)
POST   /api/marketing/projects/:id/keywords                       # body: { query } — agregar keyword
DELETE /api/marketing/projects/:id/keywords/:kwId                 # eliminar keyword
GET    /api/marketing/projects/:id/keywords/suggest               # sugerencias GSC (?country=)
GET    /api/marketing/projects/:id/keywords/heatmap               # heatmap de posiciones (últimos 6 meses)
GET    /api/marketing/projects/:id/keywords/history-batch         # ?months=6 — historial de múltiples keywords
GET    /api/marketing/projects/:id/keywords/serp-batch            # snapshots SERP recientes para todas las keywords
GET    /api/marketing/projects/:id/keywords/:kwId/history         # historial de una keyword
POST   /api/marketing/projects/:id/keywords/:kwId/analysis        # análisis IA de una keyword
GET    /api/marketing/projects/:id/keywords/:kwId/serp            # snapshot SERP más reciente (reutiliza si <24h)
POST   /api/marketing/projects/:id/keywords/:kwId/serp/refresh    # fuerza nueva captura SERP (cooldown 15min)

# Marketing — Cannibalization (canibalización SEO)
POST   /api/marketing/projects/:id/cannibal                 # dispara análisis async
GET    /api/marketing/projects/:id/cannibal                 # lista reportes
GET    /api/marketing/projects/:id/cannibal/:rid            # detalle de un reporte
DELETE /api/marketing/projects/:id/cannibal/:rid            # eliminar reporte

# Marketing — Ads Snapshots
POST   /api/marketing/projects/:id/ads-snapshots            # body: { month, type: "meta_ads"|"google_ads" } — guardar snapshot manual
GET    /api/marketing/projects/:id/ads-snapshots            # ?type=meta_ads|google_ads&months=6 — historial

# Marketing — Vistas cross-proyecto (sin proyecto seleccionado)
GET    /api/marketing/summary/analytics                     # AnalyticsSnapshot más reciente por proyecto, ordenado por sesiones desc
GET    /api/marketing/summary/performance                   # PageSpeedResult más reciente por proyecto, ordenado por score desc
GET    /api/marketing/summary/instagram                     # InstagramSnapshot más reciente por proyecto, ordenado por seguidores desc
GET    /api/marketing/summary/tiktok                        # TikTokSnapshot más reciente por proyecto, ordenado por seguidores desc
GET    /api/marketing/summary/linkedin                      # LinkedinSnapshot más reciente por proyecto, ordenado por seguidores desc
GET    /api/marketing/summary/ads                           # AdsSnapshot más reciente por proyecto, ?type=meta_ads|google_ads, ordenado por spend desc
GET    /api/marketing/summary/reports                       # todos los MonthlyReport del workspace, ?limit=20&offset=0
GET    /api/marketing/summary/seo                           # sitios web del workspace ordenados por Domain Rating (Ahrefs) desc

# Marketing — Informes mensuales (autenticados)
GET    /api/marketing/projects/:id/reports                          # lista informes del proyecto
GET    /api/marketing/projects/:id/report-sections                  # estado por sección (available + integration) para el modal "Generar informe"
GET    /api/marketing/projects/:id/reports/:month                   # obtiene/crea informe (YYYY-MM) — perezoso: agrega datos solo si ya fue generado
PATCH  /api/marketing/projects/:id/reports/:month                   # actualiza notes y analysis
POST   /api/marketing/projects/:id/reports/:month/regenerate        # genera/regenera con body { enabledSections } (limpia analysis + dataCache)
POST   /api/marketing/projects/:id/reports/:month/banner            # multipart image — banner del informe (max 5MB)
DELETE /api/marketing/projects/:id/reports/:month/banner            # elimina banner del informe

# Marketing — Objetivos (estructurados, persistentes por proyecto)
GET    /api/marketing/projects/:id/objectives                       # lista objetivos del proyecto
POST   /api/marketing/projects/:id/objectives                       # crea un objetivo (category, metric, periodicity, target + params)
PATCH  /api/marketing/projects/:id/objectives/:oid                  # edita un objetivo
DELETE /api/marketing/projects/:id/objectives/:oid                  # elimina un objetivo

# Informes — acceso público (sin auth)
GET    /api/public/report/:token                            # datos completos del informe + `siblings` (otros informes generados del proyecto, para navegar)
GET    /api/public/report/:token/meta                       # metadata liviana (projectName, month, monthLabel, workspaceName, hasBanner) para los Open Graph de Vercel
GET    /api/public/report-banner/:token                     # imagen de portada del informe (también usada como og:image)

# Documentos legales — acceso público (sin auth)
GET    /api/legal/:key                                      # devuelve documento legal (terms_of_service, privacy_policy)

# Billing
GET    /api/billing/status               # estado trial/suscripción del workspace
POST   /api/billing/checkout             # crea Stripe Checkout session (admin/owner)
POST   /api/billing/portal               # abre Stripe Customer Portal (admin/owner)
POST   /api/billing/webhook              # webhook Stripe (raw body, no auth)

# Super Admin (requiere isSuperAdmin)
GET    /api/superadmin/stats
GET    /api/superadmin/billing                          # MRR, ARR, tabla de todos los workspaces
GET    /api/superadmin/payments                         # historial de pagos (Stripe invoices)
GET    /api/superadmin/ai-tokens                        # uso de tokens IA por workspace/mes
GET    /api/superadmin/workspaces
GET    /api/superadmin/workspaces/:id
PATCH  /api/superadmin/workspaces/:id/status
PATCH  /api/superadmin/workspaces/:id/token-limit       # body: { monthlyTokenLimit }
GET    /api/superadmin/users                            # ?search=&limit=&offset=&status=all|active|inactive|orphan
PATCH  /api/superadmin/users/:id/toggle-active          # body: { active } — toggle de TODAS las memberships
PATCH  /api/superadmin/users/:id/toggle-daily-insight   # body: { enabled } — toggle del insight diario IA en TODAS las memberships
GET    /api/superadmin/conversion-funnel                # ?days=30 — funnel signup→trial→paid + top eventos
POST   /api/events                                      # tracking de conversión, sin auth, allowlist de nombres
DELETE /api/workspaces/current/demo-project             # admin/owner: borrar proyecto "Demo — Aprendé BlissTracker"
GET    /api/superadmin/settings                         # catálogo + valores actuales de PlatformSetting
PUT    /api/superadmin/settings                         # body: { changes: { key: value, ... } } batch con validación
GET    /api/superadmin/settings/log                     # ?key=&limit= — audit log de cambios
GET    /api/superadmin/settings/cleanup-preview         # ?tables=notifications,emailLog — preview rows a borrar
POST   /api/superadmin/settings/cleanup-now             # body: { tables?: [] } — aplica cleanup inmediato con los retention actuales
POST   /api/superadmin/impersonate
GET    /api/superadmin/feedback
PUT    /api/superadmin/feedback/:id/read
GET    /api/superadmin/email-logs
GET    /api/superadmin/feature-flags
POST   /api/superadmin/feature-flags
PATCH  /api/superadmin/feature-flags/:id
DELETE /api/superadmin/feature-flags/:id
GET    /api/superadmin/legal/:key                       # editar documento legal
PUT    /api/superadmin/legal/:key                       # upsert documento legal
GET    /api/feature-flags/:key                          # check flag para workspace actual (autenticado)
```

### Frontend routes
```
/                 → Landing.jsx          (pública, sólo en dominio raíz blisstracker.app sin subdominio)
                  → Dashboard.jsx        (PrivateRoute, en subdominio de workspace)
/login            → Login2.jsx
/register         → Register.jsx         (crear workspace)
/pricing          → Pricing.jsx          (pública) — planes, calculadora interactiva, tabla comparativa de 25+ filas, FAQ específico de pricing
/join             → JoinWorkspace.jsx    (aceptar invitación, ?token=)
/forgot-password  → ForgotPassword.jsx
/reset-password   → ResetPassword.jsx
/condiciones      → TermsPage.jsx        (pública) — Términos de servicio
/privacidad       → TermsPage.jsx        (pública) — Política de privacidad
/my-reports       → MyReports.jsx        (PrivateRoute)
/my-projects      → MyProjects.jsx       (PrivateRoute)
/my-projects/:id  → ProjectDetail.jsx    (PrivateRoute)
/profile          → MyProfile.jsx        (PrivateRoute)
/preferences      → Preferences.jsx      (PrivateRoute)
/realtime         → RealTime.jsx         (PrivateRoute)
/docs             → Docs.jsx             (PrivateRoute)
/marketing        → Marketing.jsx        (PrivateRoute) — tabs: GEO, Web, SEO, Keywords, Canibalización, Instagram, TikTok, LinkedIn, Competidores, Meta Ads, Google Ads, Salud, Informes. Sub-tabs con `soon: true` (YouTube) muestran `ComingSoon` aunque el código exista.
/report/:token    → ReportPublic.jsx     (pública, sin auth) — informe mensual para clientes identificado por token UUID
/oauth            → OAuthPopup.jsx       (pública) — popup OAuth (Google/Meta/TikTok)
/auth             → AuthCallback.jsx     (pública) — callback de Google Sign-In
/oauth-result     → OAuthResult.jsx      (pública) — puente de callback OAuth: postMessage al opener y cierra popup
/billing          → Billing.jsx          (PrivateRoute) — visible para todos; acciones solo admin/owner
/reports             → Reports.jsx          (AdminRoute)
/admin               → Admin.jsx            (AdminRoute)  — ?tab= query param
/admin/productivity  → Productivity.jsx     (AdminRoute)
/admin/rrhh          → RRHH.jsx             (AdminRoute)
/admin/eos           → EOS.jsx              (AdminRoute)  — 7 tabs: Visión, Personas, Datos, Asuntos, Procesos, Tracción, Evaluación. Requiere feature flag `eos`.
/superadmin          → SuperAdmin.jsx        (SuperAdminRoute — requiere isSuperAdmin)
```

### Cron jobs (`backend/src/index.js`)

| Schedule | Timezone | Descripción |
|----------|----------|-------------|
| `1 0 * * 5` (viernes 00:01) | ART | Envía resúmenes semanales de IA por email a todos los miembros |
| `0 0 * * 6` (sábados 00:00) | ART | Actualiza perfil de memoria de insights por usuario |
| `0 1 1 * *` (1° mes 01:00) | ART | **Cadena mensual de snapshots** (`MONTHLY_CHAIN`, secuencial): GEO → GA4 → GSC+DomainRating → PageSpeed → keywords → Instagram → TikTok → LinkedIn → Ads → competidores → métricas RRHH. Todos del mes anterior. Cada job aislado en su try/catch; un fallo no corta la cadena. |
| `0 6 * * 1` (lunes 06:00) | ART | Actualiza rankings de keywords del mes actual (upsert semanal) |
| `0 8 * * 1` (lunes 08:00) | ART | Aviso semanal de Productividad por mail a admins/owners (solo si hay personas en alerta) |
| `0 3 * * *` (diario 03:00) | ART | Marca trials expirados como `past_due` |
| `0 0 * * *` (medianoche) | ART | Auto-pausa tareas `IN_PROGRESS` al cierre del día |
| `0 3 * * 0` (domingos 03:00) | ART | Limpia notificaciones antiguas (leídas >30d, no leídas >90d) |
| `*/15 * * * *` (cada 15 min) | — | Ejecuta eliminaciones de workspaces programadas vencidas |

Los jobs con lógica pesada usan in-memory locks (`let jobRunning = false`) para evitar solapamiento del mismo job consigo mismo. Los **11 jobs mensuales del día 1°** ya **no son crons sueltos**: corren en una **única cadena secuencial** (`MONTHLY_CHAIN`, un solo cron + un solo lock `monthlyChainRunning`), así que no se pisan entre sí (resuelve el problema de PageSpeed solapando a los siguientes).

> **⚠️ Deuda técnica — escalabilidad de crons (revisar a ~100 workspaces):** Hoy todos los crons corren en el **mismo proceso web**; la cadena mensual es secuencial (no se solapa), pero su **tiempo total es la suma** de todos los jobs y el procesamiento pesado (GEO con cheerio+Claude, scraping Apify) compite con el tráfico HTTP. **Fix definitivo (opción A, pendiente):** mover los crons a un **worker process** separado (segundo servicio en Railway) + **cola** (BullMQ/Redis) con concurrencia controlada y **backoff ante 429** de APIs externas (PageSpeed/SerpAPI/Apify/Anthropic). Palancas intermedias adicionales si hiciera falta antes: **repartir la cadena en varios días** del mes (hoy es un solo día por completitud del informe on-demand, que lee estos snapshots) y agregar backoff a los llamados externos.

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
      monthUtils.test.js                  # periodMonths, periodLabel (períodos calendario de objetivos)
      marketingObjectives.service.test.js # computeObjectives: flujo vs stock, posición invertida, orphaned, head-to-head competidor
      legajoCatalog.test.js               # resolve/sanitize de campos de legajo (builtins blindados, customs, completitud)
      lateNotification.test.js            # lateMinutes (regla de tardanza con tolerancia) + default template
      eosAutoScorecard.service.test.js    # métricas automáticas del Scorecard EOS: tardanzas (top 3 días/min, tolerancia), ocupación (ponderada, licencias, sin horario) + mensuales (delta_horas, proyectos nuevos/perdidos, equipo, mes vencido)
      linkedinScrape.test.js              # parseLinkedinCompany (URL/slug/showcase) + computeLinkedinScrapeMetrics (filtro por mes, totales, engagement rate por seguidores, campos null del scraping)
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
- **Backend:** Railway (auto-runs `npm run db:migrate` on deploy; seed must be run manually once). Required env vars: `DATABASE_URL`, `JWT_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM`, `APP_DOMAIN`, `GOOGLE_CLIENT_ID`, `ANTHROPIC_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID`, `GOOGLE_CLIENT_SECRET`, `ENCRYPTION_KEY`, `BACKEND_URL`, `PAGESPEED_API_KEY`, `META_APP_ID`, `META_APP_SECRET`, `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`, `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`, `APIFY_API_TOKEN` (opcional — habilita el scraping de RRSS).
- **Scripts de utilidad:** `backend/scripts/` — scripts de uso único para operaciones directas en DB (ej: `insert-meta-ads-token.js`, `create-test-user.js`). Ejecutar con `DATABASE_URL=... ENCRYPTION_KEY=... node scripts/<nombre>.js`.
- **Frontend:** Vercel Pro (root: `/frontend`; `vercel.json` rewrites: `/report/:token` → la función serverless `api/report-og.js` (Open Graph dinámico por informe), el resto → `index.html`). Add `*.blisstracker.app` as Custom Domain. Required env vars: `VITE_API_URL`, `VITE_GOOGLE_CLIENT_ID`. `VITE_API_URL` debe estar disponible también en **runtime de Functions** (no solo en build) porque `api/report-og.js` la usa para pegarle al backend — en Vercel las env vars aplican a Build + Functions salvo que se restrinja el scope; verificar que no esté limitada solo a Build.
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

**Redirect URIs registradas en LinkedIn Developer Portal:**
- `https://blisstrackersaas-production.up.railway.app/api/marketing/integrations/linkedin/callback`
- `http://localhost:3001/api/marketing/integrations/linkedin/callback`

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

**Permisos requeridos en LinkedIn App (Marketing Developer Platform / Community Management API):**
- Scopes: `r_organization_social` (leer posts y stats), `r_organization_admin` (listar páginas administradas). Sólo lectura — se requieren el producto **Community Management API** aprobado en la app.
- Access tokens duran 60 días (5184000 s); refresh tokens duran 365 días. `linkedinTokenRefresh.service.js` renueva silenciosamente con `expiresAt < now + 5min`. Si el refresh falla, la integración se marca como `status: 'expired'` y el frontend muestra prompt de reconexión (`code: TOKEN_EXPIRED`).
- API REST versionada en `https://api.linkedin.com/rest/*` con header `LinkedIn-Version: 202410` (actualizar trimestralmente) + `X-Restli-Protocol-Version: 2.0.0`.
- Auto-detección de Company Page: tras OAuth, el callback llama a `/v2/organizationalEntityAcls?q=roleAssignee&role=ADMINISTRATOR`. Si hay 1 sola org, se auto-asigna como `propertyId`; si hay >1, la integración se guarda sin `propertyId` y el frontend muestra un dropdown (`GET /projects/:id/linkedin/orgs`).
- Endpoints utilizados: `/rest/networkSizes/{urn}` (followers), `/rest/organizationPageStatistics` (page views, visitors), `/rest/organizationalEntityShareStatistics` (impressions, clicks, engagement agregado), `/rest/organizationalEntityFollowerStatistics` (demographics: industry, seniority, function, region), `/rest/posts` + batch stats (top posts del mes).

**Token expiry — patrón unificado:**
- Todos los servicios de integración detectan tokens expirados y marcan `ProjectIntegration.status = 'expired'`
- Los controllers devuelven `{ error: '...', code: 'TOKEN_EXPIRED' }` con status HTTP 400 (nunca 401 — evita logout del usuario)
- El frontend detecta `code === 'TOKEN_EXPIRED'` y muestra prompt de reconexión
- `connect-existing` solo reutiliza tokens con `status: 'active'` y `expiresAt > now` — si todos expiraron cae al flujo OAuth completo
- Google tokens: `invalid_grant` → status `expired`, requiere reconectar. App en modo Testing expira tokens a los 7 días — publicar la app en Google Cloud Console para tokens permanentes.
