# API routes — referencia completa

> Parte de la documentación modular de BlissTracker. No se carga automáticamente en cada sesión de Claude Code — este archivo se lee bajo demanda cuando la tarea toca este módulo. Índice completo en `CLAUDE.md` (raíz).

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
GET    /api/workspaces/current/module-access         # admin: acceso por rol resuelto de los 4 módulos (ventas/marketing/contenido/rrhh) — EOS/Gamification no aplican, admin-only fijo
PATCH  /api/workspaces/current/module-access/:key     # admin: { allMembers, roles } — actualiza el acceso de un módulo

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
POST   /api/tasks/:id/comments/:commentId/reactions  # body { emoji }, toggle por (comentario, usuario, emoji)
GET    /api/tasks/:id/attachments                    # adjuntos linkeados (ProjectFile ya confirmados)
POST   /api/tasks/:id/attachments/presign            # { name, mimeType, sizeBytes } — carpeta "Tareas/<mes>/<tarea>" resuelta sola
POST   /api/tasks/:id/attachments/:fileId/confirm    # valida tamaño real + magic bytes, crea el vínculo TaskFile
DELETE /api/tasks/:id/attachments/:fileId            # saca el vínculo (el archivo sigue en Archivos del proyecto)

GET    /api/projects                     # todos los proyectos activos del workspace (incluye starred del usuario)
PUT    /api/projects/:id                 # admin: editar nombre, websiteUrl, connections, serviceIds, memberIds
PATCH  /api/projects/:id/star            # toggle destacado del proyecto para el usuario actual (preferencia personal)
GET    /api/projects/:id/members
GET    /api/projects/:id/tasks
GET    /api/projects/:id/completed       # ?skip=N
PUT    /api/projects/:id/links
GET    /api/projects/:id/briefs           # lista briefs del proyecto (cualquier miembro del workspace)
PUT    /api/projects/:id/briefs/:type     # upsert respuestas de un brief (admin/owner o miembro del proyecto)
DELETE /api/projects/:id/briefs/:type     # elimina el brief (mismo criterio de escritura)
GET    /api/projects/:id/client-portal                       # config del portal de cliente + contactos
PUT    /api/projects/:id/client-portal                       # upsert: slug, active, contentEnabled, liveSections
DELETE /api/projects/:id/client-portal                        # elimina el portal (corta el acceso del cliente)
GET    /api/projects/:id/client-portal/contacts               # lista contactos autorizados
POST   /api/projects/:id/client-portal/contacts               # agrega contacto { email, name?, canApprove? }
PATCH  /api/projects/:id/client-portal/contacts/:cid          # { name?, canApprove?, active? }
DELETE /api/projects/:id/client-portal/contacts/:cid
GET    /api/projects/:id/meetings                            # lista reuniones + miembros (cualquier miembro del workspace)
POST   /api/projects/:id/meetings                            # crea reunión (date?, type?) — admin/owner o miembro del proyecto
PATCH  /api/projects/:id/meetings/:mid                       # edita reunión (date?, type?, notes?)
DELETE /api/projects/:id/meetings/:mid                       # elimina reunión (cascada to-dos)
POST   /api/projects/:id/meetings/:mid/start                 # inicia: crea Task IN_PROGRESS por participante (409 si alguno tiene tarea en curso)
POST   /api/projects/:id/meetings/:mid/finish               # finaliza: completa las tareas de los participantes + congela durationMins + envía al dashboard los to-dos con responsable sin tarea
POST   /api/projects/:id/meetings/:mid/participants          # agrega participante (body { userId }) — solo antes de iniciar
DELETE /api/projects/:id/meetings/:mid/participants/:uid     # quita participante — solo antes de iniciar
POST   /api/projects/:id/meetings/:mid/todos                 # agrega tarea (title, ownerId?) — si la reunión ya terminó y nace con responsable, va directo al dashboard
PATCH  /api/projects/:id/meetings/:mid/todos/:tid            # edita tarea (title?, done?, ownerId?) — si la reunión ya terminó, cambiar el responsable crea/mueve/borra la tarea del dashboard
DELETE /api/projects/:id/meetings/:mid/todos/:tid            # elimina tarea
GET    /api/realtime
GET    /api/search                       # ?q= (mín. 2 caracteres) — buscador global: { tasks, pieces, events, files }, cada bloque filtrado por flag/acceso de su módulo
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

