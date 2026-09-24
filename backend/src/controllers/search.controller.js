const prisma = require('../lib/prisma')
const { isFlagEnabledForWorkspace } = require('../lib/featureFlags')
const { hasModuleAccess } = require('../lib/moduleAccess')
const { taskInclude } = require('./tasks/_shared')

const MIN_QUERY_LENGTH = 2
const LIMIT = 6

/**
 * ¿El módulo `key` está disponible para este request? Mismo criterio que
 * `requireFeatureFlag` + `moduleAccessGuard` (flag habilitado para el workspace
 * y acceso por rol), pero como booleano: acá un módulo no disponible no es un
 * 403, simplemente no aporta resultados al buscador.
 */
async function moduleAvailable(req, key) {
  if (!hasModuleAccess(req, key)) return false
  if (req.user?.isSuperAdmin) return true
  const flag = await prisma.featureFlag.findUnique({ where: { key } })
  const disabledKeys = JSON.parse(req.workspace?.disabledFeatureKeys ?? '[]')
  return isFlagEnabledForWorkspace(flag, req.workspace.id, disabledKeys)
}

/**
 * GET /api/search?q=
 * Buscador global (Cmd/Ctrl+K): tareas, piezas de Contenido, reuniones de
 * Calendario y archivos de proyecto en una sola llamada. Cada bloque respeta el
 * mismo criterio de acceso que su módulo (Contenido/Calendario: flag + acceso
 * por rol; Archivos: `Project.filesEnabled`) — un módulo no disponible devuelve
 * lista vacía. Tareas, reuniones y archivos son visibles para cualquier miembro
 * del workspace ("equipo = etiqueta, no barrera"), igual que en sus pantallas.
 */
async function globalSearch(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : ''
    if (q.length < MIN_QUERY_LENGTH) return res.json({ tasks: [], pieces: [], events: [], files: [] })
    const contains = { contains: q, mode: 'insensitive' }

    const [contenidoOk, calendarioOk] = await Promise.all([
      moduleAvailable(req, 'contenido'),
      moduleAvailable(req, 'calendario'),
    ])

    const [tasks, pieces, events, files] = await Promise.all([
      prisma.task.findMany({
        where: { workDay: { workspaceId }, description: contains },
        include: { ...taskInclude, user: { select: { id: true, name: true, avatar: true } } },
        orderBy: { createdAt: 'desc' },
        take: LIMIT,
      }),
      contenidoOk
        ? prisma.contentPiece.findMany({
            where: { workspaceId, deletedAt: null, title: contains },
            select: { id: true, title: true, status: true, projectId: true, project: { select: { name: true } } },
            orderBy: { updatedAt: 'desc' },
            take: LIMIT,
          })
        : [],
      calendarioOk
        ? prisma.calendarEvent.findMany({
            where: { workspaceId, title: contains },
            select: { id: true, title: true, date: true, startTime: true, project: { select: { name: true } } },
            orderBy: { date: 'desc' },
            take: LIMIT,
          })
        : [],
      prisma.projectFile.findMany({
        where: {
          workspaceId, deletedAt: null, name: contains,
          project: { filesEnabled: true },
          OR: [{ type: 'folder' }, { type: 'file', status: 'ready' }],
        },
        select: { id: true, name: true, type: true, projectId: true, project: { select: { name: true } } },
        orderBy: { name: 'asc' },
        take: LIMIT,
      }),
    ])

    res.json({ tasks, pieces, events, files })
  } catch (err) { next(err) }
}

module.exports = { globalSearch }
