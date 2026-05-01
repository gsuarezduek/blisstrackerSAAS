# BlissTracker SaaS

Task tracker multi-tenant para agencias. Cada cliente opera en su propio workspace en `cliente.blisstracker.app`.

- **App:** https://blisstracker.app
- **GitHub:** https://github.com/gsuarezduek/blisstrackerSAAS
- **Backend:** Railway · **Frontend:** Vercel Pro (wildcard `*.blisstracker.app`)

---

## Stack

| Capa | Tecnología |
|---|---|
| Backend | Node.js · Express · Prisma · PostgreSQL |
| Frontend | React 18 · Vite · Tailwind CSS · React Router v6 |
| Auth | JWT (12h) · Google OAuth 2 |
| AI | Claude Haiku (Anthropic) |
| Billing | Stripe (Checkout + Customer Portal + Webhooks) |
| Email | Resend (HTTP API — sin SMTP) |
| Tests | Jest + Supertest (backend) · Vitest + React Testing Library (frontend) |
| Deploy | Railway (backend + BD) · Vercel Pro (frontend, wildcard subdomain) |

---

## Desarrollo local

### Requisitos
- Node.js 18+
- PostgreSQL 14+

### 1. Backend

```bash
cd backend
cp .env.example .env   # completar variables (ver abajo)
npm install
npm run db:migrate:dev -- --name init
npm run db:seed        # crea workspace "bliss" + usuario admin
npm run dev            # puerto 3001
```

**Variables de entorno requeridas:**

```env
DATABASE_URL=postgresql://user:pass@localhost:5432/team_tracker
JWT_SECRET=<string largo y aleatorio>
RESEND_API_KEY=re_xxxxxxxxxxxx
EMAIL_FROM=BlissTracker <noreply@blisstracker.app>
APP_DOMAIN=blisstracker.app
FRONTEND_URL=http://localhost:5173
GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=<client secret del OAuth app de Google Cloud>
ANTHROPIC_API_KEY=sk-ant-...
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_ID=price_...
ENCRYPTION_KEY=<64 chars hex — AES-256-GCM para cifrar tokens OAuth en DB>
BACKEND_URL=http://localhost:3001
PAGESPEED_API_KEY=<API key de Google Cloud para PageSpeed Insights>
META_APP_ID=<Facebook App ID — Meta for Developers>
META_APP_SECRET=<Facebook App Secret>
TIKTOK_CLIENT_KEY=<TikTok App Key — TikTok for Developers>
TIKTOK_CLIENT_SECRET=<TikTok App Secret>
```

**Credenciales tras el seed:**
- Email: `admin@blissmkt.ar`
- Password: `admin123`
- Workspace: `bliss`

### 2. Frontend

```bash
cd frontend
npm install
npm run dev   # puerto 5173
```

```env
# frontend/.env.development
VITE_API_URL=http://localhost:3001
VITE_GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com
```

---

## Comandos útiles

```bash
# Backend
npm run dev                              # servidor con hot reload
npm run db:migrate:dev -- --name <name> # nueva migración
npm run db:migrate                       # aplicar migraciones (producción)
npm run db:seed                          # seed inicial
npx prisma studio                        # explorador visual de DB
npm test                                 # Jest

# Frontend
npm run dev        # dev server
npm run build      # build producción
npm run test:run   # Vitest
```

---

## Arquitectura multi-tenant

Cada request al API incluye el header `X-Workspace: <slug>`. El middleware `resolveWorkspace` resuelve el slug a un `Workspace` en la DB e inyecta `req.workspace`. Los datos de cada workspace están aislados por `workspaceId` en todas las tablas relevantes.

```
cliente.blisstracker.app
  → frontend extrae slug → envía X-Workspace: cliente
  → backend resolveWorkspace → req.workspace = { id, name, slug, ... }
  → controllers filtran por req.workspace.id
```

El JWT incluye `{ userId, workspaceId, role, teamRole }`. Al cambiar de workspace se re-emite un nuevo JWT para ese contexto.

**Roles en workspace** (`WorkspaceMember.role`):
| Rol | Permisos |
|-----|----------|
| `owner` | Puede eliminar el workspace, todo lo de admin |
| `admin` | Gestión de equipo, proyectos, configuración |
| `member` | Acceso a sus proyectos y tareas |

---

## Gestión del equipo

