const jwt = require('jsonwebtoken')
const prisma = require('../lib/prisma')
const { dateStringInTz, todayString } = require('../utils/dates')
const { canWrite } = require('../lib/projectAccess')
const { emitTo } = require('../lib/socket')
const { sendContentApprovalRequestEmail } = require('../services/email.service')
const {
  isValidStatus,
  isValidType,
  sanitizeNetworks,
  sanitizeTypes,
  statusMeta,
  CONTENT_NETWORKS,
} = require('../lib/contentCatalog')
const { SYSTEM_TYPES, postProjectSystemMessage } = require('../lib/chatSystemMessage')

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

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const DEFAULT_PAGE_SIZE = 50
const MAX_PAGE_SIZE = 200
const MAX_TITLE = 200

// ─── Helpers ────────────────────────────────────────────────────────────────

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

function safeParseArr(str) {
  try { const v = JSON.parse(str); return Array.isArray(v) ? v : [] } catch { return [] }
}

const PIECE_INCLUDE = {
  owner:     { select: { id: true, name: true, avatar: true } },
  createdBy: { select: { id: true, name: true, avatar: true } },
  task:      { select: { id: true, status: true } },
  approvedBy:{ select: { id: true, name: true, email: true } },
  assets:    { where: { status: 'ready' }, orderBy: { order: 'asc' } },
  _count:    { select: { comments: true } },
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
    order:         p.order,
    owner:         p.owner ? { id: p.owner.id, name: p.owner.name, avatar: p.owner.avatar } : null,
    createdBy:     p.createdBy ? { id: p.createdBy.id, name: p.createdBy.name, avatar: p.createdBy.avatar } : null,
    taskId:        p.taskId ?? null,
    task:          p.task ? { id: p.task.id, status: p.task.status } : null,
    assets:        p.assets ? p.assets.map(formatAsset) : [],
    commentCount:  p._count?.comments ?? 0,
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
    where:   { id: Number(pid), projectId, workspaceId },
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

  if (body.ownerId !== undefined) {
    if (body.ownerId === null || body.ownerId === '') data.ownerId = null
    else {
      const n = Number(body.ownerId)
      if (!Number.isInteger(n) || n <= 0) return { error: 'ownerId inválido' }
      data.ownerId = n
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

// ─── Handlers ────────────────────────────────────────────────────────────────

/**
 * GET /api/contenido/projects/:id/pieces
 * Query: from, to (YYYY-MM-DD sobre scheduledDate), status, network, ownerId, q, skip, take.
 * Lectura abierta a cualquier miembro activo del workspace.
 */
async function listPieces(req, res, next) {
  try {
    const ctx = await resolveCtx(req, res)
    if (!ctx) return
    const { workspaceId, projectId } = ctx

    const { from, to, status, network, ownerId, q, noDate } = req.query
    const where = { projectId, workspaceId }

    // `noDate=1` filtra las piezas sin fecha asignada (ej. todavía en Idea) — se
    // usa desde el filtro "Sin fecha" del mes en la Tabla/Kanban, mutuamente
    // excluyente con from/to (elegir un mes concreto no tiene sentido a la vez).
    if (noDate === '1') {
      where.scheduledDate = null
    } else {
      if (from && DATE_RE.test(from)) where.scheduledDate = { ...where.scheduledDate, gte: from }
      if (to   && DATE_RE.test(to))   where.scheduledDate = { ...where.scheduledDate, lte: to }
    }
    if (status) {
      const list = String(status).split(',').filter(isValidStatus)
      if (list.length) where.status = { in: list }
    }
    // `networks` es un JSON array serializado; el match por substring de la clave
    // entre comillas evita falsos positivos entre redes con nombres contenidos.
    if (network) where.networks = { contains: `"${network}"` }
    if (ownerId) {
      const n = Number(ownerId)
      if (Number.isInteger(n) && n > 0) where.ownerId = n
    }
    if (q && String(q).trim()) {
      const term = String(q).trim()
      where.OR = [
        { title:         { contains: term, mode: 'insensitive' } },
        { copy:          { contains: term, mode: 'insensitive' } },
        { designDetails: { contains: term, mode: 'insensitive' } },
      ]
    }

    const skip = Math.max(parseInt(req.query.skip, 10) || 0, 0)
    const take = Math.min(Math.max(parseInt(req.query.take, 10) || DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE)

    const [members, total, pieces] = await Promise.all([
      getMembers(workspaceId, projectId),
      prisma.contentPiece.count({ where }),
      prisma.contentPiece.findMany({
        where,
        // Fecha más próxima primero (no última edición). Postgres ya deja las
        // NULL al final en ASC por default, así que las piezas sin fecha
        // quedan al fondo sin necesidad de un `nulls: 'last'` explícito.
        orderBy: [{ scheduledDate: 'asc' }, { scheduledAt: 'asc' }],
        include: PIECE_INCLUDE,
        skip,
        take,
      }),
    ])

    res.json({ members, pieces: pieces.map(formatPiece), total })
  } catch (err) { next(err) }
}

/** POST /api/contenido/projects/:id/pieces */
async function createPiece(req, res, next) {
  try {
    const ctx = await resolveCtx(req, res, { write: true })
    if (!ctx) return
    const { workspaceId, projectId, timezone } = ctx

    const { data, error } = buildPieceData(req.body || {}, timezone, { isCreate: true })
    if (error) return res.status(400).json({ error })

    const status = isValidStatus(req.body?.status) ? req.body.status : 'idea'

    const piece = await prisma.contentPiece.create({
      data: {
        ...data,
        status,
        projectId,
        workspaceId,
        createdById: req.user.userId,
      },
    })

    await logEvent({ pieceId: piece.id, workspaceId, action: 'created', toStatus: status, req })

    const fresh = await loadPiece(piece.id, projectId, workspaceId)
    const formatted = formatPiece(fresh)
    emitTo(`workspace:${workspaceId}`, 'content:piece:created', { projectId, piece: formatted })
    res.status(201).json(formatted)
  } catch (err) { next(err) }
}

/** GET /api/contenido/projects/:id/pieces/:pid */
async function getPiece(req, res, next) {
  try {
    const ctx = await resolveCtx(req, res)
    if (!ctx) return

    const piece = await loadPiece(req.params.pid, ctx.projectId, ctx.workspaceId)
    if (!piece) return res.status(404).json({ error: 'Pieza no encontrada' })

    res.json(formatPiece(piece))
  } catch (err) { next(err) }
}

/**
 * PATCH /api/contenido/projects/:id/pieces/:pid
 * Acepta campos parciales. Si viene `status`, la transición queda registrada en
 * ContentStatusEvent — ningún cambio de estado pasa sin dejar rastro.
 */
async function updatePiece(req, res, next) {
  try {
    const ctx = await resolveCtx(req, res, { write: true })
    if (!ctx) return
    const { workspaceId, projectId, timezone } = ctx

    const existing = await loadPiece(req.params.pid, projectId, workspaceId)
    if (!existing) return res.status(404).json({ error: 'Pieza no encontrada' })

    const { data, error } = buildPieceData(req.body || {}, timezone)
    if (error) return res.status(400).json({ error })

    let statusChanged = null
    if (req.body?.status !== undefined && req.body.status !== existing.status) {
      if (!isValidStatus(req.body.status)) return res.status(400).json({ error: 'Estado inválido' })
      Object.assign(data, statusSideEffects(req.body.status))
      statusChanged = req.body.status
    }

    if (Object.keys(data).length === 0) return res.json(formatPiece(existing))

    await prisma.contentPiece.update({ where: { id: existing.id }, data })

    if (statusChanged) {
      await logEvent({
        pieceId: existing.id, workspaceId, action: 'status_change',
        fromStatus: existing.status, toStatus: statusChanged, req,
      })
    }

    const fresh = await loadPiece(existing.id, projectId, workspaceId)
    const formatted = formatPiece(fresh)
    emitPieceUpdated(workspaceId, projectId, formatted)
    announceIfPublished(projectId, workspaceId, statusChanged, formatted, req)
    res.json(formatted)
  } catch (err) { next(err) }
}

/**
 * DELETE /api/contenido/projects/:id/pieces/:pid
 * Los assets caen en cascada por FK. Los objetos en R2 se borran en F3, cuando
 * exista el storage — hasta entonces no hay nada que limpiar.
 */
async function deletePiece(req, res, next) {
  try {
    const ctx = await resolveCtx(req, res, { write: true })
    if (!ctx) return

    const existing = await loadPiece(req.params.pid, ctx.projectId, ctx.workspaceId)
    if (!existing) return res.status(404).json({ error: 'Pieza no encontrada' })

    await prisma.contentPiece.delete({ where: { id: existing.id } })
    emitTo(`workspace:${ctx.workspaceId}`, 'content:piece:deleted', { projectId: ctx.projectId, id: existing.id })
    res.json({ deleted: true })
  } catch (err) { next(err) }
}

/**
 * PATCH /api/contenido/projects/:id/pieces/:pid/position
 * Body: { status, order } — order es el índice destino (0-based) DENTRO de esa
 * columna, sin contar a la pieza que se mueve. Usado por el drop del Kanban
 * (cambia status y/o reordena) y también sirve para reordenar dentro de la
 * misma columna.
 *
 * Reindexa TODA la columna destino en una transacción (mismo patrón que
 * apifyTokens/avatars/landing: $transaction(items.map(update))), así que el
 * `order` de cada pieza queda siempre 0..N-1 sin huecos. La columna de origen
 * (si cambió de estado) NO se renormaliza — no hace falta: la próxima vez que
 * se mueva algo en esa columna, este mismo algoritmo la reindexa completa.
 */
async function movePiece(req, res, next) {
  try {
    const ctx = await resolveCtx(req, res, { write: true })
    if (!ctx) return
    const { workspaceId, projectId } = ctx

    const existing = await loadPiece(req.params.pid, projectId, workspaceId)
    if (!existing) return res.status(404).json({ error: 'Pieza no encontrada' })

    const { status } = req.body || {}
    if (!isValidStatus(status)) return res.status(400).json({ error: 'Estado inválido' })

    const rawOrder = Number(req.body?.order)
    const statusChanged = status !== existing.status

    const siblings = await prisma.contentPiece.findMany({
      where:   { projectId, workspaceId, status, id: { not: existing.id } },
      orderBy: [{ order: 'asc' }, { updatedAt: 'asc' }],
      select:  { id: true },
    })

    const ids = siblings.map(s => s.id)
    const targetIndex = Number.isInteger(rawOrder) ? Math.min(Math.max(rawOrder, 0), ids.length) : ids.length
    ids.splice(targetIndex, 0, existing.id)

    const movedPatch = statusChanged ? statusSideEffects(status) : { status }

    await prisma.$transaction(
      ids.map((id, index) => prisma.contentPiece.update({
        where: { id },
        data:  id === existing.id ? { ...movedPatch, order: index } : { order: index },
      }))
    )

    if (statusChanged) {
      await logEvent({
        pieceId: existing.id, workspaceId, action: 'status_change',
        fromStatus: existing.status, toStatus: status, req,
      })
    }

    const fresh = await loadPiece(existing.id, projectId, workspaceId)
    const formatted = formatPiece(fresh)
    emitPieceUpdated(workspaceId, projectId, formatted)
    announceIfPublished(projectId, workspaceId, statusChanged ? status : null, formatted, req)
    res.json(formatted)
  } catch (err) { next(err) }
}

function formatEvent(e) {
  return {
    id:         e.id,
    action:     e.action,
    fromStatus: e.fromStatus,
    toStatus:   e.toStatus,
    actorUserId:    e.actorUserId,
    actorContactId: e.actorContactId,
    actorName:  e.actorName,
    comment:    e.comment,
    createdAt:  e.createdAt,
  }
}

/** GET /api/contenido/projects/:id/pieces/:pid/history — timeline append-only. */
async function getHistory(req, res, next) {
  try {
    const ctx = await resolveCtx(req, res)
    if (!ctx) return

    const piece = await prisma.contentPiece.findFirst({
      where:  { id: Number(req.params.pid), projectId: ctx.projectId, workspaceId: ctx.workspaceId },
      select: { id: true },
    })
    if (!piece) return res.status(404).json({ error: 'Pieza no encontrada' })

    const events = await prisma.contentStatusEvent.findMany({
      where:   { pieceId: piece.id },
      orderBy: { createdAt: 'asc' },
    })

    res.json({ events: events.map(formatEvent) })
  } catch (err) { next(err) }
}

/**
 * GET /api/contenido/projects/:id/pieces/months
 * Meses (YYYY-MM, sobre scheduledDate) que tienen al menos una pieza, más si hay
 * alguna sin fecha asignada — alimenta el selector de mes de ContentFilters.
 * Deliberadamente independiente de `listPieces`: si se derivara del listado ya
 * filtrado por mes, elegir un mes dejaría al selector con una sola opción.
 */
async function listMonths(req, res, next) {
  try {
    const ctx = await resolveCtx(req, res)
    if (!ctx) return

    const rows = await prisma.contentPiece.findMany({
      where:  { projectId: ctx.projectId, workspaceId: ctx.workspaceId },
      select: { scheduledDate: true },
    })

    const months = new Set()
    let hasUnscheduled = false
    for (const r of rows) {
      if (r.scheduledDate) months.add(r.scheduledDate.slice(0, 7))
      else hasUnscheduled = true
    }

    res.json({ months: [...months].sort(), hasUnscheduled })
  } catch (err) { next(err) }
}

/**
 * GET /api/contenido/projects/:id/summary
 * Conteo por estado + cuántas esperan al cliente (para badges de nav).
 */
async function getSummary(req, res, next) {
  try {
    const ctx = await resolveCtx(req, res)
    if (!ctx) return

    const rows = await prisma.contentPiece.groupBy({
      by:    ['status'],
      where: { projectId: ctx.projectId, workspaceId: ctx.workspaceId },
      _count: { _all: true },
    })

    const byStatus = {}
    for (const r of rows) byStatus[r.status] = r._count._all

    res.json({
      byStatus,
      total: rows.reduce((a, r) => a + r._count._all, 0),
      awaitingClient: byStatus.aprobacion ?? 0,
    })
  } catch (err) { next(err) }
}

/**
 * POST /api/contenido/projects/:id/pieces/:pid/send-to-dashboard
 * Crea una Task en el dashboard del responsable y la vincula a la pieza
 * (taskId @unique). Copia el patrón de sendTodoToDashboard en
 * projectMeetings.controller.js:478-548 — mismas validaciones, mismo
 * ensureWorkDay con manejo de P2002, misma notificación TASK_MENTION.
 */
async function sendToDashboard(req, res, next) {
  try {
    const ctx = await resolveCtx(req, res, { write: true })
    if (!ctx) return
    const { workspaceId, projectId, timezone } = ctx
    const requesterId = req.user.userId

    const piece = await loadPiece(req.params.pid, projectId, workspaceId)
    if (!piece) return res.status(404).json({ error: 'Pieza no encontrada' })
    if (!piece.ownerId) return res.status(400).json({ error: 'Asigná un responsable a la pieza primero' })
    if (piece.taskId)   return res.status(409).json({ error: 'Esta pieza ya tiene una tarea vinculada' })

    const member = await prisma.workspaceMember.findUnique({
      where:  { workspaceId_userId: { workspaceId, userId: piece.ownerId } },
      select: { active: true },
    })
    if (!member || !member.active) return res.status(400).json({ error: 'El responsable no es un miembro activo del workspace' })

    // WorkDay de hoy del responsable (crear si falta — mismo patrón que projectMeetings/tasks.create).
    const today = todayString(timezone)
    const wdKey = { userId_workspaceId_date: { userId: piece.ownerId, workspaceId, date: today } }
    let workDay = await prisma.workDay.findUnique({ where: wdKey })
    if (!workDay) {
      try {
        workDay = await prisma.workDay.create({ data: { userId: piece.ownerId, workspaceId, date: today } })
      } catch (e) {
        if (e.code === 'P2002') workDay = await prisma.workDay.findUnique({ where: wdKey })
        else throw e
      }
    }
    if (!workDay) return res.status(500).json({ error: 'No se pudo obtener la jornada del responsable' })

    const task = await prisma.task.create({
      data: {
        description: `Contenido - ${piece.title}`,
        projectId,
        userId:      piece.ownerId,
        workDayId:   workDay.id,
        createdById: piece.ownerId !== requesterId ? requesterId : null,
      },
    })

    await prisma.contentPiece.update({ where: { id: piece.id }, data: { taskId: task.id } })

    if (piece.ownerId !== requesterId) {
      const desc = piece.title.length > 60 ? `${piece.title.slice(0, 57)}...` : piece.title
      await prisma.notification.create({
        data: {
          userId:     piece.ownerId,
          actorId:    requesterId,
          taskId:     task.id,
          projectId,
          workspaceId,
          contentPieceId: piece.id,
          type:       'TASK_MENTION',
          message:    `te asignó una tarea de contenido: "${desc}"`,
        },
      })
    }

    const fresh = await loadPiece(piece.id, projectId, workspaceId)
    const formatted = formatPiece(fresh)
    emitPieceUpdated(workspaceId, projectId, formatted)
    res.status(201).json(formatted)
  } catch (err) { next(err) }
}

// Ventana del link de acceso directo que va en el email de "Pedir aprobación":
// el contacto entra al portal sin código durante 72h desde el envío; pasado
// ese tiempo (o desde cualquier otra vía de entrada), sigue rigiendo el login
// OTP de siempre — ver clientPortal.controller.js#magicLogin.
const APPROVAL_MAGIC_LINK_TTL = '72h'

/**
 * POST /api/contenido/projects/:id/request-approval
 * Body: { pieceIds? } — sin pieceIds, avisa sobre TODAS las piezas en
 * 'aprobacion'. No cambia el estado de ninguna pieza (eso ya pasó al moverla
 * a esa columna): es puramente el disparador del email a los contactos del
 * portal que pueden aprobar (active && canApprove). Fire-and-forget — un
 * email caído no debe romper la respuesta (mismo criterio que submitReportFeedback).
 */
async function requestApproval(req, res, next) {
  try {
    const ctx = await resolveCtx(req, res, { write: true })
    if (!ctx) return
    const { workspaceId, projectId } = ctx

    const where = { projectId, workspaceId, status: 'aprobacion' }
    const rawIds = Array.isArray(req.body?.pieceIds)
      ? req.body.pieceIds.map(Number).filter(n => Number.isInteger(n) && n > 0)
      : null
    if (rawIds && rawIds.length) where.id = { in: rawIds }

    const pieces = await prisma.contentPiece.findMany({
      where, select: { id: true, title: true }, orderBy: { updatedAt: 'desc' },
    })
    if (pieces.length === 0) {
      return res.status(400).json({ error: 'No hay piezas esperando aprobación para avisar' })
    }

    const portal = await prisma.projectClientPortal.findUnique({ where: { projectId } })
    if (!portal || !portal.active || !portal.contentEnabled) {
      return res.status(400).json({ error: 'Activá el portal y el módulo de Contenido antes de pedir aprobación' })
    }

    const contacts = await prisma.clientPortalContact.findMany({
      where:  { portalId: portal.id, active: true, canApprove: true },
      select: { id: true, email: true },
    })
    if (contacts.length === 0) {
      return res.status(400).json({ error: 'No hay contactos activos que puedan aprobar — agregá uno en la configuración del portal' })
    }

    const [project, workspace] = await Promise.all([
      prisma.project.findUnique({ where: { id: projectId }, select: { name: true } }),
      prisma.workspace.findUnique({ where: { id: workspaceId }, select: { slug: true, name: true, companyName: true } }),
    ])

    const domain = process.env.APP_DOMAIN || 'blisstracker.app'
    const base   = `https://${workspace.slug}.${domain}/report/${portal.slug}`

    setImmediate(() => {
      Promise.allSettled(contacts.map(contact => {
        const magicToken = jwt.sign(
          { purpose: 'client-portal-magic', portalId: portal.id, contactId: contact.id },
          process.env.JWT_SECRET,
          { expiresIn: APPROVAL_MAGIC_LINK_TTL },
        )
        const portalUrl = `${base}?tab=contenido&mt=${encodeURIComponent(magicToken)}`
        return sendContentApprovalRequestEmail(contact.email, {
          projectName:   project?.name || 'Proyecto',
          portalUrl,
          pieces,
          workspaceName: workspace?.companyName || workspace?.name,
        }, workspaceId)
      }))
    })

    res.json({ sent: contacts.length, pieces: pieces.length })
  } catch (err) { next(err) }
}

module.exports = {
  listPieces,
  listMonths,
  createPiece,
  getPiece,
  updatePiece,
  deletePiece,
  movePiece,
  getHistory,
  getSummary,
  sendToDashboard,
  requestApproval,
  // exportados para reuso en los controllers de F2–F4
  resolveProject,
  resolveCtx,
  formatPiece,
  formatAsset,
  loadPiece,
  logEvent,
  statusSideEffects,
  PIECE_INCLUDE,
}
