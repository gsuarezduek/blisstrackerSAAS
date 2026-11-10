const prisma = require('../../lib/prisma')
const { dateStringInTz } = require('../../utils/dates')
const { canWrite } = require('../../lib/projectAccess')
const { emitTo } = require('../../lib/socket')
const {
  isValidType,
  sanitizeNetworks,
  sanitizeTypes,
  statusMeta,
  CONTENT_NETWORKS,
  OPEN_STATUSES,
} = require('../../lib/contentCatalog')
const { SYSTEM_TYPES, postProjectSystemMessage } = require('../../lib/chatSystemMessage')
const { shapeItem: shapeProjectFile } = require('../projects/projectFiles.controller')

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const DEFAULT_PAGE_SIZE = 50
const MAX_PAGE_SIZE = 200
const MAX_TITLE = 200

// Tope de destacadas simultáneas por proyecto (mismo número que tareas, ver
// starPiece). Publicado/Archivado no cuentan — ya no hay nada que priorizar.
const MAX_STARRED = 3
const OPEN_STATUS_KEYS = OPEN_STATUSES.map(s => s.key)

// ─── Helpers compartidos por todos los sub-controllers de Contenido ─────────
// (pieces/trash/kanban/history/dashboard/approval, y reusados por
// contentAssets/contentComments/contentFiles/contentPortal/clientPortal) ────

// Todas las mutaciones de una pieza emiten a workspace:<id> con la pieza ya
// formateada — así el Kanban/Tabla/Calendario de otra pestaña se actualiza sin
// que el visitante tenga que refrescar. No hace falta una room por proyecto:
// en este repo cualquier miembro activo ya puede leer cualquier proyecto.
function emitPieceUpdated(workspaceId, projectId, piece) {
  emitTo(`workspace:${workspaceId}`, 'content:piece:updated', { projectId, piece })
}

function networkLabel(key) {
  return CONTENT_NETWORKS.find(n => n.key === key)?.label || key
}

// Mensaje de sistema en el chat del proyecto cuando una pieza llega a "publicado" — un
// hito de cara al cliente, a diferencia del resto de las transiciones de estado (que son
// trabajo interno del equipo y no ameritan dejar constancia acá).
function announceIfPublished(projectId, workspaceId, statusChanged, piece, req) {
  if (statusChanged !== 'publicado') return
  const actorName = req.user?.name || 'Alguien'
  const networks = (piece.networks || []).map(networkLabel).join(', ')
  setImmediate(() => {
    postProjectSystemMessage(
      projectId, workspaceId, SYSTEM_TYPES.CONTENT_PUBLISHED,
      `📣 ${actorName} publicó "${piece.title}"${networks ? ` en ${networks}` : ''}.`
    ).catch(() => {})
  })
}

// Resuelve :id (numérico o name) a un proyecto del workspace actual. Devuelve
// también la timezone porque scheduledDate se denormaliza en la tz del proyecto.
async function resolveProject(param, workspaceId) {
  const num = Number(param)
  const where = Number.isInteger(num) && num > 0
    ? { id: num, workspaceId }
    : { name: param, workspaceId }
  return prisma.project.findFirst({ where, select: { id: true, timezone: true } })
}

// Miembros activos del workspace, marcando quiénes son del equipo del proyecto
// (`inTeam`) para agrupar el selector de responsable. Espejo de projectMeetings.
async function getMembers(workspaceId, projectId) {
  const [rows, teamRows] = await Promise.all([
    prisma.workspaceMember.findMany({
      where:   { workspaceId, active: true },
      include: { user: { select: { id: true, name: true, avatar: true } } },
      orderBy: { user: { name: 'asc' } },
    }),
    prisma.projectMember.findMany({ where: { projectId }, select: { userId: true } }),
  ])
  const teamIds = new Set(teamRows.map(t => t.userId))
  return rows.map(m => ({
    id: m.user.id, name: m.user.name, avatar: m.user.avatar, role: m.role,
    inTeam: teamIds.has(m.user.id),
  }))
}

// Contactos activos del portal del cliente del proyecto — se agregan como
// opción de "Responsable" (antes del equipo interno) para marcar que la pelota
// está del lado del cliente. [] si el proyecto no tiene portal o no está activo.
async function getClientContacts(projectId) {
  const portal = await prisma.projectClientPortal.findUnique({
    where:  { projectId },
    select: { id: true, active: true },
  })
  if (!portal || !portal.active) return []
  const contacts = await prisma.clientPortalContact.findMany({
    where:  { portalId: portal.id, active: true },
    orderBy:{ name: 'asc' },
    select: { id: true, name: true, email: true },
  })
  return contacts.map(c => ({ id: c.id, name: c.name || c.email }))
}

