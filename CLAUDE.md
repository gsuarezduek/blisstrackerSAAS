# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Proyecto

| | Proyecto SaaS |
|---|---|
| **URL** | https://blisstracker.app (subdominios `slug.blisstracker.app`) |
| **GitHub** | https://github.com/gsuarezduek/blisstrackerSAAS |
| **Vercel** | Pro, wildcard `*.blisstracker.app` |
| **Railway** | DB PostgreSQL + backend |

Este repositorio (`team-tracker`) corresponde al **Proyecto SaaS** (`blisstrackerSAAS`) — es el único proyecto vigente. Hubo un proyecto individual anterior (`team.blissmkt.ar`, repo `gsuarezduek/blisstracker`) del cual el SaaS nació como reescritura multi-tenant, pero fue discontinuado y ya no existe.

## Documentación modular

El detalle de cada tema vive en `docs/claude/`. **Esos archivos NO se cargan automáticamente**: leé el que corresponda (`Read docs/claude/<archivo>.md`) apenas la tarea toque ese tema, antes de ponerte a buscar código. Esta raíz se carga en **todas** las sesiones, así que tiene solo lo que aplica a casi cualquier tarea.

| Archivo | Contenido |
|---|---|
| `backend/CLAUDE.md` | Arquitectura backend (Express/Prisma/middleware/servicios compartidos, invariante de los JWT, búsqueda de texto). Se carga solo al trabajar en `backend/` |
| `frontend/CLAUDE.md` | Arquitectura frontend (tests, íconos, OAuth popup, búsqueda, menú "⋯"). Se carga solo al trabajar en `frontend/` |
| `docs/claude/tareas.md` | WorkDay, Dashboard ("qué hago ahora", pestañas, `TaskCard`), máquina de estados, completar directo, destacadas, comentarios, adjuntos, backlog, tareas programadas y recurrentes |
| `docs/claude/proyectos.md` | Modelo de acceso (equipo = etiqueta), ficha del proyecto, Nube (descargas, miniaturas, vistas, arrastrar), links, accesos/credenciales, secciones por proyecto (Marketing/Contenido/Briefs), Situación, Briefs, Reuniones |
| `docs/claude/agentes-ia.md` | Tareas de agente: delegar, cola, novedades, desbloqueo, Dashboard, métricas (personas vs agentes), Calendario |
| `docs/claude/mcp.md` | Servidor MCP (`src/mcp/`): tokens, auth y 401, identidad del agente, novedades, canales de salida (webhook/despertador), catálogo de tools, apiBridge, guía |
| `docs/claude/plataforma.md` | Workspace y miembros, invitaciones, notificaciones (campana) y push mobile, roles, avatares, preferencias, insight diario y memoria IA, panel Admin |
| `docs/claude/auth.md` | Verificación en dos pasos (TOTP, códigos de recuperación, `mfaToken`, reset de contraseña) |
| `docs/claude/schema-notes.md` | Notas campo por campo del schema de Prisma |
| `docs/claude/rutas-frontend.md` | Rutas de la SPA (React Router) |
| `docs/claude/api-routes.md` | Listado completo de rutas de la API |
| `docs/claude/crons.md` | Tabla de cron jobs + deuda técnica de escalabilidad |
| `docs/claude/testing.md` | Índice de qué cubre cada archivo de test |
| `docs/claude/deploy.md` | Railway, Vercel, DNS, Stripe webhook, Chromium para PDF, workspace `bliss` |
| `docs/claude/env-vars.md` | Variables de entorno de backend y frontend |
| `docs/claude/navegacion.md` | Proyecto fijado entre secciones, barra lateral, avisos por módulo, `FloatingDock`, atajos de teclado, buscador Cmd/Ctrl+K |
| `docs/claude/marketing.md` | Índice de Marketing (qué cuentas entran, navegación, SerpAPI, refresco masivo) que apunta a un archivo por área: `marketing-geo-seo.md` (GEO/SEO, Web, Domain Rating, SERP, Inventario del blog), `marketing-canibalizacion.md`, `marketing-enlaces.md`, `marketing-rrss.md` (redes, competidores, scraping), `marketing-anuncios.md`, `marketing-informes.md` (informes mensuales y objetivos) |
| `docs/claude/mailing.md` | Mailing (Marketing → Mailing): email marketing por proyecto con el Resend/SES/SMTP del cliente, bases e importación CSV o desde Ventas, formulario público con doble opt-in, campañas por bloques, envío con tope diario y ventana horaria, tracking propio, baja one-click, webhook de rebotes |
| `docs/claude/ventas.md` | CRM: Empresas/Contactos/Leads, Propuestas (documento estructurado), Pipeline Kanban, Métricas/Forecast, Recordatorios |
| `docs/claude/finanzas.md` | Finanzas: cuentas/saldos/ajustes, movimientos/impuestos/cheques, clientes (cuenta corriente, razón social) y facturación ARCA, Extras (cobros y pagos al equipo), Pendientes, rutas |
| `docs/claude/whatsapp.md` | Automatización de reactivación, analítica/costo, bot (entrenamiento, reglas de seguridad, base de conocimiento), bloqueo de spam, Coexistence |
| `docs/claude/chat.md` | Chat interno: canales, menciones, pins, reacciones, reply, mensajes de sistema, tiempo real (Socket.IO) |
| `docs/claude/contenido.md` | Calendario de contenido con aprobación del cliente (piezas, assets, workflow, notificaciones) |
| `docs/claude/client-portal.md` | Portal de cliente multi-contacto, login OTP, experiencia del portal |
| `docs/claude/calendario.md` | Módulo Calendario: disponibilidad del equipo, reuniones agendadas, sync con Google Calendar, calendarios externos |
| `docs/claude/eos.md` | EOS / Traction: Visión, Personas, Scorecard, Asuntos, Procesos, Tracción, Evaluación |
| `docs/claude/rrhh.md` | Panel RRHH, Productividad, Asistencia/tardanzas, Legajo configurable, Vacaciones, Beneficios, Desempeño y 1on1 |
| `docs/claude/billing-admin.md` | Billing/Stripe, Feature flags, Acceso a módulos por rol, Super Admin panel, Landing/onboarding, emails de plataforma |
| `docs/claude/migrations.md` | Historial de migraciones de Prisma (contexto histórico; `git log` y la carpeta de migraciones son la fuente autoritativa) |
| `docs/claude/integrations-oauth.md` | Setup de OAuth (Google/Meta/TikTok/LinkedIn): redirect URIs, scopes, permisos |

