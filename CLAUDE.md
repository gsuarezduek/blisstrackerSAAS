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

Para que cada sesión de Claude Code cargue menos contexto de entrada, el detalle de cada módulo vive en archivos separados bajo `docs/claude/`. **Esos archivos NO se cargan automáticamente** — hay que leerlos (`Read docs/claude/<archivo>.md`) apenas la tarea toque ese módulo, antes de ponerte a buscar código. Esta raíz (`CLAUDE.md`) concentra solo lo que aplica a casi cualquier tarea: comandos, arquitectura general, multi-tenancy, y los conceptos núcleo (Workspace/Task/Project/Notifications/Dashboard/Roles/Preferencias/Insight IA).

| Archivo | Contenido |
|---|---|
| `backend/CLAUDE.md` | Arquitectura backend (Express/Prisma/middleware/servicios compartidos) + env vars de `backend/.env`. Se carga solo al trabajar en `backend/` |
| `frontend/CLAUDE.md` | Arquitectura frontend (contexts/hooks/convenciones de UI/Navbar/atajos/buscador) + env vars de `frontend/.env.development`. Se carga solo al trabajar en `frontend/` |
| `mobile/CLAUDE.md` | App React Native (Expo): arquitectura, auth sin subdominio, push/chat/biometría. Se carga solo al trabajar en `mobile/` |
| `docs/claude/marketing.md` | GEO/SEO, RRSS (Instagram/TikTok/LinkedIn/Facebook/YouTube), Ads, Competidores, Informes mensuales, Objetivos de marketing, Domain Rating, SERP, servicios de scraping |
| `docs/claude/ventas.md` | CRM: Empresas/Contactos/Leads, Propuestas (documento estructurado), Pipeline Kanban, Métricas/Forecast, Recordatorios |
| `docs/claude/whatsapp.md` | Automatización de reactivación, analítica/costo, bot (entrenamiento, reglas de seguridad, base de conocimiento), bloqueo de spam, Coexistence |
| `docs/claude/chat.md` | Chat interno: canales, menciones, pins, reacciones, reply, mensajes de sistema, tiempo real (Socket.IO) |
| `docs/claude/contenido.md` | Calendario de contenido con aprobación del cliente (piezas, assets, workflow, notificaciones) |
| `docs/claude/client-portal.md` | Portal de cliente multi-contacto, login OTP, experiencia del portal |
| `docs/claude/calendario.md` | Módulo Calendario: disponibilidad del equipo, reuniones agendadas, sync con Google Calendar |
| `docs/claude/eos.md` | EOS / Traction: Visión, Personas, Scorecard, Asuntos, Procesos, Tracción, Evaluación |
| `docs/claude/rrhh.md` | Panel RRHH, Productividad, Asistencia/tardanzas, Legajo configurable, Vacaciones, Beneficios |
| `docs/claude/billing-admin.md` | Billing/Stripe, Feature flags, Acceso a módulos por rol, Super Admin panel, Landing/onboarding, emails de plataforma |
| `docs/claude/api-routes.md` | Listado completo de rutas de la API (referencia) |
| `docs/claude/migrations.md` | Historial completo de migraciones de Prisma (contexto histórico; `git log` y la carpeta de migraciones son la fuente autoritativa) |
| `docs/claude/integrations-oauth.md` | Setup de OAuth (Google/Meta/TikTok/LinkedIn): redirect URIs, scopes, permisos |

**Regla práctica:** si la tarea menciona alguno de estos módulos (o un archivo que vive en su carpeta/componente), leé el doc correspondiente primero — ahorra idas y vueltas de búsqueda.


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

### Mobile (`cd mobile`)
```bash
npm start                                          # Metro bundler / Expo Dev Tools
npm run ios                                        # simulador de iOS
npm run android                                    # emulador de Android
eas build --platform android --profile preview     # APK de prueba (requiere `npm install -g eas-cli` + login a una cuenta de Expo)
```
App React Native (Expo) para usuarios no-admin, en desarrollo — ver `mobile/CLAUDE.md` para arquitectura, auth sin subdominio, push/chat/biometría y el detalle de los perfiles de `eas.json`.

### Environment variables
Variables específicas de cada lado: `backend/CLAUDE.md` (DB, JWT, Resend, Stripe, Google/Meta/TikTok/LinkedIn, Apify, R2, etc.) y `frontend/CLAUDE.md` (`VITE_API_URL`, `VITE_GOOGLE_CLIENT_ID`). Se cargan solo al trabajar en esa carpeta.

Default credentials after seed: `admin@blissmkt.ar` / `admin123` (workspace slug: `bliss`)

## Architecture

### Overview
Full-stack SaaS task tracker. Multi-tenant: each workspace is a separate subdomain (`slug.blisstracker.app`). Backend is a REST API; frontend is a React SPA. No shared code between them — they communicate only via HTTP.

### Multi-tenancy

**Workspace resolution:** Every authenticated request from the frontend includes `X-Workspace: <slug>`. The `resolveWorkspace` middleware resolves the slug to a `Workspace` row and injects `req.workspace`. If the workspace doesn't exist → 404; if the user isn't a member → 403.

**JWT payload:** `{ userId, workspaceId, role, teamRole, isSuperAdmin, name, email }`. The `role` field is the workspace role (`owner` | `admin` | `member`). When switching workspaces, a new JWT is issued for that workspace context.

**Data isolation:** All workspace-scoped tables have a `workspaceId` FK. Controllers filter by `req.workspace.id`. No cross-workspace data leakage is possible at the query level.

**Workspace roles** (`WorkspaceMember.role`): `owner` > `admin` > `member`. Team role (`WorkspaceMember.teamRole`) is a separate string referencing `UserRole.name` (e.g. `"DESIGNER"`).

Arquitectura específica de cada lado (servicios, middleware, contexts, convenciones de UI, Navbar, atajos, buscador global) vive en `backend/CLAUDE.md` y `frontend/CLAUDE.md` — se cargan automáticamente solo cuando Claude Code trabaja dentro de esa carpeta.

### Key domain concepts

Los conceptos núcleo (Task/Project/Workspace/Notificaciones/Dashboard) están acá porque los toca casi cualquier feature. El resto de los módulos (Ventas, Marketing, WhatsApp, Chat, Contenido, Portal de cliente, Calendario, EOS, RRHH, Billing/Admin) vive en `docs/claude/` — ver la tabla en "Documentación modular" arriba.