function safeParseArr(str) {
  try { const v = JSON.parse(str); return Array.isArray(v) ? v : [] } catch { return [] }
}

// select de ProjectFile con los campos que shapeProjectFile necesita para
// armar el ítem (id/type/name/status/mimeType/sizeBytes/width/height/
// objectKey/posterKey/uploadedBy/createdAt) — ver projectFiles.controller.js#shapeItem.
const LINKED_FILE_SELECT = {
  id: true, type: true, name: true, status: true, mimeType: true, sizeBytes: true,
  width: true, height: true, objectKey: true, posterKey: true, createdAt: true,
  uploadedBy: { select: { id: true, name: true } },
}

const PIECE_INCLUDE = {
  owner:       { select: { id: true, name: true, avatar: true } },
  ownerContact:{ select: { id: true, name: true, email: true } },
  createdBy:   { select: { id: true, name: true, avatar: true } },
  // Todas las tareas del dashboard que pasaron por esta pieza, más reciente
  // primero (`tasks[0]` = la actual). Una pieza acumula una tarea por cada
  // handoff de responsable (CM arma el copy → diseñador arma el reel → CM
  // revisa → CM publica) — ver concepto "Tareas del dashboard vinculadas" en
  // ContentPiece.tasks (schema.prisma). `sessions` viaja para poder calcular
  // los minutos trabajados de cada tramo con el mismo helper que el resto de
  // la app (frontend/src/utils/format.js activeMinutes).
  tasks: {
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, status: true, userId: true, createdAt: true, startedAt: true,
      completedAt: true, pausedAt: true, pausedMinutes: true, minutesOverride: true,
      user: { select: { id: true, name: true, avatar: true } },
      sessions: { select: { startedAt: true, endedAt: true } },
    },
  },
  approvedBy:  { select: { id: true, name: true, email: true } },
  assets:      { where: { status: 'ready' }, orderBy: { order: 'asc' } },
  // Archivos vinculados desde el repositorio de Archivos del proyecto (ver
  // modelo ContentPieceFile) — se filtran los que están en la papelera de
  // Archivos (deletedAt no nulo): desaparecen de la pieza mientras están ahí y
  // reaparecen solos si se restauran, sin lógica especial.
  files: {
    where:   { file: { deletedAt: null } },
    include: { file: { select: LINKED_FILE_SELECT }, linkedBy: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'asc' },
  },
  // Último comentario DEL CLIENTE (no del hilo completo) — para poder
  // destacarlo en la Tabla sin traer todo el hilo de comentarios en cada
  // fila. `_count.comments` de abajo sigue contando el hilo entero
  // (interno + cliente); esto es un dato aparte.
  comments: {
    where:   { visibility: 'client' },
    orderBy: { createdAt: 'desc' },
    take:    1,
    select:  { id: true, body: true, authorName: true, createdAt: true },
  },
  _count:      { select: { comments: true } },
}

// URL pública del asset. SIEMPRE apunta a nuestro endpoint, nunca al dominio del
// bucket: así las URLs no quedan atadas a R2_PUBLIC_BASE (mismo criterio que
// socialImageCache.service.js).
function assetUrl(publicId, { poster = false, download = false } = {}) {
  const base = (process.env.BACKEND_URL || '').replace(/\/$/, '')
  const params = new URLSearchParams()
  if (poster) params.set('poster', '1')
  if (download) params.set('download', '1')
  const qs = params.toString()
  return `${base}/api/public/content-asset/${publicId}${qs ? `?${qs}` : ''}`
}

function formatAsset(a) {
  return {
    id:          a.id,
    kind:        a.kind,
    mimeType:    a.mimeType,
    url:         a.kind === 'link' ? a.sourceUrl : assetUrl(a.publicId),
    // Fuerza `Content-Disposition: attachment` en el servidor — no depende del
    // atributo `download` del navegador, que no se respeta tras un redirect
    // cross-origin (el caso normal cuando el asset vive en R2). Ver serveContentAsset.
    downloadUrl: a.kind === 'link' ? null : assetUrl(a.publicId, { download: true }),
    posterUrl:   a.posterKey ? assetUrl(a.publicId, { poster: true }) : null,
    width:       a.width,
    height:      a.height,
    durationSec: a.durationSec,
    sizeBytes:   a.sizeBytes,
    fileName:    a.fileName,
    order:       a.order,
    status:      a.status,
  }
}