# Push notifications (app mobile — ver mobile/CLAUDE.md)
POST   /api/devices/register                      # body: { token, platform } — registra/refresca el Expo Push Token del dispositivo
DELETE /api/devices/register                      # body: { token } — deja de mandarle push (logout desde la app)

# Vacaciones y licencias — requiere feature flag 'rrhh'; rutas /admin/* requieren
# además acceso al módulo (moduleAccessGuard('rrhh'), admin/owner siempre pasa)
GET    /api/vacation/my                           # saldo + solicitudes propias (autoservicio, sin moduleAccessGuard)
POST   /api/vacation/my/request                  # crear solicitud (≥48h anticipación)
PATCH  /api/vacation/admin/adjust/:userId         # ajustar saldo de días
GET    /api/vacation/admin/adjustments/:userId    # historial de ajustes
GET    /api/vacation/admin/requests               # listar todas las solicitudes
PATCH  /api/vacation/admin/requests/:id          # aprobar o rechazar
PATCH  /api/vacation/admin/requests/:id/edit     # editar una solicitud ya existente (incluso revisada)

# Beneficios (horas libres / días home) — mismo criterio de flag/acceso que Vacaciones
GET    /api/benefits/my                           # saldos + solicitudes propias (autoservicio, sin moduleAccessGuard)
POST   /api/benefits/my/request                  # { bank, amount, date, reason? } crea solicitud pending
GET    /api/benefits/admin/balances               # ?bank=horas_libres|dias_home — lista miembros + saldo, desc
PATCH  /api/benefits/admin/balances/:userId       # { bank, newBalance, description } otorgar/ajustar a mano
GET    /api/benefits/admin/adjustments/:userId    # ?bank= historial de ajustes
GET    /api/benefits/admin/requests               # ?bank=&status= listar solicitudes
PATCH  /api/benefits/admin/requests/:id           # { status, reviewNote? } aprobar (resta el saldo) o rechazar

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
POST   /api/eos/traction/todos/:id/send-to-dashboard   # crea + vincula una Task del dashboard al responsable (body { projectId? }; sin projectId usa EOSData.meetingProjectId); completarla tilda el To-Do
PUT    /api/eos/traction/meetings/:week          # upsert datos de la reunión L10 (date/notes/type — sin rating)
POST   /api/eos/traction/meetings/:week/participants        # agrega participante (body { userId }); crea la reunión si falta; solo antes de iniciar
POST   /api/eos/traction/meetings/:week/participants/from-project  # agrega a todo el equipo del proyecto de EOS configurado (idempotente)
DELETE /api/eos/traction/meetings/:week/participants/:uid   # quita participante (solo antes de iniciar)
POST   /api/eos/traction/meetings/:week/start    # inicia: crea Task IN_PROGRESS por participante en EOSData.meetingProjectId (409 si alguno tiene tarea en curso; 400 NO_MEETING_PROJECT sin proyecto)
POST   /api/eos/traction/meetings/:week/finish   # finaliza: completa esas tareas + congela durationMins
GET    /api/eos/assessment                       # ronda actual + mis respuestas + historial
POST   /api/eos/assessment/start                 # admin: abrir nueva ronda
POST   /api/eos/assessment/rounds/:id/response   # enviar respuestas (upsert)
POST   /api/eos/assessment/rounds/:id/close      # admin: cerrar ronda + generar análisis IA