**Workspace:** The top-level tenant. Has a `slug` (subdomain), `status` (`trialing` | `active` | `past_due` | `suspended` | `cancelled`), and `timezone`. Members are linked via `WorkspaceMember`. Company profile fields: `companyName`, `companyDescription`, `industry`, `companyWebsite`. Brand identity: `brandColors` (JSON `[{ hex, name? }]`), `brandFonts` (JSON `[{ name, role }]` where `role` is `heading|body|accent`). Logo and banner stored as raw bytes in DB: `logoData`/`logoMimeType` and `bannerData`/`bannerMimeType` (max 5 MB via multer memoryStorage). Las subidas (logo/banner/avatares) se validan por **magic bytes** (`lib/imageType.js` → `validateImageUpload`), no por extensión ni `Content-Type` del cliente; sólo PNG/JPG/WEBP (avatares también GIF). **SVG no se acepta** (riesgo de XSS al servirse same-origin); el serve público de logo agrega `X-Content-Type-Options: nosniff` y fuerza `Content-Disposition: attachment` si quedó algún SVG legacy. Feature flag opt-out: `disabledFeatureKeys` (JSON array of keys) — workspace admins can disable globally-enabled flags for their workspace from Preferencias → Módulos adicionales.

**WorkspaceMember:** Joins `User` and `Workspace`. Fields: `role` (owner/admin/member), `teamRole` (rol de equipo **principal**; el que muestran reportes/insights/badges), `extraTeamRoles` (`Json` string[] de roles adicionales, editables en Admin → Equipo vía `PUT .../members/:userId` `{ extraRoles }`; `lib/moduleAccess.js` `memberRoleNames()` junta principal+adicionales y `hasModuleAccess` y `GET /ventas/team` los consideran todos; insights diarios/memoria suman las `RoleExpectation` de todos; `DELETE /roles/:id` se bloquea si alguien lo tiene como principal o adicional), `active`, `vacationDays`, `workStartTime`/`workEndTime` (horario laboral, ver concepto "Horario laboral y tardanzas"), and the four AI preference flags.

**Team management:** Members are added exclusively by invitation. Admin sends invite from **Admin → Equipo**; backend creates `WorkspaceInvitation` with a 7-day token and sends email. The invitee visits `/join?token=...` to accept. No passwords are set or managed from the admin panel — that's the invitee's responsibility.

**WorkDay:** Created automatically when a user visits the Dashboard. One per user per workspace per calendar day (`YYYY-MM-DD` in Buenos Aires time). Closing a workday logs out the user. Tasks from previous days that are still PENDING/PAUSED/BLOCKED are carried over.

**Dashboard (`pages/Dashboard.jsx`) — jerarquía por "qué hago ahora":** de arriba hacia abajo: encabezado (saludo según la hora + resumen en línea: jornada · completadas · horas registradas · por hacer, y las acciones "+ Agregar tarea" primaria / "Terminar jornada" secundaria, que abre un `ConfirmModal` con el resumen del día en vez de `window.confirm`) → insight IA → **`NowCard`** (`components/dashboard/NowCard.jsx`: la tarea `IN_PROGRESS` con cronómetro en vivo por segundo y acciones Completar / Pausar / "Estoy bloqueado"; sin tarea en curso **sugiere la siguiente** — destacada de mayor prioridad no bloqueada → pausada → pendiente — con un botón "Empezar/Retomar"; también cubre los estados "nada para hoy" y "jornada finalizada") → aviso rojo si algo **delegado o seguido está bloqueado** (lleva a la pestaña Seguimiento filtrada en Bloqueada) → secciones en **una sola columna** (`TaskSection`): **Foco del día** (destacadas), **Bloqueadas**, **Para hoy** (pausadas primero, después pendientes) → panel **"Más tarde"** con pestañas (`components/dashboard/LaterTabs.jsx`, la última elegida se recuerda en `localStorage` `bliss_dashboard_later_tab`): Backlog (agrupado por proyecto, abierto por defecto) · Seguimiento (`SeguimientoSection` con `embedded`) · Programadas · Completadas (el historial se pide recién al abrir la pestaña). Reemplaza a las 3 tarjetas de estadísticas, la grilla de 2 columnas por estado y los 4 acordeones del final. **`TaskCard.jsx`** (solo lo usa el Dashboard) es una fila compacta: estrella (`components/dashboard/StarButton.jsx`), título, metadatos, **una sola acción principal** según el estado (Iniciar / Retomar / Desbloquear / Agregar a hoy / Traer a hoy) y el resto en un menú "⋯" (Mover al Backlog, Abrir detalle, Eliminar). En mobile las acciones bajan debajo del texto (se renderizan dos copias alternadas por CSS). El menú "⋯" se renderiza en un portal (`createPortal` a `document.body`, posición `fixed` calculada desde el botón, se abre hacia arriba si no entra) para que no lo recorten contenedores con `overflow-hidden` como las cajas por proyecto del Backlog. **Cambiar de tarea en un click:** con otra tarea en curso, "Iniciar"/"Retomar" ya no quedan deshabilitados — pausan la activa (`PATCH .../pause`) y arrancan esta; el backend sigue exigiendo una sola `IN_PROGRESS` por persona, solo se encadenan las dos llamadas (test en `src/tests/components/TaskCard.test.jsx`).

**Task status machine:**
```
PENDING → IN_PROGRESS → PAUSED / BLOCKED / COMPLETED
BLOCKED → IN_PROGRESS (unblock)
PAUSED  → IN_PROGRESS (resume)
```
Only one task can be `IN_PROGRESS` per user at a time (enforced via `assertNoActiveTask()`). Blocking requires a reason and notifies all project members.

**Starred tasks:** Up to 3 tasks can be starred simultaneously. `starred` is an Int 0–3 (0=none, 1=green, 2=yellow, 3=red). The star is the sole status indicator on TaskCard. Starred tasks appear in the "Foco del día" section, sorted by priority (3 = red first).

**Task ordering:** Newest-first within each section. Backend returns `orderBy: { createdAt: 'desc' }`.

**Task comments:** Any active WORKSPACE member can view and comment on any task — same "equipo = etiqueta, no barrera" criterio as the rest of the project access model, `getTaskWithAccess` in `comments.controller.js` only scopes by workspace, no `ProjectMember` check. `_count.comments` is always included in task responses. Notifications: `TASK_COMMENT` to owner + previous commenters; `TASK_MENTION` to `@mentioned` users (no duplicate with TASK_COMMENT). **`@mentions` resolve against active WORKSPACE members, not just the project team** (`comments.controller.js` `addComment` queries `workspaceMember`, mirroring `resolveTaskMentions` in `tasks.controller.js` used for the task description) — same "equipo = etiqueta, no barrera" criterio as the rest of the project access model: anyone in the workspace can be mentioned and notified from a task comment, whether or not they're part of that project's team. Frontend: `TaskCommentsModal.jsx`'s comment mention autocomplete uses the same `wsMembers` (from `useMembers()`, already fetched for the description's mention autocomplete) instead of a separate `GET /projects/:id/members` call. **Reactions with emoji** (model `TaskCommentReaction`, mirrors `ChatMessageReaction`): open to anyone with access to the task (not just the comment's author), no fixed catalog, toggle by `(commentId, userId, emoji)` — `POST /api/tasks/:id/comments/:commentId/reactions` (body `{emoji}`, `comments.controller.js` `toggleReaction`) returns the updated comment with `reactions` included. `listComments`/`addComment` both include `reactions` (`COMMENT_INCLUDE`, same shape as chat's `MESSAGE_INCLUDE`: `{id, emoji, userId, user:{name}}`). Frontend reuses the chat module's generic reaction UI as-is (`components/chat/reactions.js` `groupReactions`, `components/chat/MessageReactionPicker.jsx`) — a hover-reveal 🙂 button per comment in `TaskCommentsModal.jsx` opens the same quick-reaction picker, pills render below the comment content.

