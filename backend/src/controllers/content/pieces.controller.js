const prisma = require('../../lib/prisma')
const { emitTo } = require('../../lib/socket')
const { isValidStatus } = require('../../lib/contentCatalog')
const {
  DATE_RE,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  PIECE_INCLUDE,
  emitPieceUpdated,
  announceIfPublished,
  getMembers,
  getClientContacts,
  formatPiece,
  loadPiece,
  logEvent,
  resolveCtx,
  buildPieceData,
  statusSideEffects,
} = require('./_shared')

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
    const where = { projectId, workspaceId, deletedAt: null }

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
    } else {
      // Sin filtro explícito de estado, las piezas 'publicado' quedan afuera
      // de la vista general (Tabla/Kanban/Calendario) — viven solo en la
      // sección "Publicadas", que pide explícitamente ?status=publicado.
      where.status = { not: 'publicado' }
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

    const [members, clientContacts, total, pieces] = await Promise.all([
      getMembers(workspaceId, projectId),
      getClientContacts(projectId),
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

    res.json({ members, clientContacts, pieces: pieces.map(formatPiece), total })
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
 * Soft-delete: manda la pieza a la papelera (deletedAt), recuperable desde ahí
 * (GET .../pieces/trash + POST .../pieces/:pid/restore). La limpieza semanal
 * (cleanup.service.js) la borra en duro —R2 incluido— pasados
 * `contentPieceTrashRetentionDays` (default 30) desde este momento.
 */
async function deletePiece(req, res, next) {
  try {
    const ctx = await resolveCtx(req, res, { write: true })
    if (!ctx) return

    const existing = await loadPiece(req.params.pid, ctx.projectId, ctx.workspaceId)
    if (!existing) return res.status(404).json({ error: 'Pieza no encontrada' })

    await prisma.contentPiece.update({
      where: { id: existing.id },
      data:  { deletedAt: new Date(), deletedById: req.user.userId },
    })
    emitTo(`workspace:${ctx.workspaceId}`, 'content:piece:deleted', { projectId: ctx.projectId, id: existing.id })
    res.json({ deleted: true })
  } catch (err) { next(err) }
}

module.exports = {
  listPieces,
  createPiece,
  getPiece,
  updatePiece,
  deletePiece,
}