# Chat interno — abierto a cualquier miembro activo del workspace (sin membership de canal),
# salvo canales con isPrivate=true (solo admin/owner, chequeado dentro de cada controller)
GET    /api/chat/channels                        # lista canales (materializa #general + canales de proyecto si faltan) con no-leídos/menciones; excluye privados para no-admins
POST   /api/chat/channels                         # admin: crea canal custom
PATCH  /api/chat/channels/:id                     # admin: edita canal custom (kind='custom' únicamente)
PATCH  /api/chat/channels/:id/privacy             # admin: togglea isPrivate — cualquier kind (general/project/custom)
DELETE /api/chat/channels/:id                     # admin: elimina canal custom (kind='custom' únicamente)
GET    /api/chat/channels/:id/messages            # ?before=<messageId>&limit=50 — paginado por cursor; 403 CHANNEL_PRIVATE si el canal es privado y no sos admin
GET    /api/chat/channels/:id/pinned              # lista mensajes fijados del canal (mismo gating de privacidad)
POST   /api/chat/channels/:id/messages            # envía mensaje (content y/o gifUrl), resuelve @menciones
POST   /api/chat/channels/:id/read                # marca el canal como leído + limpia menciones pendientes de ese canal
PATCH  /api/chat/messages/:messageId              # autor: edita su mensaje
DELETE /api/chat/messages/:messageId              # autor, o admin/owner (moderación): elimina el mensaje
PATCH  /api/chat/messages/:messageId/pin          # body { pinned }, cualquier miembro activo: fija/desfija el mensaje
POST   /api/chat/messages/:messageId/reactions    # body { emoji }, cualquier miembro activo: toggle de reacción por (mensaje, usuario, emoji)
GET    /api/chat/gifs/search                      # ?q= — proxy a Giphy (503 GIFS_NOT_CONFIGURED sin GIPHY_API_KEY)
GET    /api/chat/gifs/trending                    # proxy a Giphy trending

# Ventas (CRM) — requiere feature flag 'ventas' (front) + salesGuard (admin o equipo comercial)
GET    /api/ventas/dashboard                     # tarjetas + acciones hoy/vencidas
GET    /api/ventas/metrics                        # forecast ponderado + win rate + embudo + ranking + orígenes
GET    /api/ventas/team                           # responsables comerciales asignables (admins + roles con acceso al módulo)
GET    /api/ventas/companies                      # ?search=
POST   /api/ventas/companies
GET    /api/ventas/companies/:id
PATCH  /api/ventas/companies/:id
DELETE /api/ventas/companies/:id                  # cascada: contactos + leads
GET    /api/ventas/contacts                       # ?companyId=
POST   /api/ventas/contacts
PATCH  /api/ventas/contacts/:id
DELETE /api/ventas/contacts/:id
GET    /api/ventas/leads                           # ?status=&ownerId=&origin=&from=&to=&search=&archived= (archived ausente = solo activos; 'true' = solo archivados)
POST   /api/ventas/leads                           # empresa/contacto inline opcional (newCompany/newContact)
GET    /api/ventas/leads/:id                       # detalle: empresa+contactos, timeline, propuestas, investigaciones
PATCH  /api/ventas/leads/:id                       # campos generales
DELETE /api/ventas/leads/:id
PATCH  /api/ventas/leads/:id/status                # { status, lostReason? } — loguea status_changed
PATCH  /api/ventas/leads/:id/owner                 # { ownerId } — loguea owner_changed + notifica LEAD_ASSIGNED
PATCH  /api/ventas/leads/:id/archive               # { archived, reason? } — archiva/desarchiva (fuera del Pipeline/lista principal, sin borrar; sin restricción de estado); reason opcional, solo al archivar
POST   /api/ventas/leads/:id/actions               # { title, dueAt?, ownerId? } — agrega próxima acción (ownerId default: quien la crea)
PATCH  /api/ventas/leads/:id/actions/:actionId/resolve  # marca resuelta (queda en el historial) + completa su tarea vinculada si tiene
DELETE /api/ventas/leads/:id/actions/:actionId
POST   /api/ventas/leads/:id/notes                 # { content } — nota manual del timeline
DELETE /api/ventas/leads/:id/notes/:noteId         # autor o admin
POST   /api/ventas/leads/:id/convert               # { name?, serviceIds?, memberIds? } — crea Proyecto (projects.service) + vincula
POST   /api/ventas/leads/:id/research              # dispara investigación IA async de la empresa → { researchId }
GET    /api/ventas/leads/:id/research              # investigación más reciente (para polling)
POST   /api/ventas/leads/:id/research/:researchId/report   # { instructions? } — genera/regenera el informe de diagnóstico para el cliente (IA, Sonnet)
PATCH  /api/ventas/leads/:id/research/:researchId/report   # { title?, html? } — edición manual del informe ya generado
GET    /api/ventas/leads/:id/proposals             # lista de propuestas (versiones)
POST   /api/ventas/leads/:id/proposals             # { plans: [{ label?, price?, currency?, serviceIds?, serviceNames? }], objectives? } — genera propuesta con IA (HTML)
PATCH  /api/ventas/leads/:id/proposals/:pid        # { content?, title?, status? } — editar/confirmar
DELETE /api/ventas/leads/:id/proposals/:pid