**Task attachments:** Adjuntar un archivo a una tarea lo sube directo al repositorio de Archivos del proyecto (`ProjectFile`, mismo bucket R2 y mismas validaciones — MIME denylist, tamaño, magic bytes, cuota de storage del workspace — que `POST /api/projects/:id/files/presign`/`confirm`), no un adjunto aparte scopeado a la tarea. Tabla puente `TaskFile` (`taskId`, `fileId` → `ProjectFile` `onDelete: Cascade`, `linkedById?`, `@@unique([taskId, fileId])`) — mismo patrón que `ContentPieceFile`, pero acá el archivo **nace** ahí (no es una asociación a algo ya existente): la carpeta destino se resuelve sola la primera vez que alguien adjunta algo, `"Tareas / <Mes> / <título de la tarea>"` (mismo criterio de organización que `contentFileMirror.service.js` usa para los assets de Contenido, `"<Mes> / <Pieza>"` — el helper `findOrCreateFolder` se extrajo a `lib/projectFileTree.js` para que ambos lo reutilicen sin duplicar la lógica de "buscar carpeta por nombre bajo un padre, crearla si no existe"). Controller `tasks/attachments.controller.js` (rutas bajo `/api/tasks/:id/attachments`, mismo criterio de acceso "equipo = etiqueta, no barrera" que los comentarios — `getTaskWithAccess` solo scopea por workspace): `GET` lista los adjuntos (`TaskFile` con `file.status:'ready'`, shapeados con el `shapeItem` de `projectFiles.controller.js`, exportado junto con `assertWithinQuota`/`PRESIGN_EXPIRES_IN` para no duplicar esas validaciones), `POST .../presign` (mismo body que Archivos salvo que el `parentId` no lo elige el cliente) → `POST .../:fileId/confirm` (valida tamaño real + magic bytes y, si todo sale bien, crea el `TaskFile` en la misma transacción), `DELETE .../:fileId` (saca el vínculo — el `ProjectFile` en sí queda intacto en Archivos, no se borra: "se guarda automáticamente en la nube de ese proyecto" es la premisa, no un adjunto efímero). Topes propios por tarea (`MAX_PENDING_PER_TASK`, `MAX_ATTACHMENTS_PER_TASK`), independientes de los topes por proyecto que ya tiene Archivos. `Task._count.files` (filtrado a `file.status:'ready', deletedAt:null` — un `_count` con `where` anidado, soportado por Prisma) se agrega al `taskInclude` de `workdays.controller.js` y `tasks/_shared.js` (no a los demás lugares que arman su propio `taskInclude` local — ver concepto "Shared task include" — el badge 📎 de `TaskCard.jsx` simplemente no aparece donde ese conteo no viene incluido). Frontend: sección "Adjuntos" en `TaskCommentsModal.jsx` (entre los metadatos y "Comentarios"), botón "📎 Adjuntar archivo" + lista con ícono/nombre/tamaño (`lib/fileIcons.js`, compartido con Archivos) y descarga vía blob (mismo patrón que `ProjectFiles.jsx` `handleDownload`, contra `GET /api/projects/:projectId/files/:fileId/download` — el `projectId` viaja en cada ítem de la lista, no hace falta una ruta de descarga aparte). Hook `useTaskFileUpload` en `taskFileUpload.js` (mismo presign→PUT a R2→confirm con progreso que `useProjectFileUpload` de `projectFilesUpload.js`, del que reimporta `MAX_FILE_BYTES`/`fmtMb` — implementaciones paralelas a propósito, mismo criterio que `ContentAssetUploader.jsx` vs `projectFilesUpload.js`, no un hook 100% genérico compartido).

**Notifications:** `NotificationType` enum: `COMPLETED` / `BLOCKED` / `UNBLOCKED` / `ADDED_TO_PROJECT` / `TASK_COMMENT` / `TASK_MENTION` / `VACATION_REQUEST` / `VACATION_REVIEWED` / `LEAD_ASSIGNED` / `GAME_LAUNCHED` / `CHAT_MENTION` / `CONTENT_APPROVED` / `CONTENT_CHANGES_REQUESTED` / `CONTENT_MENTION` / `BENEFIT_REQUEST` / `BENEFIT_REVIEWED` (+ `PORTAL_CLIENT_LOGIN`/`WHATSAPP_MESSAGE`). Bell panel (`NotificationBell.jsx`) tiene **7 filtros solo-icono** (sin "Todas"), predicados disjuntos: `BLOCKED` (🔒, agrupa BLOCKED+UNBLOCKED), `CLIENT` (🤝 "Respuestas del cliente", CONTENT_APPROVED+CONTENT_CHANGES_REQUESTED), `TASK_MENTION` (@, agrupa TASK_MENTION+LEAD_ASSIGNED+CHAT_MENTION+CONTENT_MENTION — "te mencionaron/asignaron algo"), `TASK_COMMENT` (💬), `FOLLOWED` (👁, completadas de tareas que seguís/delegaste), `OTHER` (🔔, whitelist explícita: VACATION_REQUEST/ADDED_TO_PROJECT/VACATION_REVIEWED/GAME_LAUNCHED/BENEFIT_REQUEST/BENEFIT_REVIEWED — ya no hay un filtro `ACTION` separado para VACATION_REQUEST, se fusionó acá), `COMPLETED` (✓, muted — no suma al badge). `BENEFIT_REQUEST`/`BENEFIT_REVIEWED` (ver concepto "RRHH panel" → Beneficios) siguen el mismo criterio de deep-link que VACATION_REQUEST/VACATION_REVIEWED: la solicitud va a `/admin/rrhh?tab=beneficios` (quien la recibe ya tiene acceso al módulo), la revisión al perfil propio del solicitante (`/profile`). El encabezado muestra "Notificaciones · {tipo activo}" y cada icono lleva un badge con la cantidad **sin leer de ese tipo**. Modelo de lectura **por tipo**: abrir el panel marca leído solo el tipo que se está viendo (no todo); cambiar de icono marca leído ese tipo. Backend: `POST /api/notifications/read` body `{ types: [...] }` (marca leídas por tipo) además de `/read-all`. Cada notificación es un link que abre `TaskCommentsModal`, salvo las de deep-link propio: `leadId` → Ventas, `contentPieceId` → `/contenido?piece=` con el modal de la pieza abierto, `GAME_LAUNCHED`/`CHAT_MENTION` no navegan, disparan un evento `window` que abre su flotante (🏆/💬). **El badge "nuevo" del flotante de Gamification reutiliza `GAME_LAUNCHED`**: `GET /api/gamification/active` expone `isNew` por juego (true si el usuario actual tiene sin leer la notificación `GAME_LAUNCHED` de ese juego); `GamificationFab.jsx` solo muestra el badge rojo pulsante mientras haya algún `isNew`, y al abrir el panel marca esas notificaciones leídas (`POST /notifications/read { types: ['GAME_LAUNCHED'] }`) — así deja de "avisar" apenas el usuario lo vio una vez, sin un modelo de "visto" aparte. **`Notification.actorId` es nullable**: para `CONTENT_APPROVED`/`CONTENT_CHANGES_REQUESTED` el actor es un `ClientPortalContact` (el cliente), no un `User` — en esos casos el avatar cae a un ícono placeholder (✅/✏️) y el `message` es **autocontenido** (incluye el nombre de quien actuó), ver concepto "Contenido".