Los miembros se incorporan exclusivamente por **invitación por email**. El admin envía la invitación desde **Admin → Equipo** y el invitado recibe un link con token de 7 días.

- Si el invitado ya tiene cuenta en BlissTracker (en otro workspace), acepta y se incorpora directamente.
- Si es nuevo, completa nombre y contraseña al aceptar.

Los admins pueden editar el **rol de equipo** (DESIGNER, CM, etc.) y los **permisos** (miembro/admin) de cada persona. Nunca se gestiona la contraseña desde el panel de admin.

---

## Registro de workspace

Nuevo workspace desde `https://blisstracker.app/register`:
1. Nombre del workspace + slug (subdominio)
2. Datos del owner (nombre, email, contraseña)
3. Se crea workspace en trial de 14 días
4. El owner queda con rol `owner`
5. Se crea un Stripe Customer de forma asíncrona (no bloquea el registro)

---

## Facturación (Billing)

- **Trial:** 14 días gratuitos con acceso completo. Cron diario a las 03:00 ART marca como `past_due` los trials vencidos.
- **Upgrade:** admin/owner ve botón "Suscribirse ahora" en `/billing`. Redirige a Stripe Checkout. Al completar, webhook actualiza `status → active`.
- **Gestión:** link "Gestionar suscripción" abre el Customer Portal de Stripe (facturas, método de pago, cancelación).
- **Banner:** `TrialBanner` aparece en el navbar cuando quedan ≤ 7 días de trial o hay un pago pendiente.
- **`bliss` workspace:** exento de billing, siempre `status = active`. No pasa por Stripe.
- **Webhook URL:** `https://<railway-url>/api/billing/webhook`

---

## Estructura del proyecto