# WhatsApp — motor de reglas de reactivación automática (admin-only, ver concepto homónimo)
# Bot de WhatsApp — entrenamiento (ver concepto "WhatsApp Bot — entrenamiento")
POST   /api/whatsapp/bot/test                       # playground: corre generateBotReply con la config del formulario, sin persistir/mandar nada real
GET    /api/whatsapp/bot/documents                  # lista la base de conocimiento (metadata, sin extractedText/fileData)
POST   /api/whatsapp/bot/documents                  # sube PDF/DOCX/TXT (multipart, campo "file"), extrae el texto una sola vez
DELETE /api/whatsapp/bot/documents/:id
GET    /api/whatsapp/bot/escalations                # panel de calidad: últimos casos donde el bot pasó a un humano

GET    /api/whatsapp/automation-rules              # lista reglas + catálogo (triggerTypes, mergeTokens)
POST   /api/whatsapp/automation-rules              # crea regla
PATCH  /api/whatsapp/automation-rules/:id          # edita regla (o solo { active } para pausar/activar)
DELETE /api/whatsapp/automation-rules/:id
POST   /api/whatsapp/automation-rules/:id/run-now  # corre la regla ya mismo (mismo código que el cron 08:05 ART)

# Contenido (requiere feature flag 'contenido'). Lectura abierta a cualquier
# miembro activo del workspace; las mutaciones validan canWrite() adentro del handler.
GET    /api/contenido/projects/:id/pieces                        # ?from=&to=&status=&network=&ownerId=&q=&skip=&take=
POST   /api/contenido/projects/:id/pieces
GET    /api/contenido/projects/:id/pieces/:pid
PATCH  /api/contenido/projects/:id/pieces/:pid                   # campos parciales; status dispara ContentStatusEvent
DELETE /api/contenido/projects/:id/pieces/:pid
PATCH  /api/contenido/projects/:id/pieces/:pid/position           # { status, order } — drop del Kanban, reindexa la columna
GET    /api/contenido/projects/:id/pieces/:pid/history            # timeline append-only (ContentStatusEvent)
POST   /api/contenido/projects/:id/pieces/:pid/send-to-dashboard  # crea un tramo nuevo (Task) para el responsable ACTUAL; 409 si el tramo anterior sigue IN_PROGRESS
GET    /api/contenido/projects/:id/summary                        # { byStatus, total, awaitingClient } — badges
POST   /api/contenido/projects/:id/request-approval               # { pieceIds? } — email a los contactos que pueden aprobar
POST   /api/contenido/projects/:id/pieces/:pid/assets/presign     # { kind, mimeType, sizeBytes, fileName } → { assetId, uploadUrl }
POST   /api/contenido/projects/:id/pieces/:pid/assets/:aid/confirm  # valida tamaño real (HeadObject) + magic bytes (ranged GET)
POST   /api/contenido/projects/:id/pieces/:pid/assets              # multipart, fallback sin R2 (solo imagen)
PATCH  /api/contenido/projects/:id/pieces/:pid/assets/:aid         # reordenar
DELETE /api/contenido/projects/:id/pieces/:pid/assets/:aid
GET    /api/contenido/projects/:id/pieces/:pid/comments           # hilo completo (internal + client), el front separa por tab
POST   /api/contenido/projects/:id/pieces/:pid/comments           # { body, visibility? } — default 'internal'
DELETE /api/contenido/projects/:id/pieces/:pid/comments/:cid      # autor o admin/owner

