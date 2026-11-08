const prisma = require('./prisma')
const { hasModuleAccess } = require('./moduleAccess')
const { isFlagEnabledForWorkspace } = require('./featureFlags')
const { CONTENT_STATUSES } = require('./contentCatalog')
const { CONTENIDO_PROJECT_WHERE } = require('./projectModules')

// Piezas de Contenido que le tocan a UNA persona, en un rango de días.
// La fecha es scheduledDate (ya en la timezone del proyecto). El responsable
// es el del equipo: si la pieza está en manos del cliente, ownerId es null y
// no entra. Publicadas y archivadas tampoco: ese día ya pasó.
// Si hay una tarea abierta en el dashboard de esa persona para la pieza, no se
// repite acá — la tarea es el pendiente. Al completarla, el día de publicación
// vuelve a la agenda.

const TERMINAL_STATUSES = CONTENT_STATUSES.filter(s => s.isTerminal).map(s => s.key)

async function contentAgendaEnabled(req) {
  if (!hasModuleAccess(req, 'contenido')) return false
  if (req.user?.isSuperAdmin) return true
  const flag = await prisma.featureFlag.findUnique({ where: { key: 'contenido' } })
  const disabledKeys = JSON.parse(req.workspace?.disabledFeatureKeys ?? '[]')
  return isFlagEnabledForWorkspace(flag, req.workspace.id, disabledKeys)
}

function shapeContentPiece(row) {
  return {
    id:          row.id,
    title:       row.title,
    date:        row.scheduledDate,
    projectId:   row.project.id,
    projectName: row.project.name,
  }
}

async function listOwnContentPieces({ workspaceId, userId, from, to, enabled }) {
  if (!enabled) return []

  const rows = await prisma.contentPiece.findMany({
    where: {
      workspaceId,
      ownerId: userId,
      deletedAt: null,
      scheduledDate: { gte: from, lte: to },
      status: { notIn: TERMINAL_STATUSES },
      project: CONTENIDO_PROJECT_WHERE,
      tasks: { none: { userId, status: { not: 'COMPLETED' }, isAgentTask: false } },
    },
    select: {
      id: true, title: true, scheduledDate: true,
      project: { select: { id: true, name: true } },
    },
    orderBy: [{ scheduledDate: 'asc' }, { id: 'asc' }],
  })

  return rows
    .map(shapeContentPiece)
    .filter(piece => piece.date && piece.date >= from && piece.date <= to)
}

module.exports = { contentAgendaEnabled, shapeContentPiece, listOwnContentPieces, TERMINAL_STATUSES }