```
team-tracker/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma        # Modelos de base de datos
│   │   ├── migrations/          # Historial de migraciones SQL
│   │   └── seed.js              # Workspace "bliss" + usuario admin + roles
│   └── src/
│       ├── app.js               # Express app (sin listen)
│       ├── index.js             # Punto de entrada: listen + crons
│       ├── middleware/
│       │   ├── auth.js          # JWT auth
│       │   └── workspace.js     # resolveWorkspace + workspaceAdminOnly
│       ├── config/
│       │   └── featureFlags.js          # Catálogo de flags — agregar aquí, se auto-crean en DB
│       ├── controllers/
│       │   ├── auth.controller.js
│       │   ├── workspace.controller.js  # CRUD workspace, invitaciones, eliminación
│       │   ├── workdays.controller.js
│       │   ├── tasks.controller.js
│       │   ├── projects.controller.js
│       │   ├── profile.controller.js
│       │   ├── insights.controller.js
│       │   ├── roleExpectations.controller.js
│       │   ├── reports.controller.js
│       │   ├── realtime.controller.js
│       │   ├── notifications.controller.js
│       │   ├── roles.controller.js
│       │   ├── billing.controller.js    # getStatus, createCheckout, createPortal
│       │   ├── geo.controller.js        # runAudit, listAudits, getAudit
│       │   └── superadmin.controller.js  # stats, workspaces, billing overview, email logs
│       ├── routes/
│       │   ├── workspace.routes.js
│       │   ├── billing.routes.js
│       │   ├── marketing.routes.js
│       │   ├── superadmin.routes.js
│       │   └── ...
│       ├── webhooks/
│       │   └── stripe.webhook.js        # maneja eventos Stripe (raw body)
│       ├── scripts/
│       │   ├── create-test-user.js         # Crea usuario de prueba para verificación Google OAuth
│       │   └── insert-meta-ads-token.js    # Inserta System User Token de Meta Ads en DB
│       └── services/
│           ├── email.service.js               # Resend + log a EmailLog
│           ├── weeklyReport.service.js        # Cron viernes 14:00 ART
│           ├── insightMemory.service.js       # Cron sábado 00:00 ART
│           ├── geoAudit.service.js            # Fetch + cheerio + Claude → GeoAudit
│           ├── tokenRefresh.service.js        # Refresca access tokens de Google OAuth
│           ├── instagram.service.js           # API calls a graph.instagram.com
│           ├── instagramSnapshot.service.js   # Snapshots mensuales de Instagram
│           ├── metaTokenRefresh.service.js    # Extiende long-lived tokens de Meta
│           ├── tiktok.service.js              # API calls a TikTok v2 (PKCE, 4 scopes)
│           ├── tiktokTokenRefresh.service.js  # Refresca access tokens de TikTok v2
│           └── tiktokSnapshot.service.js      # Snapshots mensuales de TikTok
└── frontend/
    └── src/
        ├── context/
        │   ├── AuthContext.jsx      # user, login, logout, switchWorkspace
        │   ├── WorkspaceContext.jsx # workspace actual + trialDaysLeft + isSubscriptionActive
        │   └── ThemeContext.jsx
        ├── hooks/
        │   └── useFeatureFlag.js    # hook con cache en memoria por sesión
        ├── pages/
        │   ├── Login2.jsx
        │   ├── Register.jsx         # Crear nuevo workspace
        │   ├── Join.jsx             # Aceptar invitación
        │   ├── Dashboard.jsx
        │   ├── MyProjects.jsx
        │   ├── ProjectDetail.jsx    # Tab "Info" con websiteUrl + redes sociales
        │   ├── MyReports.jsx
        │   ├── RealTime.jsx
        │   ├── Marketing.jsx        # Tabs GEO, Web (GA4+PageSpeed) y RRSS (Instagram, TikTok, Meta Ads)
        │   ├── OAuthResult.jsx      # Puente OAuth: postMessage al opener y cierra popup
        │   ├── Billing.jsx          # Estado trial/plan, upgrade, portal Stripe
        │   ├── Reports.jsx          # Admin
        │   ├── Admin.jsx            # Panel admin (deep link ?tab=)
        │   ├── Productivity.jsx     # Admin
        │   ├── RRHH.jsx             # Admin — Recursos Humanos
        │   ├── MyProfile.jsx
        │   ├── Preferences.jsx
        │   ├── Docs.jsx
        │   └── SuperAdmin.jsx       # Panel interno (solo isSuperAdmin)
        ├── components/
        │   ├── Navbar.jsx           # Nav items con fuente única (links/adminSublinks/profileSections)
        │   ├── TrialBanner.jsx      # Banner trial ≤7d o past_due
        │   ├── ProjectInfoTab.jsx   # websiteUrl + conexiones sociales + botones de conexión OAuth
        │   ├── marketing/
        │   │   ├── GeoTab.jsx       # Selector proyecto, audit panel, score, items, historial
        │   │   ├── WebTab.jsx       # GA4 dashboard + snapshots IA + PageSpeed Insights
        │   │   ├── InstagramTab.jsx # Métricas Instagram + snapshots + gráficos evolución
        │   │   ├── TikTokTab.jsx    # Métricas TikTok + snapshots + estado de verificación
        │   │   ├── MetaAdsTab.jsx   # Métricas Meta Ads + desglose por campaña
        │   │   └── InformesTab.jsx  # GA4 overview + canales + top páginas
        │   ├── admin/
        │   │   ├── TeamTab.jsx      # Solo invitaciones por email
        │   │   └── ...
        │   └── ...
        └── api/client.js            # Axios: inyecta JWT + X-Workspace header
```

---

## Modelos de base de datos