# Calendario (requiere feature flag 'calendario'). GET /google/callback es el único
# sin auth (Google redirige el browser directo, no lleva Authorization header).
GET    /api/calendar/events                        # ?from=&to=[&projectId=] — eventos donde soy organizador/participante; con projectId, todas las reuniones de ese proyecto
POST   /api/calendar/events                         # { title, date, startTime, durationMins, projectId, participantIds[], meetLink?, notes?, recurrence? } — projectId obligatorio; con `recurrence: {frequency, weekdays?, endDate?}` crea una CalendarEventRecurrence (serie) en vez de un evento suelto, `date` es la primera ocurrencia
GET    /api/calendar/events/:id
PATCH  /api/calendar/events/:id                     # solo organizador; si cambia horario, resetea invitados a pending y re-notifica (projectId sigue sin poder ser null). `?scope=series` (solo ocurrencias de una serie) edita la plantilla + las ocurrencias futuras ya materializadas sin empezar — estilo Google Calendar "esta y las siguientes"; sin scope solo esta ocurrencia (y no se puede mover su `date` si es parte de una serie)
DELETE /api/calendar/events/:id                     # solo organizador, solo si realMeetingId es null. `?scope=series` cancela esta ocurrencia + las siguientes ya materializadas y termina la serie ahí; sin scope solo esta ocurrencia (deja una CalendarEventException para que la serie no la regenere)
POST   /api/calendar/events/:id/respond             # { status: 'accepted'|'declined' } — el participante. Aceptar una ocurrencia de una serie recurrente acepta automáticamente toda la serie (sin scope). Rechazar acepta `?scope=series` (esta y las siguientes) igual que editar/borrar
POST   /api/calendar/events/:id/start-meeting       # crea/arranca la ProjectMeeting real con los invitados que aceptaron
GET    /api/calendar/availability                   # ?userIds=&from=&to= — bloques ocupados/tentativos por persona
POST   /api/calendar/availability/common-free-slots # { userIds, date, durationMins } — huecos libres en común
GET    /api/calendar/google/auth-url                # inicia la conexión OAuth personal con Google Calendar
GET    /api/calendar/google/callback                # callback OAuth (sin auth)
GET    /api/calendar/google/status                  # { connected, accountEmail }
DELETE /api/calendar/google                         # desconecta Google Calendar

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

# Marketing — YouTube (usa el OAuth de Google con type=google_youtube)
GET    /api/marketing/projects/:id/youtube                  # métricas del mes actual (suscriptores, vistas, videos nuevos largos/shorts)
GET    /api/marketing/projects/:id/youtube/snapshots        # ?months=12
POST   /api/marketing/projects/:id/youtube/snapshots        # body: { month }
DELETE /api/marketing/projects/:id/youtube/snapshots/:month
GET    /api/marketing/projects/:id/youtube/followers        # ?from=YYYY-MM-DD&to=YYYY-MM-DD (suscriptores por día)

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

# Marketing — Facebook (Página)
GET    /api/marketing/integrations/facebook/auth-url        # ?projectId= (Facebook Login oficial)
GET    /api/marketing/integrations/facebook/callback        # callback OAuth (sin auth)
POST   /api/marketing/projects/:id/integrations/facebook/connect-token   # System User Token, body: { accessToken, pageId? }
POST   /api/marketing/projects/:id/integrations/facebook/connect-scrape  # conectar por scraping, body: { url | page }
GET    /api/marketing/projects/:id/facebook                 # métricas del mes actual (modo scrape: snapshot cacheado)
GET    /api/marketing/projects/:id/facebook/snapshots       # ?months=12
POST   /api/marketing/projects/:id/facebook/snapshots       # body: { month }
GET    /api/marketing/projects/:id/facebook/followers       # ?from=YYYY-MM-DD&to=YYYY-MM-DD
POST   /api/marketing/projects/:id/facebook/scrape/refresh  # fuerza scrape fresco (cooldown 30min) — solo integración scrape
GET    /api/marketing/projects/:id/facebook/scrape-debug    # ?page=<url|slug> — diagnóstico: output crudo de Apify + normalizado

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

# Marketing — SEO Fase 1-4 (Oportunidades, Content Brief, On-Page, Content Gap)
GET    /api/marketing/projects/:id/seo/opportunities        # striking distance + content decay + CTR bajo (en vivo, sin IA)
GET    /api/marketing/projects/:id/seo/action-plan          # agrega findings GEO/cannibal/pagespeed/oportunidades priorizados
GET    /api/marketing/projects/:id/content-briefs           # lista content briefs
POST   /api/marketing/projects/:id/content-briefs           # body: { keyword } — genera content brief IA + SERP
GET    /api/marketing/projects/:id/content-briefs/:briefId
DELETE /api/marketing/projects/:id/content-briefs/:briefId
POST   /api/marketing/projects/:id/onpage/audit             # dispara auditoría on-page async, devuelve { auditId }
GET    /api/marketing/projects/:id/onpage/audits            # historial
GET    /api/marketing/projects/:id/onpage/audits/:auditId   # estado + detalle (polling)
DELETE /api/marketing/projects/:id/onpage/audits/:auditId
POST   /api/marketing/projects/:id/content-gap              # body: { keyword } — dispara content gap async
GET    /api/marketing/projects/:id/content-gaps            # lista
GET    /api/marketing/projects/:id/content-gaps/:gapId      # detalle (polling)
DELETE /api/marketing/projects/:id/content-gaps/:gapId

