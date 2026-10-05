# Backend — BlissTracker

Convenciones específicas del backend (Express + Prisma + PostgreSQL). Se carga automáticamente cuando Claude Code trabaja dentro de `backend/`. Los conceptos de dominio (Ventas, Marketing, WhatsApp, etc.) están en `../docs/claude/` — este archivo es solo arquitectura e infraestructura backend. Ver también `../CLAUDE.md` (raíz) para el proyecto en general.

## Environment variables (`backend/.env`)
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
OPENAI_API_KEY=sk-...                  # (opcional, prototipo) habilita Whisper para "Resumen automático (prueba)" en Reuniones del proyecto. Sin ella, POST .../meetings/:mid/transcribe-test devuelve 503
STRIPE_SECRET_KEY=sk_live_...          # o sk_test_... en desarrollo
STRIPE_WEBHOOK_SECRET=whsec_...        # secret del webhook en Stripe Dashboard
STRIPE_PRICE_ID=price_...             # ID del precio por seat/mes en Stripe
ENCRYPTION_KEY=<64 chars hex>         # AES-256-GCM key para cifrar tokens OAuth en DB (node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
BACKEND_URL=https://blisstrackersaas-production.up.railway.app  # URL pública del backend (para construir redirect URI de OAuth)
PAGESPEED_API_KEY=...                 # Google Cloud API Key con acceso a PageSpeed Insights API
SERP_API_KEY=...                      # SerpAPI key (serpapi.com) — SERP snapshots, features y competidores
GIPHY_API_KEY=...                     # (opcional) API key gratuita de Giphy (developers.giphy.com) — habilita el envío de GIFs en el Chat interno. Sin ella, GET /api/chat/gifs/search y /trending devuelven 503 GIFS_NOT_CONFIGURED; el resto del chat funciona igual
META_APP_ID=...                       # Facebook App ID (Meta for Developers)
META_APP_SECRET=...                   # Facebook App Secret
TIKTOK_CLIENT_KEY=...                 # TikTok App Client Key (TikTok for Developers)
TIKTOK_CLIENT_SECRET=...              # TikTok App Client Secret
LINKEDIN_CLIENT_ID=...                # LinkedIn App Client ID (developer.linkedin.com)
LINKEDIN_CLIENT_SECRET=...            # LinkedIn App Client Secret
LINKEDIN_API_VERSION=...              # (opcional) versión de la API REST de LinkedIn (YYYYMM). Default 202601. LinkedIn soporta cada versión ~12 meses; actualizá si la API rechaza la versión
LINKEDIN_SCOPES=...                   # (opcional) scopes OAuth separados por espacio. Default "r_organization_social r_organization_admin". Cambialo si la pestaña Auth de tu app lista otros nombres exactos (ej. rw_organization_admin)
APIFY_API_TOKEN=apify_api_...         # Token de Apify (apify.com) para scraping de RRSS. Sin esto, el scraping devuelve SCRAPE_NOT_CONFIGURED
APIFY_API_TOKEN2=apify_api_...        # (opcional) token de respaldo, misma cuenta u otra cuenta de Apify. Si APIFY_API_TOKEN falla (HTTP error o dataset sin crédito), se reintenta con este antes de fallar
APIFY_API_TOKEN3=apify_api_...        # (opcional) 2° token de respaldo, mismo mecanismo, probado después de APIFY_API_TOKEN2
APIFY_API_TOKEN4=apify_api_...        # (opcional) 3° token de respaldo, mismo mecanismo, probado después de APIFY_API_TOKEN3
APIFY_INSTAGRAM_ACTOR=...             # (opcional) actor de Apify para Instagram. FALLBACK del PlatformSetting `apifyInstagramActor` (editable desde SuperAdmin → Configuración, que tiene prioridad). Si ambos vacíos → default oficial apify~instagram-profile-scraper
APIFY_INSTAGRAM_POSTS_LIMIT=60        # (opcional) posts recientes a traer por scrape. FALLBACK del PlatformSetting `apifyInstagramPostsLimit` (>0 tiene prioridad). Default 60 — debe cubrir el mes completo; subir para cuentas muy activas
APIFY_INSTAGRAM_POSTS_ACTOR=...       # (opcional) actor de la 2ª llamada de Instagram (lista completa de posts). FALLBACK del PlatformSetting `apifyInstagramPostsActor` (que tiene prioridad). El actor de perfil (apify~instagram-profile-scraper) trae un `latestPosts` capado (~12) y desordenado → en cuentas activas se pierden posts del mes; con este actor se hace una 2ª llamada que trae la lista completa y ordenada y se fusiona con la del perfil (dedup por id). Vacío en ambos = no hay 2ª llamada (comportamiento anterior). Recomendado `apify~instagram-post-scraper`. Costo Apify ~2x por scrape de IG (incluye competidores). "none"/"off" = desactivar explícito
APIFY_LINKEDIN_ACTOR=...             # actor de Apify para Company Pages de LinkedIn. FALLBACK del PlatformSetting `apifyLinkedinActor` (editable desde SuperAdmin → Configuración, que tiene prioridad). Sin el setting NI la env → SCRAPE_NOT_CONFIGURED. El normalizador tolera varios shapes de actor; si tu actor usa otras claves de input/output, el punto único de ajuste es runApifyLinkedin/normalizeApifyCompany en socialScrape.service.js
APIFY_LINKEDIN_POSTS_LIMIT=30        # (opcional) posts recientes a traer por scrape de LinkedIn. FALLBACK del PlatformSetting `apifyLinkedinPostsLimit` (>0 tiene prioridad). Default 30 — las empresas postean menos que IG
APIFY_FACEBOOK_ACTOR=...             # actor de Apify para Páginas de Facebook. FALLBACK del PlatformSetting `apifyFacebookActor` (editable desde SuperAdmin → Configuración, que tiene prioridad). Sin el setting NI la env → SCRAPE_NOT_CONFIGURED. El punto único de ajuste de claves de input/output es runApifyFacebook/normalizeApifyFacebook en socialScrape.service.js
APIFY_FACEBOOK_POSTS_LIMIT=30        # (opcional) posts recientes a traer por scrape de Facebook. FALLBACK del PlatformSetting `apifyFacebookPostsLimit` (>0 tiene prioridad). Default 30
R2_ACCOUNT_ID=...                    # (opcional) Cloudflare R2: account id (subdominio del endpoint S3). Las 5 R2_* habilitan object storage para SocialImage; sin ellas, las imágenes se guardan como bytes en la DB (modo legacy). Ver concepto "Object storage de imágenes sociales (Cloudflare R2)"
R2_ACCESS_KEY_ID=...                 # (opcional) credencial S3 del bucket (R2 API Token)
R2_SECRET_ACCESS_KEY=...             # (opcional) secret de la credencial S3
R2_BUCKET=...                        # (opcional) nombre del bucket
R2_PUBLIC_BASE=https://cdn.blisstracker.app  # (opcional) URL pública base del bucket SIN slash final (dominio propio recomendado, o el dominio r2.dev del bucket)
PDF_RENDER_BASE_URL=...                # (opcional) URL base de la SPA que abre Chromium para generar el PDF del informe. Default: https://<slug>.<APP_DOMAIN> en producción, FRONTEND_URL en desarrollo
CHROME_PATH=...                       # (opcional, desarrollo) ruta al Chrome local para el PDF del informe. Default: Google Chrome de macOS/Windows; en Linux se usa el binario de @sparticuz/chromium
```

## Arquitectura backend

### Backend (`backend/src/`)
- **Express + Prisma + PostgreSQL.** Entry point `index.js` imports the Express app from `app.js`. Routes are mounted under `/api/<resource>`.
- **Auth:** JWT (12h expiry) stored in `localStorage`. Google OAuth 2 via `google-auth-library`. The `auth` middleware attaches `req.user` (decoded JWT payload).
- **Workspace middleware** (`middleware/workspace.js`):
  - `resolveWorkspace` — reads `X-Workspace` header → looks up `Workspace` → attaches `req.workspace` + `req.workspaceMember`. Requires an active `WorkspaceMember` row for **every** user, `isSuperAdmin` included — a super admin who isn't a member of a workspace gets 403 here, same as anyone else.
  - `workspaceAdminOnly` — verifies `req.workspaceMember.role === 'admin' | 'owner'`.
- **Super admin** — `User.isSuperAdmin Boolean` is a global flag. The `superAdminOnly` middleware in `superadmin.routes.js` gates the internal panel (`/api/superadmin/*`), completely separate from `resolveWorkspace`/`workspaceAdminOnly`. **`isSuperAdmin` never elevates a user's permissions *within* a workspace** — `workspaceAdminOnly`, `isSalesUser`/`salesGuard` (role part), `projectAccess.isAdmin`, `GET /auth/me`'s `isAdmin`, chat moderation, and lead-note deletion all key off the real `WorkspaceMember.role`, not `isSuperAdmin`. A super admin who happens to be a plain `member` of a workspace is treated as a plain member there — same as any other user. To act with elevated access in a workspace they don't belong to (or belong to with a lower role), staff must use **Impersonar** from the Super Admin panel (`POST /api/superadmin/impersonate`), which issues a token carrying the *target* member's real role and `isSuperAdmin: false`. The only remaining `isSuperAdmin` bypasses are orthogonal to workspace role: billing-status write locks (`past_due`/`suspended`, `resolveWorkspace`) and feature-flag gating (`requireFeatureFlag`, the flag-check inside `salesGuard`) — both let staff preview/operate a module regardless of billing or flag grants, but only once they've already cleared the (now un-bypassed) membership and role checks.
- **Tests:** Jest + Supertest. `jest.config.js` at backend root. All tests in `backend/tests/`. Prisma is mocked with `jest.mock('../lib/prisma')` — no real DB needed.
- All dates for workday logic use `America/Argentina/Buenos_Aires` (UTC-3). Task timestamps are stored in UTC.
- **Email** is sent via Resend HTTP API (`src/services/email.service.js`) — not SMTP. Every send (success or failure) is logged to `EmailLog`. Each email function accepts an optional `workspaceId` as last parameter for the log.
- **Prisma singleton** at `src/lib/prisma.js` — all controllers import from here.
- **Stripe singleton** at `src/lib/stripe.js` — returns `null` if `STRIPE_SECRET_KEY` is missing; all billing code checks for null before calling Stripe.
- **Prisma error helper** at `src/lib/prismaError.js` — `handlePrismaError(err, res)` maps P2025→404, P2002→409, P2003→400.
- **Shared utilities:** `src/utils/dates.js` exports `todayString()` (Buenos Aires timezone). `src/lib/monthUtils.js` exports helpers de meses (`monthBounds`, `prevMonthStr`, `prevMonthsArr`, `monthLabel`, y `periodMonths`/`periodLabel` para períodos calendario de objetivos). `src/lib/objectiveCatalog.js` es el catálogo único de métricas de objetivos (categoría, unit, direction, aggregation flow/stock, param requerido).
- **Shared task include:** `tasks.controller.js` and `workdays.controller.js` each define a `taskInclude` constant (`{ project, createdBy, _count: { comments }, sessions, contentPiece: { select: { id } } }`) used in all task queries. `contentPiece` is only non-null for tasks created via Contenido's "Enviar al dashboard" — `TaskCard.jsx` uses it to render a 📅 "Contenido" badge linking to `/contenido?projectId=&piece=` (same URL shape as the `CONTENT_MENTION`/`CONTENT_APPROVED` deep-links in `NotificationBell.jsx`), so working the task and jumping straight to the piece doesn't require navigating Contenido → project → piece manually.
- **Weekly AI report** at `src/services/weeklyReport.service.js` — generates productivity analysis with Claude Haiku, sent every Friday at 14:00 ART via `node-cron`. Sequential processing with 3s delay between users.
- **Insight memory** at `src/services/insightMemory.service.js` — weekly learning profile per user (tendencias, fortalezas, areasDeAtencion, estadisticas) using Claude Haiku. Updated every Saturday at 00:00 ART.
- **GEO audit** at `src/services/geoAudit.service.js` — fetches URL with axios + cheerio, analyzes with Claude (claude-haiku), stores result in `GeoAudit`. Async: controller returns auditId immediately, analysis runs via `setImmediate`. Progress tracked via `errorMsg` field during `running` status. Score 0–100 with 4 bands (Crítico/Base/Bueno/Excelente). Checks 23 AI crawlers (citation vs training), llms.txt, robots.txt, JSON-LD schema.
- **Feature flag catalog** at `src/config/featureFlags.js` — array of `{ key, name, description }`. On server start, all flags are upserted to DB automatically. Never create flags manually from SuperAdmin UI — define them in code. Flags actuales: `marketing` (sección Marketing), `eos` (Sistema EOS), `gamification` (juegos/desafíos), `ventas` (CRM comercial), `contenido` (calendario de contenido con aprobación del cliente — ver concepto "Contenido"), `whatsapp` (conexión de WhatsApp para Ventas) y `rrhh` (panel de RRHH — Legajos/Ingresos/Licencias/Vacaciones/Beneficios/Productividad; sembrado con `enabledGlobally:true` en su migración porque ya lo usaban todos los workspaces sin flag, ver concepto "RRHH panel").
- **Token budget** at `src/lib/tokenBudget.js` — presupuesto mensual de tokens de IA por workspace. `Workspace.monthlyTokenLimit` (default `1000000`, `0` = ilimitado). Funciones:
  - `getTokenBudget(workspaceId)` → `{ used, limit, pct, exceeded, status }` (status: `ok` | `warning` ≥90% | `critical` ≥95% | `exceeded`).
  - `assertTokenBudget(workspaceId)` — lanza `err.status = 429` + `code: TOKEN_BUDGET_EXCEEDED` si superado. Llamar antes de toda invocación a Claude.
  - `hasTokenBudget(workspaceId)` — versión booleana para crons (no lanza).
  - Se acumula vía `AiTokenLog` (inputTokens + outputTokens) en el mes calendario actual. Configurable por workspace desde SuperAdmin (`PATCH /api/superadmin/workspaces/:id/token-limit`).

- **Servicios de Marketing** (SerpAPI, Cannibalization, Social scrape de RRSS, Competitor snapshot, Marketing objectives engine) — ver `../docs/claude/marketing.md`.