| Modelo | Descripción |
|--------|-------------|
| `Workspace` | Tenant: slug, timezone, status (trialing/active/past_due/suspended/cancelled), stripeCustomerId |
| `WorkspaceMember` | Membresía usuario↔workspace: role (owner/admin/member), teamRole, preferencias IA |
| `Subscription` | Plan y facturación por workspace: stripeSubId, seats, periodStart/End |
| `User` | Cuenta global: email único, datos personales, avatar |
| `UserRole` | Roles de equipo por workspace (ej: DESIGNER, CM) |
| `WorkspaceInvitation` | Invitaciones por email con token de 7 días |
| `WorkspaceDeletionRequest` | Solicitud de eliminación con 48h de gracia |
| `FeatureFlag` | Flags de funcionalidad: enabledGlobally o por lista de workspaceIds |
| `WorkDay` | Jornada laboral por usuario/workspace/día |
| `Task` | Tarea con estado, starred, backlog, sesiones de tiempo |
| `TaskSession` | Sesiones de cronómetro por tarea |
| `TaskComment` | Comentarios con @menciones |
| `Project` | Proyectos/clientes: websiteUrl (GEO), connections (JSON redes sociales) |
| `ProjectLink` | Links útiles por proyecto (Drive, Figma, etc.) |
| `GeoAudit` | Análisis GEO por proyecto: score, 6 componentes, items, señales negativas |
| `ProjectIntegration` | Tokens OAuth por proyecto (GA4, Instagram, TikTok, Meta Ads): cifrados con AES-256-GCM |
| `AnalyticsSnapshot` | Resumen mensual de GA4 por proyecto: sesiones, usuarios, páginas, canales |
| `AnalyticsInsight` | Análisis IA mensual generado con Claude Haiku (deltas, tendencias, recomendaciones) |
| `PageSpeedResult` | Resultados de PageSpeed Insights API: score, métricas CWV, oportunidades, diagnósticos |
| `InstagramSnapshot` | Snapshot mensual de métricas Instagram: seguidores, engagement, likes promedio |
| `TikTokSnapshot` | Snapshot mensual de métricas TikTok: seguidores, likes, videos, engagement |
| `TikTokFollowerLog` | Log diario de seguidores TikTok para gráficos de evolución |
| `Service` | Servicios que ofrece la agencia (únicos por workspace) |
| `Notification` | Notificaciones tipadas (5 tipos) |
| `DailyInsight` | Coaching IA diario cacheado por usuario |
| `UserInsightMemory` | Perfil de productividad acumulado semanalmente |
| `RoleExpectation` | Expectativas de rol para el coaching IA |
| `AiTokenLog` | Registro de uso de tokens de IA por workspace |
| `EmailLog` | Log de todos los emails enviados (tipo, estado, workspace) |
| `UserLogin` | Historial de logins (método, timestamp) |
| `Feedback` | Sugerencias y bugs enviados por usuarios |
| `PasswordResetToken` | Tokens de un solo uso para reset de contraseña |

---

## Navegación

### Menú de navegación — fuente única

Los arrays `links`, `adminSublinks` y `profileSections` en `Navbar.jsx` son la fuente única de verdad para los ítems del navbar. Cualquier cambio ahí aplica automáticamente en **desktop** (dropdown) y **mobile** (panel hamburguesa). No hay listas duplicadas.

### Usuario común
| Pantalla | Ruta |
|----------|------|
| Dashboard | `/` |
| Mis Proyectos | `/my-projects` |
| Detalle de proyecto | `/my-projects/:id` |
| Mis Reportes | `/my-reports` |
| Actividad | `/realtime` |
| Marketing (GEO) | `/marketing` — requiere feature flag `marketing` |
| Perfil | `/profile` |
| Preferencias | `/preferences` |
| Facturación | `/billing` |
| Docs | `/docs` |

### Administrador (más)
| Pantalla | Ruta |
|----------|------|
| Reportes | `/reports` |
| Panel Admin | `/admin?tab=` |
| Productividad | `/admin/productivity` |
| RRHH | `/admin/rrhh` |

### Super Admin interno (solo `isSuperAdmin`)
| Pantalla | Ruta |
|----------|------|
| Panel Super Admin | `/superadmin` |

El panel super admin tiene sidebar con: Dashboard (stats + workspaces), **Billing** (MRR/ARR + tabla de suscripciones), Feedback, Emails, Announcements, Avatares, Feature Flags.

---

## Deploy en producción

### Backend (Railway)

1. Variables de entorno en Railway: `DATABASE_URL`, `JWT_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM`, `APP_DOMAIN`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `ANTHROPIC_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID`, `ENCRYPTION_KEY`, `BACKEND_URL`, `PAGESPEED_API_KEY`, `META_APP_ID`, `META_APP_SECRET`, `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`
2. Railway ejecuta `npm run db:migrate` automáticamente al deployar
3. Seed manual una vez desde Railway Shell

### Frontend (Vercel Pro)

1. Root: `/frontend`
2. Agregar `*.blisstracker.app` como Custom Domain (requiere Vercel Pro para wildcard)
3. Variables: `VITE_API_URL`, `VITE_GOOGLE_CLIENT_ID`
4. `vercel.json` ya incluye rewrites para SPA routing

### DNS (Cloudflare)
- `A blisstracker.app → Vercel`
- `A *.blisstracker.app → Vercel` (wildcard)

---

## Marketing — GEO Audit

El módulo GEO (Generative Engine Optimization) analiza qué tan bien posicionado está el sitio de un proyecto para aparecer en respuestas de ChatGPT, Perplexity, Claude y Google AI Overviews.