# Marketing — Ads Snapshots
POST   /api/marketing/projects/:id/ads-snapshots            # body: { month, type: "meta_ads"|"google_ads" } — guardar snapshot manual
GET    /api/marketing/projects/:id/ads-snapshots            # ?type=meta_ads|google_ads&months=6 — historial

# Marketing — Vistas cross-proyecto (sin proyecto seleccionado)
GET    /api/marketing/summary/analytics                     # AnalyticsSnapshot más reciente por proyecto, ordenado por sesiones desc
GET    /api/marketing/summary/performance                   # PageSpeedResult más reciente por proyecto, ordenado por score desc
GET    /api/marketing/summary/instagram                     # InstagramSnapshot más reciente por proyecto, ordenado por seguidores desc
GET    /api/marketing/summary/tiktok                        # TikTokSnapshot más reciente por proyecto, ordenado por seguidores desc
GET    /api/marketing/summary/youtube                       # YouTubeSnapshot más reciente por proyecto, ordenado por suscriptores desc
GET    /api/marketing/summary/linkedin                      # LinkedinSnapshot más reciente por proyecto, ordenado por seguidores desc
GET    /api/marketing/summary/facebook                      # FacebookSnapshot más reciente por proyecto, ordenado por seguidores desc
GET    /api/marketing/summary/ads                           # AdsSnapshot más reciente por proyecto, ?type=meta_ads|google_ads, ordenado por spend desc
GET    /api/marketing/summary/reports                       # todos los MonthlyReport del workspace, ?limit=20&offset=0
GET    /api/marketing/summary/seo                           # sitios web del workspace ordenados por Domain Rating (Ahrefs) desc

# Marketing — Informes mensuales (autenticados)
GET    /api/marketing/projects/:id/reports                          # lista informes del proyecto
GET    /api/marketing/projects/:id/report-sections                  # estado por sección (available + integration) para el modal "Generar informe"
GET    /api/marketing/projects/:id/reports/:month                   # obtiene/crea informe (YYYY-MM) — perezoso: agrega datos solo si ya fue generado
PATCH  /api/marketing/projects/:id/reports/:month                   # actualiza notes y analysis
POST   /api/marketing/projects/:id/reports/:month/regenerate        # genera/regenera con body { enabledSections, periodStart?, periodEnd? } (limpia analysis + dataCache)
PATCH  /api/marketing/projects/:id/reports/:month/status            # body { status: 'draft'|'published' } — publica/despublica (solo publicados son visibles por el link)
PATCH  /api/marketing/projects/:id/reports/:month/sections          # body { remove: [keys] } — elimina secciones/grupos del informe generado (sin regenerar): actualiza enabledSections + poda dataCache
GET    /api/marketing/projects/:id/reports/:month/pdf               # PDF del informe (A4 vertical con portada), generado con Chromium headless — ver concepto "PDF del informe"; 404 si el informe no fue generado
POST   /api/marketing/projects/:id/reports/:month/banner            # multipart image — banner del informe (max 5MB)
DELETE /api/marketing/projects/:id/reports/:month/banner            # elimina banner del informe

# Marketing — Objetivos (estructurados, persistentes por proyecto)
GET    /api/marketing/projects/:id/objectives                       # lista objetivos del proyecto
POST   /api/marketing/projects/:id/objectives                       # crea un objetivo (category, metric, periodicity, target + params)
PATCH  /api/marketing/projects/:id/objectives/:oid                  # edita un objetivo
DELETE /api/marketing/projects/:id/objectives/:oid                  # elimina un objetivo

