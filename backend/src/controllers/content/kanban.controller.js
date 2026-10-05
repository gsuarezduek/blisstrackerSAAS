const prisma = require('../../lib/prisma')
const { isValidStatus } = require('../../lib/contentCatalog')
const {
  MAX_STARRED,
  OPEN_STATUS_KEYS,
  emitPieceUpdated,
  announceIfPublished,
  formatPiece,
  loadPiece,
  logEvent,
  resolveCtx,
  statusSideEffects,
} = require('./_shared')

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
      where:   { projectId, workspaceId, status, deletedAt: null, id: { not: existing.id } },
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

/**
 * PATCH /api/contenido/projects/:id/pieces/:pid/star
 * Cicla la prioridad 0→1(verde)→2(amarillo)→3(rojo)→0 — mismo formato y mismos
 * colores que Task.starred, pero acá es UNA sola estrella COMPARTIDA por todo
 * el equipo del proyecto (no por usuario): el CM la deja marcada y cualquiera
 * que abra el Kanban/Tabla ve la misma prioridad. Tope de 3 piezas destacadas
 * a la vez por proyecto (excluyendo estados terminales — publicado/archivado,
 * que ya no compiten por prioridad de trabajo).
 */
async function starPiece(req, res, next) {
  try {
    const ctx = await resolveCtx(req, res, { write: true })
    if (!ctx) return
    const { workspaceId, projectId } = ctx

    const existing = await loadPiece(req.params.pid, projectId, workspaceId)
    if (!existing) return res.status(404).json({ error: 'Pieza no encontrada' })

    const nextLevel = (existing.starred + 1) % 4

    if (nextLevel === 1) {
      const starredCount = await prisma.contentPiece.count({
        where: {
          projectId, workspaceId, deletedAt: null,
          starred: { gt: 0 },
          status: { in: OPEN_STATUS_KEYS },
        },
      })
      if (starredCount >= MAX_STARRED) {
        return res.status(409).json({ error: `Máximo ${MAX_STARRED} piezas destacadas. Quitá una primero.` })
      }
    }

    await prisma.contentPiece.update({ where: { id: existing.id }, data: { starred: nextLevel } })

    const fresh = await loadPiece(existing.id, projectId, workspaceId)
    const formatted = formatPiece(fresh)
    emitPieceUpdated(workspaceId, projectId, formatted)
    res.json(formatted)
  } catch (err) { next(err) }
}

module.exports = {
  movePiece,
  starPiece,
}