- **Configuración:** el owner/admin carga la URL del sitio en la pestaña **Info** del proyecto.
- **Análisis:** backend hace fetch del sitio con axios + cheerio, verifica robots.txt (23 crawlers: citation, training y broad), llms.txt, JSON-LD schema, luego llama a Claude para scoring.
- **Score:** 0–100 con 4 bandas (Crítico 0–35 / Base 36–67 / Bueno 68–85 / Excelente 86–100).
- **6 componentes:** Citabilidad IA, Autoridad de Marca, E-E-A-T, Técnico, Schema, Plataformas IA.
- **Items unificados:** lista de hallazgos + señales negativas con severidad/prioridad.
- **Crear tarea:** desde cualquier item se puede crear una tarea en el proyecto con prefijo "GEO - ".
- **Feature flag:** requiere `marketing` activado en SuperAdmin → Feature Flags.

---

## Marketing — RRSS (Instagram · TikTok · Meta Ads)

Tab **RRSS** en Marketing: conecta redes sociales y muestra métricas de audiencia y engagement.

### Instagram

- **Conexión OAuth:** usa Instagram Business Login (`instagram.com/oauth/authorize`) con scope `instagram_business_basic`.
- **Token exchange:** short-lived → long-lived (60 días) vía `api.instagram.com/oauth/access_token` + `graph.instagram.com/access_token`.
- **Métricas en tiempo real:** seguidores, engagement rate, likes promedio, comentarios promedio, posts por semana (media últimas 4 semanas), últimas publicaciones.
- **Snapshots mensuales:** cron automático cada 1° del mes a las 04:30 ART guarda snapshot histórico.
- **Gráficos SVG:** evolución de seguidores y engagement por mes.
- **Token expirado:** cuando el token expira (>60 días sin renovar), se muestra estado "Sesión expirada" con botón para reconectar.

### TikTok

- **Conexión OAuth v2 PKCE:** `code_verifier` generado en backend, almacenado en state JWT; `code_challenge = base64url(sha256(verifier))`.
- **Scopes:** `user.info.basic`, `user.info.profile`, `user.info.stats`, `video.list`.
- **Métricas en tiempo real:** seguidores, likes totales, engagement rate, videos totales, últimos 20 videos.
- **Arquitectura resiliente:** cada scope hace su propio call en try/catch — si un scope no está aprobado, solo esos campos retornan `null` sin romper toda la integración.
- **Snapshots mensuales:** cron automático cada 1° del mes a las 05:00 ART.
- **Estado de verificación:** badge con estado de la app (en revisión, activa) si aplica.

### Meta Ads

- **Conexión OAuth:** scope `ads_read` vía `facebook.com/dialog/oauth`. Requiere Business Verification de Meta para uso en producción.
- **Workaround System User Token:** mientras Business Verification está pendiente, insertar token permanente generado desde Business Manager → System Users → Generate Token (Never expiry) usando el script `backend/scripts/insert-meta-ads-token.js`.
- **Métricas:** gasto total, impresiones, clics, CTR, CPC, CPM por período (7/30/90 días).
- **Desglose por campaña:** tabla de campañas activas con métricas individuales.
- **Nota:** `ads_read` requiere aprobación del Developer Token de Google Ads y Business Verification antes de funcionar en producción con OAuth estándar.

### Patrón común de expiración de tokens

Todas las integraciones siguen el mismo patrón:
- Token expirado o inválido → backend retorna HTTP **400** con `{ code: 'TOKEN_EXPIRED' }` (nunca 401 — evita cerrar sesión del usuario).
- La integración se marca como `status: 'expired'` en DB.
- El frontend muestra estado "Sesión expirada" con botón para reconectar.

---

## Marketing — Web (GA4 + PageSpeed)

Tab **Web** en Marketing: conecta Google Analytics 4 y muestra métricas de performance del sitio.

### Google Analytics 4