**Push notifications (mobile):** modelo `DeviceToken` (`userId`, `workspaceId`, `token` único, `platform`) guarda el Expo Push Token de cada instalación de la app mobile — `POST /api/devices/register` (upsert por token, un usuario puede tener varios dispositivos) y `DELETE /api/devices/register` (logout desde la app). `backend/src/services/pushNotification.service.js` usa el **servicio de Expo Push** (no Firebase/APNs directo — un solo tipo de token sirve para Android e iOS, sin credenciales propias) vía `expo-server-sdk`, cargado con `import()` dinámico porque el paquete es ESM-only y el backend es CommonJS. `sendPushToUser({userId, workspaceId, type, message, taskId, channelId})` es best-effort (nunca lanza) y limpia sola los tokens de dispositivos que desinstalaron la app (`DeviceNotRegistered`). `taskId`/`channelId` viajan en `data` para que la app deep-linkee al tocar la notificación (a una tarea o a un canal de chat). **No engancha los 15 puntos del código que crean `Notification`** (Ventas/EOS/Gamification/WhatsApp/Contenido/etc.) — solo los tres que ya son parte del alcance de la app mobile: `tasks/lifecycle.controller.js` (asignación, menciones en la descripción, completar/bloquear/desbloquear), `comments.controller.js` (menciones y comentarios en tareas) y `chat.controller.js` (`sendMessage`: @menciones individuales, `@everyone` y "responder equivale a mención" — los tres via `CHAT_MENTION`). Se suma un enganche más por cada fase de la app que llegue a cubrir esa función. Ver "Push notifications (mobile)" en `mobile/CLAUDE.md` para el lado del cliente (permisos, registro del token, deep-link al tocar la notificación) y el paso pendiente de `eas init`.

**Project links:** Stored in `ProjectLink`. Any project member can add/delete. `PUT /api/projects/:id/links` replaces all links atomically.

**Accesos / credenciales del proyecto:** `ProjectAccess` guarda credenciales sensibles por proyecto (`account`, `username`, `password`, `twofa`, `extra` — todos opcionales). **`password` y `twofa` se cifran** con AES-256-GCM (`lib/encryption.js`, formato `"iv:tag:ciphertext"`) y **solo se descifran bajo demanda** en el endpoint reveal. Igual que el resto de la ficha del proyecto (info, links), los accesos los ve/gestiona **cualquier miembro del workspace**, no solo el equipo del proyecto (`resolveAccessGuard` solo valida que el proyecto exista en el workspace). Rutas en `projects.controller.js`: `GET /api/projects/:id/accesos` (lista en forma pública vía `publicAccess` — nunca expone password/2FA, solo `hasPassword`/`hasTwofa`), `POST` (alta, cifra password+2FA), `GET .../:accessId/reveal?field=password|twofa` (descifra **un** dato y devuelve `{ value }`), `DELETE .../:accessId`. **Log de auditoría:** cada reveal inserta un `ProjectAccessLog` (`workspaceId`, `projectId`, `accessId` con `onDelete: SetNull` para conservar historial, `userId`, `field`, `createdAt`) registrando quién solicitó ver qué dato sensible — por ahora solo se persiste; la visualización del log se desarrollará más adelante. UI: `frontend/src/components/ProjectAccesos.jsx` (componente `SecretRow` para password/2FA, revelado individual con `?field=`).

**Project access model (team = etiqueta, no barrera):** `ProjectMember` ya **no** es una barrera de acceso, sino la etiqueta del "equipo principal" (los que trabajan principalmente en el proyecto). Cualquier integrante del workspace puede **ver cualquier proyecto** y **crear/asignar tareas** en él sin pasar a ser miembro del equipo. Concretamente: `GET /api/projects` devuelve **todos** los proyectos activos del workspace (no solo los del usuario); las lecturas de proyecto (`getMembers`, `projectTasks`, `projectCompletedHistory`) están abiertas a cualquier miembro del workspace; `POST /api/tasks` solo valida que el destinatario sea un miembro **activo del workspace** (no del proyecto), y el colaborador puntual **no** se agrega al equipo. Las escrituras de ficha del proyecto `saveLinks` y `saveInfo` siguen siendo member-only; **`saveSituation` (Situación de la cuenta) está abierta a cualquier miembro del workspace** (el editor se muestra a todos, así que rechazar con 403 daba un error confuso). En `AddTaskModal.jsx` el selector "Asignar a" lista a todo el workspace agrupado en `<optgroup>` "Equipo del proyecto" / "Otros del workspace".

**Starred projects (`/my-projects`):** `ProjectStar` (join `projectId` + `userId`) marca proyectos destacados **por usuario** (preferencia personal, análoga al starring de tareas pero booleana). `GET /api/projects` incluye `starred` por proyecto; `PATCH /api/projects/:id/star` togglea. `MyProjects.jsx` agrupa en 3 secciones en orden: **Proyectos destacados** (estrella, si hay) → **Mis proyectos** (donde soy del equipo) → **Otros proyectos del workspace**. Un destacado se saca de su grupo original y sube a Destacados. La estrella amarilla reemplazó al viejo punto verde/rojo; el estado "tiene bloqueadas" se indica ahora con un puntito rojo condicional + la pill roja existente. **Alta de proyecto desde Mis Proyectos:** botón "Nuevo proyecto" (solo admin/owner, mismo `workspaceAdminOnly` de `POST /api/projects`) abre `NewProjectModal.jsx` (nombre + servicios + equipo; quien lo crea queda en el equipo) y al crear navega a la ficha.