**Regla práctica:** si la tarea menciona alguno de estos temas (o un archivo que vive en su carpeta/componente), leé el doc correspondiente primero — ahorra idas y vueltas de búsqueda. Si un comentario de código dice "ver X en CLAUDE.md" (o en `backend/CLAUDE.md`), esa sección probablemente se movió: buscá X con grep en `docs/claude/`.

**Dónde se documenta lo nuevo (regla de tamaño):** los tres `CLAUDE.md` se cargan solos y se pagan en tokens en cada mensaje; los `docs/claude/*.md` solo cuando se leen. Por eso:
- El detalle de una feature (cómo funciona, por qué se decidió así, casos borde, endpoints, tests) va en el `docs/claude/<tema>.md` que corresponda, o en uno nuevo agregado a la tabla de arriba.
- En un `CLAUDE.md` va como mucho **una línea** con el puntero, y solo si es algo que hay que saber en casi cualquier tarea (una invariante, una convención que se rompe fácil).
- Presupuesto: raíz ≤ 25 KB, `backend/CLAUDE.md` ≤ 15 KB, `frontend/CLAUDE.md` ≤ 12 KB. El hook `.claude/hooks/check-claude-md-size.sh` avisa al editar uno si se pasa; en ese caso, mover detalle a `docs/claude/` en vez de agregar.

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

### Mobile (`mobile/`) — CONGELADA (nov 2026)
App React Native (Expo) para usuarios no-admin. **No se analiza ni se actualiza**: el código queda en el repo tal como está y no se trabaja en los próximos meses. `.claude/settings.json` lo hace cumplir con una regla `deny` sobre `mobile/**`; para retomarla, borrar esa regla. Lo que vive del lado del servidor (push notifications: `services/pushNotification.service.js`, modelo `DeviceToken`, `POST /api/devices/register`) sigue funcionando y **sí** se mantiene.

### Environment variables
Listado completo de backend y frontend en `docs/claude/env-vars.md`.

Default credentials after seed: `admin@blissmkt.ar` / `admin123` (workspace slug: `bliss`)

## Architecture

### Overview
Full-stack SaaS task tracker. Multi-tenant: each workspace is a separate subdomain (`slug.blisstracker.app`). Backend is a REST API; frontend is a React SPA. No shared code between them — they communicate only via HTTP.

### Multi-tenancy

**Workspace resolution:** Every authenticated request from the frontend includes `X-Workspace: <slug>`. The `resolveWorkspace` middleware resolves the slug to a `Workspace` row and injects `req.workspace`. If the workspace doesn't exist → 404; if the user isn't a member → 403.

**JWT payload:** `{ userId, workspaceId, role, teamRole, isSuperAdmin, name, email }`. The `role` field is the workspace role (`owner` | `admin` | `member`). When switching workspaces, a new JWT is issued for that workspace context.

**Data isolation:** All workspace-scoped tables have a `workspaceId` FK. Controllers filter by `req.workspace.id`. No cross-workspace data leakage is possible at the query level.

**Workspace roles** (`WorkspaceMember.role`): `owner` > `admin` > `member`. Team role (`WorkspaceMember.teamRole`) is a separate string referencing `UserRole.name` (e.g. `"DESIGNER"`).

Arquitectura específica de cada lado vive en `backend/CLAUDE.md` y `frontend/CLAUDE.md` — se cargan automáticamente solo cuando Claude Code trabaja dentro de esa carpeta.

### Key domain concepts

