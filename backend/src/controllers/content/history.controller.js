const prisma = require('../../lib/prisma')
const { resolveCtx } = require('./_shared')

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
 * Meses (YYYY-MM, sobre scheduledDate) que tienen al menos una pieza, con su
 * conteo, más cuántas no tienen fecha asignada — alimenta las pestañas de mes
 * (ContentMonthTabs), que son la navegación primaria del módulo.
 * Deliberadamente independiente de `listPieces`: si se derivara del listado ya
 * filtrado por mes, elegir un mes dejaría una sola pestaña.
 * Excluye 'archivado' por el mismo criterio que el default de `listPieces` — un
 * mes cuyas únicas piezas están archivadas no es un mes de trabajo, y la
 * pestaña abriría vacía.
 */
async function listMonths(req, res, next) {
  try {
    const ctx = await resolveCtx(req, res)
    if (!ctx) return

    const rows = await prisma.contentPiece.findMany({
      where:  { projectId: ctx.projectId, workspaceId: ctx.workspaceId, deletedAt: null, status: { not: 'archivado' } },
      select: { scheduledDate: true },
    })

    const counts = {}
    let unscheduled = 0
    for (const r of rows) {
      if (r.scheduledDate) {
        const m = r.scheduledDate.slice(0, 7)
        counts[m] = (counts[m] || 0) + 1
      } else unscheduled++
    }

    res.json({
      months: Object.keys(counts).sort(),
      counts,
      unscheduled,
      hasUnscheduled: unscheduled > 0,
    })
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
      where: { projectId: ctx.projectId, workspaceId: ctx.workspaceId, deletedAt: null },
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
  getHistory,
  listMonths,
  getSummary,
}