**Project info (websiteUrl + connections):** `Project.websiteUrl String?` used for GEO analysis. `Project.connections String @default("{}")` — JSON with keys `instagram`, `facebook`, `linkedin`, `twitter`, `tiktok`, `youtube`. Managed from the **Info** tab in `ProjectDetail.jsx` via `ProjectInfoTab.jsx`. Admins no longer manage URL/links from the Admin panel.

**Ficha del proyecto (`ProjectDetail.jsx` + `pages/project-detail/`) — Resumen primero:** pestañas con subrayado (scroll horizontal en mobile, sin `<select>`): **Resumen** (default, `overview.jsx`) · Tareas · Reuniones · Nube · Briefs · Links y accesos (`accesos.jsx`, si `linksEnabled`) · Horas (`ProjectReports`) · Ajustes (`info.jsx`: servicios, portal del cliente, equipo, sitio web/redes). La pestaña vive en la URL (`?infoTab=`, se omite para Resumen); los nombres viejos se mapean (`info`→`ajustes`, `reportes`→`horas`, `LEGACY_TABS`) para no romper los links de Marketing/Preferencias/buscador. **Resumen** responde "¿cómo está esta cuenta?": columna principal con Situación de la cuenta (autoguardado), "Necesita atención" (bloqueadas con motivo), "Trabajando ahora" (tareas `IN_PROGRESS`) y Última reunión (pendientes abiertos); columna lateral con Horas del mes vs contratadas (`GET .../reports/hours-history?months=1`), Contenido (`GET /contenido/projects/:id/summary`, solo con flag + `moduleAccess.contenido`), Links, Equipo y Servicios — cada bloque lleva a su pestaña (`goTab(key, { status })`, que también preselecciona el filtro de Tareas). **Header:** estrella de destacado (mismo `PATCH /projects/:id/star` que Mis Proyectos), pulso en línea (activas · en curso · bloqueadas → Tareas filtrada · avatares del equipo · "Activo desde") y atajos a Marketing/Contenido + botón primario "+ Nueva tarea", que abre el MISMO modal global (`bliss:open-add-task`, ya con el proyecto por `bliss:project-context`); Chat sigue solo en el botón flotante (`FloatingDock`). Resumen suma **Próxima reunión** (Calendario, si el flag + `moduleAccess.calendario`: `GET /calendar/events?projectId=` próximas 2 semanas) y, en Horas, "+ Xm en tareas abiertas" (las horas se registran al completar, igual que Reportes). **Tareas** (`tareas.jsx`): chips de filtro por estado con conteo (los vacíos se ocultan), activas agrupadas por persona y el historial de completadas plegable. Crear una tarea desde el modal global dispara `bliss:task-created` y la ficha recarga; "crear tarea desde un archivo" de la Nube abre ese mismo modal con `bliss:open-add-task` `{ detail: { description } }` (GlobalShortcuts lo pasa como `defaultDescription`). Primitivas visuales compartidas en `pages/project-detail/ui.jsx` (`Card`, `CardHeader`, `AvatarStack`, `StatusBadge`…), también usadas por las tarjetas de Mis Proyectos (pie con avatares del equipo + servicios + integraciones).


**Briefs (ficha del proyecto):** Cuestionarios de relevamiento del cliente por proyecto (modelo `ProjectBrief`, una fila por `(projectId, type)`, `answers` JSON `{ fieldKey: value }`). Se completan **modularmente** — no hace falta llenar todos los briefs ni todos los campos. Siete tipos: `memoria` (notas libres del cliente, va primero — un único campo de texto alto, `big: true`; siempre visible), `marca` (documento madre, transversal, se completa una sola vez; siempre visible), `organico`, `meta_ads`, `web`, `seo_sem`, `crm` (los 5 últimos son por servicio, se agregan con "+ Agregar brief" y asumen Marca ya completo). `memoria` y `marca` están en `ALWAYS` (siempre en la grilla); el resto solo si fue agregado. Catálogo de tipos en `backend/src/lib/briefCatalog.js` (solo valida `type`) con espejo de preguntas/campos en `frontend/src/components/briefs/briefCatalog.js` (secciones + campos `{ k, q, short? }`; las claves `k` solo necesitan ser únicas dentro de cada brief). CRUD bajo `/api/projects/:id/briefs` (`briefs.controller.js`): `GET` lista (abierta a cualquier miembro del workspace) + `PUT .../:type` upsert + `DELETE .../:type` elimina la fila (ambas escrituras: admin/owner o miembro del proyecto — mismo criterio que `saveInfo`); el controller descarta valores vacíos antes de persistir. El editor (`BriefEditor`) tiene botón "Eliminar" con modal de confirmación; borrar un brief lo saca de la grilla (el de Marca, siempre visible, queda reseteado a vacío). UI: pestaña **Briefs** en `ProjectDetail.jsx` (componente `ProjectBriefs.jsx`) — grilla de 6 tarjetas con progreso (`X/Y campos`, pill Sin empezar / En progreso / Completo; "Completo" = ≥80% de campos respondidos) → editor master-detail por brief con guardado independiente. No depende del feature flag `marketing`. La sección se puede apagar globalmente con `Project.briefsEnabled` (default `true`) desde Preferencias → Globales → Proyectos, igual que `linksEnabled`/`situationEnabled`/`hoursEnabled` (toggle global aplicado a todos los proyectos vía `updateMany` en `saveGlobalSettings`); con `briefsEnabled=false` la pestaña no se muestra.

**Reuniones del proyecto (ficha del proyecto):** Registro de reuniones por proyecto (modelos `ProjectMeeting` + `ProjectMeetingTodo` + `ProjectMeetingParticipant`), con formato similar a la reunión L10 de EOS Tracción pero **sin puntaje** y **con cronómetro de duración que cuenta tiempo a los participantes**. Cada `ProjectMeeting` es un evento con `date` (`YYYY-MM-DD`), `title` (String? opcional, ≤120 chars — para identificarla entre varias; si está, la card lo muestra como encabezado con la fecha en chico al lado), `type` (`internal` = equipo | `client` = cliente), `notes` (HTML del editor de notas libres), y un cronómetro: `startedAt`/`endedAt`/`durationMins`. Cada reunión tiene `ProjectMeetingTodo[]` (tareas con responsable) y `ProjectMeetingParticipant[]` (asistentes).