# Informes — acceso público (sin auth)
GET    /api/public/report/:token                            # datos completos del informe + `siblings` (otros informes generados del proyecto, para navegar)
GET    /api/public/report/:token/pdf                        # PDF del informe publicado (mismo render que el equipo), rate limit + cache
GET    /api/public/report/:token/meta                       # metadata liviana (projectName, month, monthLabel, workspaceName, hasBanner) para los Open Graph de Vercel
POST   /api/public/report/:token/feedback                   # el cliente califica el informe (body { name?, rating 1-5, comment? }) — solo informes publicados
GET    /api/public/report-print/:printToken                 # datos del informe para la vista de impresión (token firmado de 3 min; sirve borradores) — solo lo abre el render de PDF
GET    /api/public/report-banner/:token                     # imagen de portada del informe (también usada como og:image)
GET    /api/public/logo/:slug                               # logo del workspace (usado en el hero del informe público)
GET    /api/public/proposal/:token                          # propuesta de Ventas de solo lectura — solo si status:'confirmed' (404 code PROPOSAL_DRAFT si no)

# Portal de cliente — acceso público. request-code/verify-code/getPortalPublic
# y el serve de asset son sin auth; el resto exige el JWT de propósito acotado
# (clientPortalAuth) emitido tras el código OTP.
GET    /api/public/client-portal/:slug                            # meta: proyecto, branding, informes, briefs, hasContent/pendingApprovalCount
POST   /api/public/client-portal/:slug/live/request-code          # { email } — código OTP si matchea un contacto activo
POST   /api/public/client-portal/:slug/live/verify-code           # { email, code } → { token }
POST   /api/public/client-portal/:slug/live/magic-login           # { token: <magic-token> } → { token } — atajo de 72h del email de "Pedir aprobación" de Contenido, sin código
GET    /api/public/client-portal/:slug/live                       # datos en vivo cacheados (cachea al vuelo si nunca se generaron)
POST   /api/public/client-portal/:slug/live/refresh                # recalcula (cooldown 15min)
GET    /api/public/client-portal/:slug/content                     # piezas en estados portalVisible (sin internalNotes/owner/taskId)
GET    /api/public/client-portal/:slug/content/:pid                 # detalle + comentarios visibility:'client'
POST   /api/public/client-portal/:slug/content/:pid/approve         # { comment? } — requiere contacto con canApprove
POST   /api/public/client-portal/:slug/content/:pid/request-changes # { comment } (obligatorio) — requiere canApprove
POST   /api/public/client-portal/:slug/content/:pid/comments        # { body } — mensaje suelto del cliente en el hilo
GET    /api/public/client-portal/:slug/files[?parentId=]           # lista carpetas/archivos de un nivel (solo lectura, mismo repositorio ProjectFile del equipo)
GET    /api/public/client-portal/:slug/files/search?q=             # buscador global del proyecto (solo lectura)
GET    /api/public/client-portal/:slug/files/:fileId/download[?inline=1]  # proxy autenticado a R2 (nunca redirect directo)
GET    /api/public/content-asset/:publicId                         # sin auth — asset de una pieza, servido por publicId no adivinable

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
GET    /api/superadmin/whatsapp-usage                   # ?month=YYYY-MM — uso/costo estimado de WhatsApp por workspace (Fase 6)
GET    /api/superadmin/workspaces
GET    /api/superadmin/workspaces/:id
PATCH  /api/superadmin/workspaces/:id/status
PATCH  /api/superadmin/workspaces/:id/token-limit       # body: { monthlyTokenLimit }
PATCH  /api/superadmin/workspaces/:id/storage-limit     # body: { storageLimitMb } — solo informativo/de alerta, NO bloquea subidas
PATCH  /api/superadmin/workspaces/:id/storage-quotas    # body: { projectFilesMaxMb?, contentStorageMaxMb?, chatAttachmentMaxMb? } — override puntual por workspace de las cuotas que SÍ bloquean subidas (null = default global, 0 = ilimitado)
GET    /api/superadmin/users                            # ?search=&limit=&offset=&status=all|active|inactive|orphan
PATCH  /api/superadmin/users/:id/toggle-active          # body: { active } — toggle de TODAS las memberships
PATCH  /api/superadmin/users/:id/toggle-daily-insight   # body: { enabled } — toggle del insight diario IA en TODAS las memberships
GET    /api/superadmin/conversion-funnel                # ?days=30 — funnel signup→trial→paid + top eventos
POST   /api/events                                      # tracking de conversión, sin auth, allowlist de nombres
POST   /api/workspaces/current/demo-project             # admin/owner: crear proyecto "Demo — Aprendé BlissTracker" a pedido (wizard de onboarding)
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


