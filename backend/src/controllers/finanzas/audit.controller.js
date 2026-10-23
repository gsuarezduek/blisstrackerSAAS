const prisma = require('../../lib/prisma')
const { isValidAuditEntityType, isValidAuditAction } = require('../../lib/financeCatalog')

// GET /api/finanzas/audit
// - Con entityType+entityId: historial de UNA entidad (panel "Historial" de
//   cualquier entidad editable del módulo — comportamiento original).
// - Sin esos dos params: historial GLOBAL del módulo (sección "Historial" de
//   Configuración) — referencia de todo lo que se creó/editó/eliminó,
//   filtrable por tipo/acción/fecha. `action=delete` es el filtro más usado
//   (ver qué se borró y quién lo borró).
async function listAudit(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const { entityType, entityId, action, from, to } = req.query

    if (entityType !== undefined || entityId !== undefined) {
      if (!isValidAuditEntityType(entityType)) return res.status(400).json({ error: 'entityType inválido' })
      if (!Number.isInteger(Number(entityId))) return res.status(400).json({ error: 'entityId requerido' })
      const logs = await prisma.financeAuditLog.findMany({
        where: { workspaceId, entityType, entityId: Number(entityId) },
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { id: true, name: true, avatar: true } } },
      })
      return res.json(logs)
    }

    // El historial global (a diferencia del de una entidad puntual, que
    // cualquiera con acceso al módulo puede ver) queda admin/owner-only — se
    // usa desde Configuración, no hace falta exponerlo a todo el equipo.
    if (!['admin', 'owner'].includes(req.workspaceMember.role)) return res.status(403).json({ error: 'Solo admin/owner puede ver el historial completo' })

    const where = { workspaceId }
    if (action) {
      if (!isValidAuditAction(action)) return res.status(400).json({ error: 'action inválida' })
      where.action = action
    }
    if (from || to) {
      where.createdAt = {}
      if (from) where.createdAt.gte = new Date(`${from}T00:00:00`)
      if (to) where.createdAt.lte = new Date(`${to}T23:59:59`)
    }
    const logs = await prisma.financeAuditLog.findMany({
      where, orderBy: { createdAt: 'desc' }, take: 300,
      include: { user: { select: { id: true, name: true, avatar: true } } },
    })
    res.json(logs)
  } catch (err) { next(err) }
}

module.exports = { listAudit }