**Participantes + tiempo (la reunión funciona como una tarea):** Se agregan participantes a la reunión (cualquier miembro activo del workspace; el selector agrupa equipo del proyecto / otros). **Quien crea la reunión queda agregado como participante por defecto** (`createMeeting` inserta un `ProjectMeetingParticipant` para `req.user.userId` si es miembro activo; idempotente). **Solo editables antes de iniciar** (una vez iniciada, el grupo queda fijo). Al **Iniciar** (`POST .../start`): primero valida que **ningún participante tenga una tarea `IN_PROGRESS`** (si alguno tiene, devuelve 409 nombrando a quién — apoyado además en el constraint DB `one_active_task_per_user`); luego crea una `Task` `IN_PROGRESS` por participante en el proyecto (descripción `Reunión de equipo`/`Reunión con cliente`) + su `TaskSession`, y guarda el FK `ProjectMeetingParticipant.taskId`. Esa tarea hace que el participante aparezca **en Actividad** ("en reunión") y ocupa su slot de tarea activa (no puede correr otra durante la reunión). Al **Finalizar** (`POST .../finish`): completa esas tareas (cierra `TaskSession` + `completedAt`) y congela `durationMins`; el tiempo queda **sumado al proyecto** y en el historial como tarea completada (cuenta en Productividad/Reportes vía `taskWorkedMinutes`). Una reunión finalizada es un registro cerrado (no hay "reiniciar"). Si un participante completa/pausa su tarea desde su propio dashboard, corta su tiempo antes; `finish` saltea las que ya no estén `IN_PROGRESS`. Iniciar/reanudar/completar una tarea sincroniza el to-do vinculado (`projectMeetingTodo`), no al participante. **Vínculo To-Do ↔ tarea del dashboard — automático, siempre al proyecto de la reunión:** a diferencia de EOS L10 (envío manual con botón), acá no hay ningún botón "enviar al dashboard" ni indicador de estado en la UI. Al **Finalizar** la reunión (`closeMeeting` en `lib/projectMeetingLifecycle.js`, común al cierre manual y al auto-cierre), cualquier to-do que tenga responsable y todavía no tenga tarea vinculada se envía solo (`sendOwnedTodosToDashboard` → `createDashboardTaskForTodo`: crea la `Task` en este proyecto para el responsable y guarda el FK `ProjectMeetingTodo.taskId`, uno a uno, `@unique`, `onDelete: SetNull`; salteando dueños que ya no son miembros activos, best-effort por to-do para no frenar el cierre). Un to-do **sin responsable** en ese momento no genera tarea — queda esperando. La sincronización sigue viva después del cierre, en `PATCH .../todos/:tid` (`updateTodo`/`syncDashboardOnOwnerChange` en `projectMeetings.controller.js`): si la reunión ya terminó y **se le asigna responsable** a un to-do que no tenía tarea, se crea en ese momento; si **cambia el responsable** de un to-do cuya tarea sigue `PENDING` (no empezada), la tarea se **mueve** de dashboard (actualiza `userId`+`workDayId`, notifica al nuevo); si **se le saca el responsable** a un to-do con tarea `PENDING`, la tarea se **borra** (vuelve a "sin enviar"); una tarea ya `IN_PROGRESS`/`COMPLETED` nunca se toca (no se pierde lo ya trabajado). También se auto-envía un to-do creado con responsable después de que la reunión ya terminó (`createTodo`). Completar la tarea vinculada tilda el to-do, iniciarla/reanudarla lo destilda (mismo `updateMany` por `taskId` en `completeTask`/`startTask`/`resumeTask` de `tasks.controller.js`, junto al de `eOSTodo`) — el checkbox del to-do es el único indicador de estado, no hay badge aparte. CRUD bajo `/api/projects/:id/meetings` (`projectMeetings.controller.js`): `GET` lista (cualquier miembro del workspace) + el resto de escrituras (crear/editar/borrar reunión, start/finish, CRUD de to-dos) requieren **admin/owner o miembro del proyecto** (helper `canWrite`, mismo criterio que `saveSituation`/briefs). UI: pestaña **Reuniones** en `ProjectDetail.jsx` (componente `frontend/src/components/meetings/ProjectMeetings.jsx`) — lista de tarjetas colapsables (la más reciente abierta), cada una con fecha, tipo, cronómetro vivo (tick client-side mientras `running`), notas (`RichTextEditor`) y to-dos. No depende de ningún feature flag ni toggle (siempre visible, como la pestaña Info). Cascada: borrar el proyecto elimina sus reuniones y, en cascada, sus to-dos.

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


**Admin panel deep linking:** `Admin.jsx` reads `?tab=` query param on mount. Valid tabs: `projects`, `team`, `services`, `roles`, `role-ai`, `legajo`, `empresa`. Falls back to `'projects'`.

**Preferences:** For admins, shows two tabs — **Globales** (workspace settings: timezone, project settings, **seguimiento de horarios/puntualidad** vía `attendanceTrackingEnabled`) and **Personales** (AI feature toggles). El editor de módulos (encendido/apagado, acceso por rol, y config propia de cada uno — pestañas visibles de Marketing, proyecto de reuniones de EOS, acumulación de vacaciones de RRHH) vive en su propia tab **Módulos** (`preferences/modules.jsx`) — para Ventas/Marketing/Contenido/RRHH suma el editor de acceso por rol (ver concepto "Acceso a módulos por rol"); EOS y Gamification quedan afuera de ese editor, admin-only fijo. Non-admins see only the personal view without the modules tab. Bajo el toggle del módulo `eos` (cuando está habilitado) hay un selector **"Proyecto para tareas y reuniones de EOS"** que persiste `EOSData.meetingProjectId` vía `PATCH /api/eos` — es el proyecto donde se registran las tareas de las reuniones L10 y los To-Dos enviados al dashboard (ver "EOS module → Tracción"). Bajo el toggle del módulo `rrhh`, un bloque propio configura la **acumulación automática de vacaciones** (ver concepto "RRHH panel" → Vacaciones): toggle + "se agregan N días cada [mes/trimestre/semestre/año]", persistido en `Workspace.vacationAccrual*` vía `PATCH /api/projects/settings`.


**Backlog:** `isBacklog Boolean @default(false)` on Task. Backlog tasks are hidden from the main focus view. `add-to-today` sets `isBacklog=false` and moves to today's workday. The insight context labels backlog tasks as "planificación semanal, no son prioridad inmediata."