// Archivo del proyecto vinculado a la pieza (ContentPieceFile). `id` es el id
// del VÍNCULO (para desvincular), `file` es el ProjectFile formateado con el
// mismo shape que usa Archivos (shapeProjectFile).
function formatLinkedFile(link) {
  return {
    id:        link.id,
    file:      shapeProjectFile(link.file),
    linkedBy:  link.linkedBy ? { id: link.linkedBy.id, name: link.linkedBy.name } : null,
    createdAt: link.createdAt,
  }
}

// Un tramo de trabajo de la pieza (una Task de su historial — ver PIECE_INCLUDE.tasks).
function formatPieceTask(t) {
  return {
    id:              t.id,
    status:          t.status,
    user:            t.user ? { id: t.user.id, name: t.user.name, avatar: t.user.avatar } : null,
    createdAt:       t.createdAt,
    startedAt:       t.startedAt,
    completedAt:     t.completedAt,
    pausedAt:        t.pausedAt,
    pausedMinutes:   t.pausedMinutes,
    minutesOverride: t.minutesOverride,
    sessions:        t.sessions || [],
  }
}

// Formatter INTERNO (equipo). El del portal del cliente es una función aparte en
// contentPortal.controller.js y nunca expone internalNotes ni datos de equipo.
function formatPiece(p) {
  return {
    id:            p.id,
    projectId:     p.projectId,
    title:         p.title,
    status:        p.status,
    statusLabel:   statusMeta(p.status)?.label ?? p.status,
    types:         safeParseArr(p.types),
    networks:      safeParseArr(p.networks),
    designDetails: p.designDetails,
    copy:          p.copy,
    hashtags:      p.hashtags,
    internalNotes: p.internalNotes,
    scheduledAt:   p.scheduledAt,
    scheduledDate: p.scheduledDate,
    publishedAt:   p.publishedAt,
    publishedUrl:  p.publishedUrl,
    starred:       p.starred,
    order:         p.order,
    owner:         p.owner ? { id: p.owner.id, name: p.owner.name, avatar: p.owner.avatar } : null,
    // El responsable puede ser el cliente en vez del equipo — mutuamente
    // excluyente con `owner` (ver buildPieceData). El frontend hace
    // owner?.name ?? ownerContact?.name para mostrar uno u otro.
    ownerContact:  p.ownerContact ? { id: p.ownerContact.id, name: p.ownerContact.name || p.ownerContact.email } : null,
    createdBy:     p.createdBy ? { id: p.createdBy.id, name: p.createdBy.name, avatar: p.createdBy.avatar } : null,
    // Historial completo de tareas de la pieza (más reciente primero) +
    // `currentTask`/`taskId` como alias de `tasks[0]` — el tramo activo o el
    // último cerrado. Una pieza sin ningún tramo enviado todavía tiene [] / null.
    tasks:         p.tasks ? p.tasks.map(formatPieceTask) : [],
    currentTask:   p.tasks && p.tasks.length > 0 ? formatPieceTask(p.tasks[0]) : null,
    taskId:        p.tasks && p.tasks.length > 0 ? p.tasks[0].id : null,
    assets:        p.assets ? p.assets.map(formatAsset) : [],
    files:         p.files ? p.files.map(formatLinkedFile) : [],
    commentCount:  p._count?.comments ?? 0,
    // Último mensaje del cliente en el hilo (cualquiera sea el estado de la
    // pieza) — la Tabla lo muestra como una línea aparte debajo del título
    // para que no se pierda entre el resto de las piezas.
    lastClientComment: p.comments?.[0] ? {
      id:        p.comments[0].id,
      body:      p.comments[0].body,
      author:    p.comments[0].authorName || 'Cliente',
      createdAt: p.comments[0].createdAt,
    } : null,
    submittedAt:        p.submittedAt,
    approvedAt:         p.approvedAt,
    approvedBy:         p.approvedBy ? { id: p.approvedBy.id, name: p.approvedBy.name || p.approvedBy.email } : null,
    changesRequestedAt: p.changesRequestedAt,
    createdAt:     p.createdAt,
    updatedAt:     p.updatedAt,
  }
}

async function loadPiece(pid, projectId, workspaceId) {
  return prisma.contentPiece.findFirst({
    where:   { id: Number(pid), projectId, workspaceId, deletedAt: null },
    include: PIECE_INCLUDE,
  })
}

/**
 * Registra un evento en el log append-only. Toda transición de estado pasa por
 * acá: el historial de "quién aprobó qué y cuándo" no debe tener huecos.
 */
async function logEvent({ pieceId, workspaceId, action, fromStatus, toStatus, req, comment }) {
  return prisma.contentStatusEvent.create({
    data: {
      pieceId,
      workspaceId,
      action,
      fromStatus: fromStatus ?? null,
      toStatus:   toStatus ?? null,
      actorUserId: req?.user?.userId ?? null,
      actorName:   req?.user?.name ?? null,
      comment:     comment ?? null,
    },
  })
}

