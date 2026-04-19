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
ANTHROPIC_API_KEY=sk-ant-...
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
│       │   └── superadmin.controller.js  # Panel interno: stats, workspaces, email logs
│       ├── routes/
│       │   ├── workspace.routes.js
│       │   ├── superadmin.routes.js
│       │   └── ...
│       └── services/
│           ├── email.service.js         # Resend + log a EmailLog
│           ├── weeklyReport.service.js  # Cron viernes 14:00 ART
│           └── insightMemory.service.js # Cron sábado 00:00 ART
└── frontend/
    └── src/
        ├── context/
        │   ├── AuthContext.jsx     # user, login, logout, switchWorkspace
        │   ├── WorkspaceContext.jsx # info del workspace actual (nombre, slug, plan)
        │   └── ThemeContext.jsx
        ├── pages/
        │   ├── Login2.jsx
        │   ├── Register.jsx        # Crear nuevo workspace
        │   ├── Join.jsx            # Aceptar invitación
        │   ├── Dashboard.jsx
        │   ├── MyProjects.jsx
        │   ├── ProjectDetail.jsx
        │   ├── MyReports.jsx
        │   ├── RealTime.jsx
        │   ├── Reports.jsx         # Admin
        │   ├── Admin.jsx           # Panel admin (deep link ?tab=)
        │   ├── Productivity.jsx    # Admin
        │   ├── RRHH.jsx            # Admin — Recursos Humanos
        │   ├── MyProfile.jsx
        │   ├── Preferences.jsx
        │   ├── Docs.jsx
        │   └── SuperAdmin.jsx      # Panel interno (solo isSuperAdmin)
        ├── components/
        │   ├── Navbar.jsx          # Nav items con fuente única (links/adminSublinks/profileSections)
        │   ├── admin/
        │   │   ├── TeamTab.jsx     # Solo invitaciones por email
        │   │   └── ...
        │   └── ...
        └── api/client.js           # Axios: inyecta JWT + X-Workspace header
```

---

## Modelos de base de datos

| Modelo | Descripción |
|--------|-------------|
| `Workspace` | Tenant: slug, timezone, status (trialing/active/suspended...) |
| `WorkspaceMember` | Membresía usuario↔workspace: role (owner/admin/member), teamRole, preferencias IA |
| `Subscription` | Plan y facturación por workspace |
| `User` | Cuenta global: email único, datos personales, avatar |
| `UserRole` | Roles de equipo por workspace (ej: DESIGNER, CM) |
| `WorkspaceInvitation` | Invitaciones por email con token de 7 días |
| `WorkspaceDeletionRequest` | Solicitud de eliminación con 48h de gracia |
| `WorkDay` | Jornada laboral por usuario/workspace/día |
| `Task` | Tarea con estado, starred, backlog, sesiones de tiempo |
| `TaskSession` | Sesiones de cronómetro por tarea |
| `TaskComment` | Comentarios con @menciones |
| `Project` | Proyectos/clientes del workspace |
| `ProjectLink` | Links útiles por proyecto (Drive, Figma, etc.) |
| `Service` | Servicios que ofrece la agencia |
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
| Perfil | `/profile` |
| Preferencias | `/preferences` |
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

El panel super admin tiene sidebar de navegación con: Dashboard (stats + lista de workspaces), Feedback y Emails (log de todos los emails enviados).

---

## Deploy en producción

### Backend (Railway)

1. Variables de entorno en Railway: `DATABASE_URL`, `JWT_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM`, `APP_DOMAIN`, `GOOGLE_CLIENT_ID`, `ANTHROPIC_API_KEY`
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
