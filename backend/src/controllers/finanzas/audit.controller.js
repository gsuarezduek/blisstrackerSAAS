const prisma = require('../../lib/prisma')
const { isValidAuditEntityType } = require('../../lib/financeCatalog')

// GET /api/finanzas/audit?entityType=movement&entityId=5 — genérico, reusado
// por el panel "Historial" de cualquier entidad editable del módulo.
async function listAudit(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const { entityType, entityId } = req.query
    if (!isValidAuditEntityType(entityType)) return res.status(400).json({ error: 'entityType inválido' })
    if (!Number.isInteger(Number(entityId))) return res.status(400).json({ error: 'entityId requerido' })

    const logs = await prisma.financeAuditLog.findMany({
      where: { workspaceId, entityType, entityId: Number(entityId) },
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { id: true, name: true, avatar: true } } },
    })
    res.json(logs)
  } catch (err) { next(err) }
}

module.exports = { listAudit }