**Tareas futuras y recurrentes:** Dos opciones al crear una tarea (toggles debajo del botón en `AddTaskModal.jsx`, mutuamente excluyentes). Comparten una primitiva: `Task.scheduledFor String?` (fecha de aparición `"YYYY-MM-DD"`; null = tarea normal/ya activa). Mientras `scheduledFor > hoy` la tarea **no** aparece en foco/backlog/carry-over/delegadas/realtime/proyecto — se excluye con el predicado `scheduledFor IS NULL OR scheduledFor <= hoy` en todas las consultas que listan tareas. La tarea futura igual necesita un `workDayId` (NOT NULL): se engancha como placeholder al workday del día de creación y se filtra hasta su fecha.
- **Tarea futura (one-off):** `POST /tasks` con `scheduledFor`. Si la fecha es ≤ hoy se trata como tarea normal. Aparece en la pestaña **Programadas** del panel "Más tarde" del dashboard, con botón "Traer a hoy" (`PATCH /tasks/:id/bring-to-today` → limpia `scheduledFor`, la engancha al workday de hoy).
- **Tarea recurrente:** modelo `TaskRecurrence` (plantilla: `frequency` daily|weekly|monthly|annual, `weekdays` JSON `[0-6]` solo weekly — **multi-día**, `dayOfMonth`/`month` derivados de `startDate`, `endDate` null = nunca, `lastSpawnedDate`). `POST /tasks` con `recurrence {frequency, weekdays, endDate}` crea la plantilla + materializa la primera ocurrencia. Cada instancia es un `Task` con `recurrenceId` + `scheduledFor`. No tienen sección propia: aparecen en el flujo normal con un badge 🔁 (`TaskCard`).
- **Materialización perezosa:** `getOrCreateToday` llama a `materializeForUser` (en `recurrence.service.js`): (a) **activa** las tareas vencidas (`scheduledFor <= hoy` → workday de hoy, `scheduledFor=null`) y (b) **rellena** la próxima ocurrencia de cada recurrencia activa (a lo sumo una por adelantado, **sin backfill** de ocurrencias perdidas). TZ-correcto por workspace, sin cron. Aislado en su propio try para no romper el dashboard. Lógica de fechas pura y testeada en `recurrence.service.test.js` + `recurrenceMaterialize.test.js`.
- **No completadas se acumulan:** una instancia que no se completó queda como carry-over normal; la generación de la próxima ocurrencia no depende de que la anterior se complete.
- **Editar/borrar con scope:** `PATCH /tasks/:id?scope=series` y `DELETE /tasks/:id?scope=series`. `series` en editar actualiza la plantilla + instancias futuras no completadas; en borrar elimina la plantilla (las instancias completadas conservan el historial vía `onDelete: SetNull`) + las instancias no completadas. `TaskCard` muestra el modal "Solo esta / Esta y todas las siguientes" cuando `recurrenceId != null`.


**AI insight context — backlog separation:** Backlog tasks are explicitly separated from pending tasks in the Claude prompt to prevent suggesting their removal.


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
- `ContentPiece.status`/`type` son `String` (no enum de Prisma) a propósito: el workflow vive en el catálogo de código `backend/src/lib/contentCatalog.js`, agregar/renombrar un estado es un cambio de catálogo, no una migración de tipo. `ContentPiece.scheduledDate` es un `"YYYY-MM-DD"` **denormalizado** en `Project.timezone` (mismo criterio que `WorkDay.date`) — nunca se calcula en el frontend.
- `ClientPortalContact` **no es un `User`** — es la identidad del cliente en el portal (login OTP, `canApprove`). Por eso `ContentPiece.approvedByContactId`, `ContentStatusEvent.actorContactId` y `ContentComment.authorContactId` son FKs a `ClientPortalContact`, no a `User`, y `Notification.actorId` (que sí apunta a `User`) es nullable para las notificaciones que origina el cliente.
- Migrations live in `backend/prisma/migrations/`. Always use `migrate dev` locally and `migrate deploy` in production.
- `prisma migrate dev` fails in non-interactive shells. Workaround: manually create the migration directory + SQL file, then run `prisma migrate deploy` + `prisma generate`.

