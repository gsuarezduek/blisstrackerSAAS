const prisma = require('../lib/prisma')
const { dateStringInTz } = require('../utils/dates')
const { canWrite } = require('../lib/projectAccess')
const {
  isValidStatus,
  isValidType,
  sanitizeNetworks,
  statusMeta,
} = require('../lib/contentCatalog')

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
function assetUrl(publicId, poster = false) {
  const base = (process.env.BACKEND_URL || '').replace(/\/$/, '')
  return `${base}/api/public/content-asset/${publicId}${poster ? '?poster=1' : ''}`
}

function formatAsset(a) {
  return {
    id:          a.id,
    kind:        a.kind,
    mimeType:    a.mimeType,
    url:         assetUrl(a.publicId),
    posterUrl:   a.posterKey ? assetUrl(a.publicId, true) : null,
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
    type:          p.type,
    networks:      safeParseArr(p.networks),
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

  if (body.type !== undefined) {
    if (!isValidType(body.type)) return { error: 'Tipo de pieza inválido' }
    data.type = body.type
  }

  if (body.networks !== undefined) {
    if (!Array.isArray(body.networks)) return { error: 'networks debe ser un array' }
    data.networks = JSON.stringify(sanitizeNetworks(body.networks))
  }

  for (const field of ['copy', 'hashtags', 'internalNotes', 'publishedUrl']) {
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

    const { from, to, status, network, ownerId, q } = req.query
    const where = { projectId, workspaceId }

    if (from && DATE_RE.test(from)) where.scheduledDate = { ...where.scheduledDate, gte: from }
    if (to   && DATE_RE.test(to))   where.scheduledDate = { ...where.scheduledDate, lte: to }
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
        { title: { contains: term, mode: 'insensitive' } },
        { copy:  { contains: term, mode: 'insensitive' } },
      ]
    }

    const skip = Math.max(parseInt(req.query.skip, 10) || 0, 0)
    const take = Math.min(Math.max(parseInt(req.query.take, 10) || DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE)

    const [members, total, pieces] = await Promise.all([
      getMembers(workspaceId, projectId),
      prisma.contentPiece.count({ where }),
      prisma.contentPiece.findMany({
        where,
        orderBy: [{ scheduledDate: 'desc' }, { updatedAt: 'desc' }],
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
    res.status(201).json(formatPiece(fresh))
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
    res.json(formatPiece(fresh))
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
    res.json(formatPiece(fresh))
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

module.exports = {
  listPieces,
  createPiece,
  getPiece,
  updatePiece,
  deletePiece,
  movePiece,
  getHistory,
  getSummary,
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