- **Conexión OAuth:** botón "Conectar GA4" en ProjectInfoTab abre un popup OAuth. El token se cifra con AES-256-GCM y se guarda en `ProjectIntegration`.
- **Dashboard:** sesiones, usuarios activos, nuevos usuarios, pageviews, bounce rate, duración promedio. Rangos: este mes, mes anterior, últimos 90 días, o rango personalizado.
- **Top páginas:** las 10 páginas más visitadas con pageviews y usuarios.
- **Canales:** desglose de tráfico por canal (Organic, Direct, Social, etc.).
- **Snapshots IA:** botón "Guardar snapshot" persiste el resumen mensual en DB; "Analizar con IA" genera análisis con Claude Haiku mostrando deltas vs mes anterior, tendencias y recomendaciones accionables.
- **Crear tarea:** desde cada recomendación de IA se puede crear una tarea con prefijo "Analytics - ".
- **Cron automático:** cada 1° del mes a las 02:00 ART se guarda el snapshot del mes anterior para todos los proyectos con GA4 conectado.

### PageSpeed Insights

- **Análisis manual:** botón "Analizar" en la sección Performance corre PageSpeed Insights API (mobile/desktop).
- **Score:** 0–100 con colores (verde ≥ 90, naranja ≥ 50, rojo < 50).
- **Core Web Vitals:** LCP, FCP, TBT, CLS, Speed Index, TTFB con valores y rating por métrica.
- **Oportunidades:** mejoras estimadas con ahorro en ms (p.ej. eliminar JS no usado).
- **Diagnósticos:** audits fallidos adicionales que afectan la performance.
- **Crear tarea:** desde cualquier oportunidad o diagnóstico se puede crear una tarea con prefijo "Perf - ".
- **Historial:** badges con el score de los últimos N análisis.
- **Cron automático:** cada 1° del mes a las 03:30 ART corre análisis mobile + desktop para todos los proyectos con websiteUrl.

---

## Scripts de utilidad

Scripts en `backend/scripts/`:

| Script | Uso |
|--------|-----|
| `create-test-user.js` | Crea/actualiza usuario `admin@blissmkt.ar` en workspace `monethx10` para verificación de Google OAuth |
| `insert-meta-ads-token.js` | Inserta un System User Token de Meta Ads directo en DB (workaround Business Verification pendiente) |

```bash
# Crear usuario de prueba (requiere DATABASE_URL de producción)
DATABASE_URL="postgresql://..." node scripts/create-test-user.js

# Insertar token Meta Ads
DATABASE_URL="..." ENCRYPTION_KEY="..." SYSTEM_TOKEN="EAF..." AD_ACCOUNT_ID="act_..." PROJECT_ID=62 \
  node scripts/insert-meta-ads-token.js
```

---

## Sistema de IA

### Insight diario
Generado por Claude Haiku al abrir el Dashboard. Cacheado una vez por día. Incluye: estado real de las tareas, memoria de productividad histórica, expectativas del rol y análisis GTD. El usuario puede refrescarlo (cooldown 1h) y dar feedback 👍/👎.

### Memoria de productividad
Generada cada sábado 00:00 ART. Analiza las últimas 4 semanas: tendencias, fortalezas, áreas de atención, estadísticas. Se inyecta en el prompt del insight diario y el resumen semanal.

### Resumen semanal por email
Enviado cada viernes 14:00 ART. Incluye análisis de la semana, patrones, recomendaciones y tareas de rol omitidas. Puede dispararse manualmente desde Preferencias.

---

## Email logging

Todos los emails enviados quedan registrados en `EmailLog` con: workspace, destinatario, asunto, tipo y estado (enviado/fallido). Visibles en el panel Super Admin → sección Emails.

Tipos de email: `passwordReset` · `welcome` · `weeklySummary` · `testSettings` · `invitation` · `deletionWarning`

---

## Fotos de perfil

15 avatares disponibles en `frontend/public/perfiles/`. Avatar por defecto: `2bee.png`. Validados en backend contra lista `ALLOWED_AVATARS`. Clickear en cualquier avatar abre un lightbox fullscreen.

Avatares: `2bee.png`, `bee.png`, `bee2.png`, `babee.png`, `beeartist.png`, `beecoffee.png`, `beecorp.png`, `beecypher.png`, `beefitness.png`, `beegamer.png`, `beehacker.png`, `beeloween.png`, `beenfluencer.png`, `beepunk.png`, `beezen.png`, `beezombie.png`

---

## Documentación técnica detallada

Ver [CLAUDE.md](./CLAUDE.md) — referencia completa de arquitectura, modelos, rutas API y convenciones para desarrollo con Claude Code.