- Historial completo de migraciones (en orden, con descripción de cada una): `docs/claude/migrations.md`. Para el estado actual, `git log`/la carpeta `backend/prisma/migrations/` es la fuente autoritativa.
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
/marketing        → Marketing.jsx        (PrivateRoute) — `?tab=&sub=&view=&projectId=`. Secciones (`marketingNav.js` NAV): Prioridades (panel de Conexiones + hallazgos) · GEO / SEO (Diagnóstico [vistas GEO/SEO/On-Page/Canibalización] · Keywords y oportunidades · Contenido SEO [Content Brief/Content Gap]) · Web · RRSS · Anuncios · Informes. Los ids viejos de sub-pestaña (`geo`, `seo`, `onpage`, `canibalizacion`, `content-gap`, `plan`) se reescriben vía `LEGACY_SUB_MAP`.
/contenido        → Contenido.jsx        (PrivateRoute) — requiere feature flag `contenido`. Calendario de contenido: vistas Calendario/Tabla/Kanban + modal de detalle, selector de proyecto y estado en la URL (`?view=&projectId=&month=&piece=&status=&network=`)
/calendario       → Calendario.jsx       (PrivateRoute) — requiere feature flag `calendario`. Disponibilidad del equipo: vistas Mi semana/Equipo/Mes en la URL (`?view=&date=&people=`), conexión personal con Google Calendar (push)
/report/:token    → ReportOrClientPortal.jsx  (pública, sin auth) — despacha por formato de `:token`: UUID → `ReportPublic.jsx` (informe mensual individual); slug corto → `ClientPortal.jsx` (portal de cliente: Informes, Briefs, Contenido, Datos en vivo)
/report-print/:printToken → ReportPrint.jsx (pública, sin UI de navegación) — portada + informe en formato A4; SOLO la abre el render de PDF del backend con un token de impresión de vida corta
/oauth            → OAuthPopup.jsx       (pública) — popup OAuth (Google/Meta/TikTok)
/auth             → AuthCallback.jsx     (pública) — callback de Google Sign-In
/oauth-result     → OAuthResult.jsx      (pública) — puente de callback OAuth: postMessage al opener y cierra popup
/billing          → Billing.jsx          (PrivateRoute) — visible para todos; acciones solo admin/owner
/reports             → Reports.jsx          (AdminRoute)
/admin               → Admin.jsx            (AdminRoute)  — ?tab= query param
/admin/rrhh          → RRHH.jsx             (RRHHRoute)   — secciones Hoy · Personas · Ausencias (?view=calendario|solicitudes|saldos) · Asistencia · Productividad; los ?tab= viejos se redirigen. Requiere feature flag `rrhh`; acceso configurable por rol (admin/owner siempre, ver "Acceso a módulos por rol") — a diferencia de EOS/Gamification.
/admin/eos           → EOS.jsx              (AdminRoute)  — 7 tabs: Visión, Personas, Datos, Asuntos, Procesos, Tracción, Evaluación. Requiere feature flag `eos`. Estrictamente isAdmin, sin acceso configurable por rol.
/admin/gamification  → Gamification.jsx     (AdminRoute)  — CRUD de juegos/desafíos (admin). Requiere feature flag `gamification`. Estrictamente isAdmin, sin acceso configurable por rol.
/ventas              → Ventas.jsx           (SalesRoute — admin o user.isSales)  — CRM. Feature flag `ventas`. Tabs Dashboard/Empresas; vista del Lead vía ?lead=id
/admin/ventas        → Ventas.jsx           (AdminRoute)  — mismo componente, entrada de Ventas para admins (link en "Módulos")
/superadmin          → SuperAdmin.jsx        (SuperAdminRoute — requiere isSuperAdmin)
```

### Cron jobs (`backend/src/index.js`)

| Schedule | Timezone | Descripción |
|----------|----------|-------------|
| `1 0 * * 5` (viernes 00:01) | ART | Envía resúmenes semanales de IA por email a todos los miembros |
| `0 0 * * 6` (sábados 00:00) | ART | Actualiza perfil de memoria de insights por usuario |
| `0 1 1 * *` (1° mes 01:00) | ART | **Cadena mensual de snapshots** (`MONTHLY_CHAIN`, secuencial): GEO → GA4 → GSC+DomainRating → PageSpeed → keywords → Instagram → TikTok → YouTube → LinkedIn → Facebook → Ads → competidores → métricas RRHH → **alertas SEO** (`checkAndSendAllSeoAlerts`, compara snapshots del mes cerrado vs anterior y avisa a admins/owners solo si hay alertas). Todos del mes anterior. Cada job aislado en su try/catch; un fallo no corta la cadena. |
| `0 6 * * 1` (lunes 06:00) | ART | Actualiza rankings de keywords del mes actual (upsert semanal) |
| `0 8 * * 1` (lunes 08:00) | ART | Aviso semanal de Productividad por mail a admins/owners (solo si hay personas en alerta) |
| `0 8 * * *` (diario 08:00) | ART | Recordatorios de Ventas: email al responsable con próximas acciones para hoy/vencidas (solo workspaces con flag `ventas`, dedup diario) |
| `5 8 * * *` (diario 08:05) | ART | Motor de reglas de WhatsApp: reabre conversaciones vencidas con plantillas según criterios configurados (solo workspaces con flags `ventas` **y** `whatsapp`) |
| `0 2 * * *` (diario 02:00) | ART | Acumulación automática de vacaciones (regla "+N días cada M meses" por aniversario de ingreso, solo workspaces con `vacationAccrualEnabled`) |
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
      attendance.test.js                  # inArrivalWindow (ventana ±2h) + laborableDays (regla del >50%) + loginMinsFromMidnight
      eosAutoScorecard.service.test.js    # métricas automáticas del Scorecard EOS: tardanzas (top 3 días/min, tolerancia), ocupación (ponderada, licencias, sin horario) + mensuales (delta_horas, proyectos nuevos/perdidos, equipo, mes vencido)
      linkedinScrape.test.js              # parseLinkedinCompany (URL/slug/showcase) + computeLinkedinScrapeMetrics (filtro por mes, totales, engagement rate por seguidores, campos null del scraping)
      facebookScrape.test.js              # parseFacebookPage (URL/slug/profile.php) + computeFacebookScrapeMetrics (filtro por mes, totales, engagement rate por seguidores, campos null del scraping)
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
- **Backend:** Railway (auto-runs `npm run db:migrate` on deploy; seed must be run manually once). Required env vars: `DATABASE_URL`, `JWT_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM`, `APP_DOMAIN`, `GOOGLE_CLIENT_ID`, `ANTHROPIC_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID`, `GOOGLE_CLIENT_SECRET`, `ENCRYPTION_KEY`, `BACKEND_URL`, `PAGESPEED_API_KEY`, `META_APP_ID`, `META_APP_SECRET`, `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`, `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`, `APIFY_API_TOKEN` (opcional — habilita el scraping de RRSS), `R2_ACCOUNT_ID` + `R2_ACCESS_KEY_ID` + `R2_SECRET_ACCESS_KEY` + `R2_BUCKET` + `R2_PUBLIC_BASE` (opcionales — habilitan object storage Cloudflare R2 para las imágenes sociales; sin ellas se guardan como bytes en la DB), `GIPHY_API_KEY` (opcional — habilita el envío de GIFs en el Chat interno; sin ella, el resto del chat funciona igual).
- **PDF de informes (Chromium):** el backend corre `@sparticuz/chromium` (~60 MB) + `puppeteer-core` para `GET .../reports/:month/pdf`. Necesita **Node ≥ 20.11** y memoria libre para Chromium (~300–500 MB por render, uno a la vez). La primera llamada tras un deploy extrae el binario a `/tmp` (unos segundos extra). El contenedor necesita salida a internet (fuentes de Google, emoji de jsDelivr y la propia SPA en Vercel).
- **Scripts de utilidad:** `backend/scripts/` — scripts de uso único para operaciones directas en DB (ej: `insert-meta-ads-token.js`, `create-test-user.js`). Ejecutar con `DATABASE_URL=... ENCRYPTION_KEY=... node scripts/<nombre>.js`.
- **Frontend:** Vercel Pro (root: `/frontend`; `vercel.json` rewrites: `/report/:token` → la función serverless `api/report-og.js` (Open Graph dinámico por informe), el resto → `index.html`). Add `*.blisstracker.app` as Custom Domain. Required env vars: `VITE_API_URL`, `VITE_GOOGLE_CLIENT_ID`. `VITE_API_URL` debe estar disponible también en **runtime de Functions** (no solo en build) porque `api/report-og.js` la usa para pegarle al backend — en Vercel las env vars aplican a Build + Functions salvo que se restrinja el scope; verificar que no esté limitada solo a Build.
- **DNS (Cloudflare):** `A blisstracker.app → Vercel` + `A *.blisstracker.app → Vercel` (wildcard requires Vercel Pro).
- **Backend CORS:** `app.js` allows `*.blisstracker.app` via regex — do not hardcode a single origin.
- **Stripe webhook:** must point to `https://<railway-backend-url>/api/billing/webhook`. Events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_succeeded`, `invoice.payment_failed`. Accepts all events — unhandled ones are silently ignored.
- **`bliss` workspace:** permanently exempt from billing. Set `status = 'active'` via SuperAdmin → Workspaces. No Stripe subscription ever created; cron and webhooks never affect it.



### Ver también
- Listado completo de rutas de la API: `docs/claude/api-routes.md`.
- Setup de OAuth (Google/Meta/TikTok/LinkedIn), redirect URIs, scopes y permisos requeridos: `docs/claude/integrations-oauth.md`.
