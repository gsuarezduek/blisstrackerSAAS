const prisma = require('../../lib/prisma')
const { isAdmin } = require('../../lib/projectAccess')
const objectStorage = require('../../services/objectStorage.service')
const { statusMeta } = require('../../lib/contentCatalog')
const { emitPieceUpdated, formatPiece, loadPiece, resolveCtx } = require('./_shared')

/**
 * GET /api/contenido/projects/:id/pieces/trash
 * Piezas en la papelera (deletedAt no nulo), más recientes primero, con quién
 * las borró y hace cuánto. Mismo criterio de permiso que borrar: requiere
 * canWrite (no es una lectura abierta a cualquier miembro del workspace).
 */
async function listTrash(req, res, next) {
  try {
    const ctx = await resolveCtx(req, res, { write: true })
    if (!ctx) return

    const pieces = await prisma.contentPiece.findMany({
      where:   { projectId: ctx.projectId, workspaceId: ctx.workspaceId, deletedAt: { not: null } },
      orderBy: { deletedAt: 'desc' },
      include: { deletedBy: { select: { id: true, name: true } } },
    })

    const sizesByPiece = await prisma.contentAsset.groupBy({
      by:    ['pieceId'],
      where: { pieceId: { in: pieces.map(p => p.id) } },
      _sum:  { sizeBytes: true },
    })
    const sizeMap = new Map(sizesByPiece.map(s => [s.pieceId, s._sum.sizeBytes || 0]))

    res.json({
      pieces: pieces.map(p => ({
        id:          p.id,
        title:       p.title,
        status:      p.status,
        statusLabel: statusMeta(p.status)?.label ?? p.status,
        sizeBytes:   sizeMap.get(p.id) || 0,
        deletedAt:   p.deletedAt,
        deletedBy:   p.deletedBy ? { id: p.deletedBy.id, name: p.deletedBy.name } : null,
      })),
    })
  } catch (err) { next(err) }
}

/**
 * POST /api/contenido/projects/:id/pieces/:pid/restore
 * Saca la pieza de la papelera. 404 si no existe o no está borrada — evita
 * "restaurar" algo que nunca se eliminó.
 */
async function restorePiece(req, res, next) {
  try {
    const ctx = await resolveCtx(req, res, { write: true })
    if (!ctx) return
    const { workspaceId, projectId } = ctx

    const existing = await prisma.contentPiece.findFirst({
      where: { id: Number(req.params.pid), projectId, workspaceId, deletedAt: { not: null } },
    })
    if (!existing) return res.status(404).json({ error: 'Pieza no encontrada en la papelera' })

    await prisma.contentPiece.update({
      where: { id: existing.id },
      data:  { deletedAt: null, deletedById: null },
    })

    const fresh = await loadPiece(existing.id, projectId, workspaceId)
    const formatted = formatPiece(fresh)
    emitPieceUpdated(workspaceId, projectId, formatted)
    res.json(formatted)
  } catch (err) { next(err) }
}

/**
 * DELETE /api/contenido/projects/:id/pieces/:pid/purge
 * Elimina definitivamente AHORA una pieza que ya está en la papelera — mismo
 * efecto que la limpieza semanal (cleanup.service.js `contentPiecesTrash`),
 * disparado a mano en vez de esperar `contentPieceTrashRetentionDays`.
 * Irreversible: borra los objetos de R2 de sus assets, después la fila de la
 * pieza (cascada de Postgres: ContentAsset/ContentComment/ContentStatusEvent).
 * Restringido a admin/owner del workspace — a diferencia de `canWrite`
 * (admin o equipo del proyecto) que alcanza para el resto de este controller,
 * esto no tiene vuelta atrás. NO toca la copia espejada en Archivos
 * (contentFileMirror.service.js): son objetos independientes a propósito.
 */
async function purgePiece(req, res, next) {
  try {
    const ctx = await resolveCtx(req, res, { write: true })
    if (!ctx) return
    if (!isAdmin(req)) return res.status(403).json({ error: 'Se requieren permisos de administrador' })
    const { workspaceId, projectId } = ctx

    const existing = await prisma.contentPiece.findFirst({
      where:  { id: Number(req.params.pid), projectId, workspaceId, deletedAt: { not: null } },
      select: { id: true, assets: { select: { objectKey: true, posterKey: true, sizeBytes: true } } },
    })
    if (!existing) return res.status(404).json({ error: 'Pieza no encontrada en la papelera' })

    await objectStorage.deleteObjects(existing.assets.flatMap(a => [a.objectKey, a.posterKey].filter(Boolean)))
    const freedBytes = existing.assets.reduce((sum, a) => sum + (a.sizeBytes || 0), 0)

    await prisma.contentPiece.delete({ where: { id: existing.id } })

    res.json({ purged: true, freedBytes })
  } catch (err) { next(err) }
}

module.exports = {
  listTrash,
  restorePiece,
  purgePiece,
}