Una línea por concepto núcleo; el detalle está en el doc indicado. El resto de los módulos (Ventas, Marketing, Mailing, WhatsApp, Chat, Contenido, Portal, Calendario, EOS, RRHH, Finanzas, Billing/Admin) está en la tabla de "Documentación modular".

- **Workspace / WorkspaceMember** — el tenant (`slug` = subdominio, `status`, `timezone`, perfil de empresa y marca; logo/banner como bytes en DB). Las subidas de imagen se validan por magic bytes (`lib/imageType.js`), SVG no se acepta. El miembro une `User` y `Workspace`: `role` (permisos) + `teamRole` (rol de equipo principal) + `extraTeamRoles`, horario laboral y flags de preferencias. Se entra solo por invitación. → `docs/claude/plataforma.md`
- **Autenticación** — JWT por workspace; 2FA TOTP opt-in con login en dos pasos. Un token de propósito acotado (`mfaToken`, state de OAuth, portal de cliente) **nunca** sirve como token de sesión (`lib/jwt.js`, ver `backend/CLAUDE.md`). → `docs/claude/auth.md`
- **Tareas y Dashboard** — un `WorkDay` por persona por día (fecha en TZ Buenos Aires); estados `PENDING → IN_PROGRESS → PAUSED / BLOCKED / COMPLETED`; **una sola tarea humana `IN_PROGRESS` por persona** (`assertNoActiveTask` + índice parcial `one_active_task_per_user`); destacadas (`starred` 0–3, hasta 3), `isBacklog`, programadas (`scheduledFor`) y recurrentes (`TaskRecurrence`, materialización perezosa sin cron); comentarios abiertos a todo el workspace; adjuntos que se guardan en la Nube del proyecto. Orden newest-first. → `docs/claude/tareas.md`
- **Proyectos** — `ProjectMember` es la etiqueta del equipo, **no una barrera**: cualquier miembro del workspace ve cualquier proyecto (salvo privados) y le crea tareas. Marketing/Contenido/Briefs se prenden por proyecto (criterio único `lib/projectModules.js`, nunca filtrar a mano). Credenciales cifradas con AES-256-GCM (`lib/encryption.js`) y reveladas bajo demanda. → `docs/claude/proyectos.md`
- **Agentes IA** — agentes conectados por MCP; una tarea de agente (`isAgentTask`/`agentId`) no ocupa el lugar de la persona. **Lo que se le cobra al cliente incluye el tiempo de agente; lo que evalúa a la persona, no** (criterio único en `lib/agentTasks.js`). → `docs/claude/agentes-ia.md` + `docs/claude/mcp.md`
- **Notificaciones** — enum `NotificationType`, campana con filtros y lectura por tipo, `actorId` nullable (acciones del cliente); push mobile vía Expo solo para tareas, comentarios y chat. → `docs/claude/plataforma.md`
- **Roles, avatares, preferencias e insights IA** — admin = `role` admin|owner, desacoplado del rol de equipo; avatares en DB; insight diario con Claude Haiku cacheado por día, memoria semanal y expectativas por rol. → `docs/claude/plataforma.md`

### Prisma schema notes
- `WorkspaceMember.role`: `owner` | `admin` | `member` (permisos). `WorkspaceMember.teamRole`: `String` que referencia `UserRole.name` (ej. `"DESIGNER"`).
- `User.isSuperAdmin` — flag global solo para el equipo interno de BlissTracker.
- Cuando un modelo tiene dos relaciones al mismo modelo, hacen falta relaciones con nombre (ej. `Task.createdBy` / `Task.user`).
- Migraciones en `backend/prisma/migrations/`. Local `migrate dev`, producción `migrate deploy`. `prisma migrate dev` falla en shells no interactivos: crear a mano la carpeta + el SQL y correr `prisma migrate deploy` + `prisma generate`.
- Notas campo por campo de cada modelo: `docs/claude/schema-notes.md`. Historial de migraciones: `docs/claude/migrations.md`.

### Frontend routes, crons, tests y deploy
- **Rutas de la SPA:** `frontend/src/App.jsx`; listado comentado en `docs/claude/rutas-frontend.md`.
- **Crons:** todos en `backend/src/index.js`, con locks en memoria para no solaparse; los jobs mensuales del día 1° corren en una sola cadena secuencial (`MONTHLY_CHAIN`). Tabla y deuda de escalabilidad: `docs/claude/crons.md`.
- **Tests:** backend con Jest + Supertest y Prisma mockeado (`backend/tests/unit`, `backend/tests/integration`); frontend con Vitest + React Testing Library (`frontend/src/tests`). Índice de qué cubre cada archivo: `docs/claude/testing.md`.
- **Deploy:** backend en Railway (corre `db:migrate` en cada deploy; el seed es manual), frontend en Vercel (root `/frontend`), DNS wildcard en Cloudflare, CORS por regex `*.blisstracker.app` en `app.js`. El workspace `bliss` está exento de billing. Detalle: `docs/claude/deploy.md`.
