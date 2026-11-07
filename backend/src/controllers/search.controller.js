const prisma = require('../lib/prisma')
const { isFlagEnabledForWorkspace } = require('../lib/featureFlags')
const { hasModuleAccess } = require('../lib/moduleAccess')
const { isAdmin } = require('../lib/projectAccess')
const { taskInclude } = require('./tasks/_shared')
const { buildTextSearchFilters } = require('../lib/textSearch')

const MIN_QUERY_LENGTH = 2
const LIMIT = 6
const MAX_INT4 = 2147483647

// Número de tarea: el id que muestra el detalle de la tarea (#29943) es la
// referencia que circula cuando un agente dice "mirá la tarea 29943", así que el
// buscador la acepta tal como la pasan — con #, sin #, o con la palabra adelante.
// Devuelve el id o null si no es una referencia a una tarea.
function parseTaskId(q) {
  const m = /^(?:tareas?\s*)?#?(\d+)$/i.exec(q)
  if (!m) return null
  const id = Number(m[1])
  return Number.isInteger(id) && id > 0 && id <= MAX_INT4 ? id : null
}

// Proyectos privados (ver concepto "Proyectos privados"): ningún bloque del
// buscador global debe devolver contenido de un proyecto privado ajeno. Admin/
// owner no necesita filtro (ve todo); el resto solo ve resultados de proyectos
// no privados o donde es del equipo (ProjectMember). `requireProject: true` es
// para relaciones `project` obligatorias (Task/ContentPiece/ProjectFile);
// CalendarEvent.projectId es nullable (eventos legacy), así que ahí además hay
// que dejar pasar los que no tienen proyecto asociado.
function projectVisibilityWhere(req, { requireProject = true } = {}) {
  if (isAdmin(req)) return {}
  const condition = { OR: [{ isPrivate: false }, { isPrivate: true, members: { some: { userId: req.user.userId } } }] }
  return requireProject ? { project: condition } : { OR: [{ projectId: null }, { project: condition }] }
}

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
    const taskId = parseTaskId(q)
    // Un número suelto puede ser sólo un id y por eso esquiva el mínimo de
    // caracteres; cuando es más corto que el mínimo ("7") la búsqueda por texto se
    // saltea entera, porque devolvería cualquier tarea que tenga un 7 en la
    // descripción — ruido en lugar de la tarea que se pidió por número.
    const textOk = q.length >= MIN_QUERY_LENGTH
    if (!textOk && taskId === null) return res.json({ tasks: [], pieces: [], events: [], files: [] })
    // Las palabras se combinan con AND y toleran tildes (ver lib/textSearch.js):
    // "perez" encuentra a "Pérez" y "posteos noviembre" encuentra "Posteos de
    // noviembre". Un campo por entidad, el mismo criterio en los cuatro bloques.
    const matching = field => ({ AND: buildTextSearchFilters(q, field) })

    const [contenidoOk, calendarioOk] = await Promise.all([
      moduleAvailable(req, 'contenido'),
      moduleAvailable(req, 'calendario'),
    ])

    const taskWhere = { workDay: { workspaceId }, ...projectVisibilityWhere(req) }
    const taskArgs = { include: { ...taskInclude, user: { select: { id: true, name: true, avatar: true } } } }

    const [textTasks, taskById, pieces, events, files] = await Promise.all([
      textOk
        ? prisma.task.findMany({
            where: { ...taskWhere, ...matching('description') },
            ...taskArgs,
            orderBy: { createdAt: 'desc' },
            take: LIMIT,
          })
        : [],
      // El match por id es exacto: quien escribió un número buscaba esa tarea y no
      // una que la mencione, así que va al frente de la lista.
      taskId === null ? null : prisma.task.findFirst({ where: { ...taskWhere, id: taskId }, ...taskArgs }),
      contenidoOk && textOk
        ? prisma.contentPiece.findMany({
            where: { workspaceId, deletedAt: null, ...matching('title'), ...projectVisibilityWhere(req) },
            select: { id: true, title: true, status: true, projectId: true, project: { select: { name: true } } },
            orderBy: { updatedAt: 'desc' },
            take: LIMIT,
          })
        : [],
      calendarioOk && textOk
        ? prisma.calendarEvent.findMany({
            where: { workspaceId, ...matching('title'), ...projectVisibilityWhere(req, { requireProject: false }) },
            select: { id: true, title: true, date: true, startTime: true, project: { select: { name: true } } },
            orderBy: { date: 'desc' },
            take: LIMIT,
          })
        : [],
      textOk
        ? prisma.projectFile.findMany({
            where: {
              workspaceId, deletedAt: null, ...matching('name'),
              project: { filesEnabled: true, ...projectVisibilityWhere(req).project },
              OR: [{ type: 'folder' }, { type: 'file', status: 'ready' }],
            },
            select: { id: true, name: true, type: true, projectId: true, project: { select: { name: true } } },
            orderBy: { name: 'asc' },
            take: LIMIT,
          })
        : [],
    ])

    const tasks = taskById
      ? [taskById, ...textTasks.filter(t => t.id !== taskById.id)].slice(0, LIMIT)
      : textTasks

    res.json({ tasks, pieces, events, files })
  } catch (err) { next(err) }
}

module.exports = { globalSearch }