// Preámbulo común de todo handler: resuelve el proyecto y, si `write`, valida
// permiso. Devuelve null habiendo respondido ya (el caller hace `if (!ctx) return`).
async function resolveCtx(req, res, { write = false } = {}) {
  const workspaceId = req.workspace.id
  const project = await resolveProject(req.params.id, workspaceId)
  if (!project) {
    res.status(404).json({ error: 'Proyecto no encontrado' })
    return null
  }
  if (write && !(await canWrite(req, project.id))) {
    res.status(403).json({ error: 'No tenés acceso a este proyecto' })
    return null
  }
  return { workspaceId, projectId: project.id, timezone: project.timezone }
}

/**
 * Valida y normaliza los campos editables de una pieza.
 * Devuelve { data } o { error } — el caller responde 400 con el error.
 * `scheduledDate` se deriva siempre de `scheduledAt` en la tz del proyecto.
 */
function buildPieceData(body, timezone, { isCreate = false } = {}) {
  const data = {}

  if (body.title !== undefined || isCreate) {
    const title = typeof body.title === 'string' ? body.title.trim() : ''
    if (!title) return { error: 'El título es requerido' }
    data.title = title.slice(0, MAX_TITLE)
  }

  if (body.types !== undefined) {
    if (!Array.isArray(body.types)) return { error: 'types debe ser un array' }
    if (body.types.some(t => !isValidType(t))) return { error: 'Tipo de pieza inválido' }
    data.types = JSON.stringify(sanitizeTypes(body.types))
  }

  if (body.networks !== undefined) {
    if (!Array.isArray(body.networks)) return { error: 'networks debe ser un array' }
    data.networks = JSON.stringify(sanitizeNetworks(body.networks))
  }

  for (const field of ['designDetails', 'copy', 'hashtags', 'internalNotes', 'publishedUrl']) {
    if (body[field] !== undefined) {
      data[field] = typeof body[field] === 'string' && body[field].trim() ? body[field] : null
    }
  }

  if (body.scheduledAt !== undefined) {
    if (body.scheduledAt === null || body.scheduledAt === '') {
      data.scheduledAt = null
      data.scheduledDate = null
    } else {
      const d = new Date(body.scheduledAt)
      if (Number.isNaN(d.getTime())) return { error: 'scheduledAt inválida' }
      data.scheduledAt = d
      data.scheduledDate = dateStringInTz(d, timezone)
    }
  }

  // ownerId (equipo interno) y ownerContactId (contacto del cliente) son
  // mutuamente excluyentes: el frontend siempre manda los dos juntos al
  // cambiar el responsable (uno con el id elegido, el otro en null).
  if (body.ownerId !== undefined) {
    if (body.ownerId === null || body.ownerId === '') data.ownerId = null
    else {
      const n = Number(body.ownerId)
      if (!Number.isInteger(n) || n <= 0) return { error: 'ownerId inválido' }
      data.ownerId = n
      data.ownerContactId = null
    }
  }

  if (body.ownerContactId !== undefined) {
    if (body.ownerContactId === null || body.ownerContactId === '') data.ownerContactId = null
    else {
      const n = Number(body.ownerContactId)
      if (!Number.isInteger(n) || n <= 0) return { error: 'ownerContactId inválido' }
      data.ownerContactId = n
      data.ownerId = null
    }
  }

  if (body.order !== undefined) {
    const n = Number(body.order)
    if (!Number.isInteger(n)) return { error: 'order inválido' }
    data.order = n
  }

  return { data }
}

/**
 * Campos derivados de un cambio de estado (marcas de tiempo denormalizadas).
 * La verdad histórica vive en ContentStatusEvent; esto es solo para filtros y badges.
 */
function statusSideEffects(toStatus) {
  const meta = statusMeta(toStatus)
  const patch = { status: toStatus }
  if (toStatus === 'aprobacion') patch.submittedAt = new Date()
  if (toStatus === 'cambios')    patch.changesRequestedAt = new Date()
  if (meta?.isApproved && !patch.approvedAt) patch.approvedAt = new Date()
  if (toStatus === 'publicado')  patch.publishedAt = new Date()
  return patch
}

module.exports = {
  // constantes
  DATE_RE,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  MAX_STARRED,
  OPEN_STATUS_KEYS,
  PIECE_INCLUDE,
  // helpers
  emitPieceUpdated,
  announceIfPublished,
  resolveProject,
  getMembers,
  getClientContacts,
  formatAsset,
  formatLinkedFile,
  formatPiece,
  loadPiece,
  logEvent,
  resolveCtx,
  buildPieceData,
  statusSideEffects,
}
