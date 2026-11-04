const prisma = require('../../lib/prisma')
const { isYMD } = require('../../utils/dates')
const { taskMins } = require('../../lib/timeMetrics')
const { isAdmin } = require('../../lib/projectAccess')
const { formatAgentName } = require('../../lib/agentTasks')

// ─── GET /api/tasks/search ──────────────────────────────────────────────────
// Búsqueda de tareas por texto y filtros, con filas livianas. Nació para los
// agentes conectados por MCP: sin esto, la única forma de saber si una tarea ya
// existía era pedir la jornada entera (o la cola) y mirar a ojo, que es cómo se
// terminan creando duplicados. Las filas van recortadas a mano (no `taskInclude`)
// porque el consumidor paga cada campo en tokens.
//
// Alcance: por default las tareas de la persona dueña del token (las suyas y las
// de sus agentes). Mirar las de otra persona requiere admin/owner, mismo criterio
// que `/workdays/today?userId=`. Los proyectos privados quedan afuera para quien
// no es del equipo ni admin (ver concepto "Proyectos privados").

const STATUSES = ['PENDING', 'IN_PROGRESS', 'PAUSED', 'BLOCKED', 'COMPLETED']
const OPEN_STATUSES = ['PENDING', 'IN_PROGRESS', 'PAUSED', 'BLOCKED']
const DEFAULT_TAKE = 20
const MAX_TAKE = 50
const MAX_Q = 120

// "open" / "abiertas" como atajo del conjunto que se pide siempre, más una lista
// explícita separada por comas. Un valor que no existe es un 400 y no un filtro
// vacío: si no, buscar con un estado mal escrito devolvería "no hay nada".
function parseStatuses(raw) {
  if (!raw) return null
  const parts = String(raw).split(',').map(s => s.trim().toUpperCase()).filter(Boolean)
  const out = new Set()
  for (const part of parts) {
    if (part === 'OPEN' || part === 'ABIERTAS') OPEN_STATUSES.forEach(s => out.add(s))
    else if (STATUSES.includes(part)) out.add(part)
    else return { error: `Estado inválido: "${part}". Válidos: ${STATUSES.join(', ')} (o "open" para todas las abiertas)` }
  }
  return { list: [...out] }
}

function shapeRow(t) {
  const row = {
    id: t.id,
    description: t.description,
    status: t.status,
    project: t.project,
    owner: t.user?.name ?? null,
    ownerId: t.userId,
    date: t.workDay?.date ?? null,
    createdAt: t.createdAt,
  }
  if (t.isAgentTask) row.executor = 'agent'
  // Mismo formato "<token> · <nombre declarado>" que el resto de la app.
  if (t.agent || t.agentName) row.agent = formatAgentName(t.agent, t.agentName)
  if (t.scheduledFor) row.scheduledFor = t.scheduledFor
  if (t.isBacklog) row.isBacklog = true
  if (t.starred) row.starred = t.starred
  if (t.blockedReason) row.blockedReason = t.blockedReason
  if (t.status === 'COMPLETED') {
    row.completedAt = t.completedAt
    row.workedMinutes = taskMins(t)
  }
  if (t._count?.comments) row.comments = t._count.comments
  return row
}

async function searchTasks(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const viewerId = req.user.userId

    // Otra persona: solo admin/owner. Sin userId, las de quien pregunta.
    let userId = viewerId
    if (req.query.userId != null && req.query.userId !== '') {
      const asked = Number(req.query.userId)
      if (!Number.isInteger(asked) || asked <= 0) return res.status(400).json({ error: 'userId inválido' })
      if (asked !== viewerId && !isAdmin(req)) {
        return res.status(403).json({ error: 'Solo un admin/owner puede buscar tareas de otra persona' })
      }
      userId = asked
    }

    const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, MAX_Q) : ''
    const statuses = parseStatuses(req.query.status)
    if (statuses?.error) return res.status(400).json({ error: statuses.error })

    const take = Math.min(MAX_TAKE, Math.max(1, Number(req.query.take) || DEFAULT_TAKE))

    const where = { userId, workDay: { workspaceId } }
    if (q) where.description = { contains: q, mode: 'insensitive' }
    if (statuses) where.status = { in: statuses.list }

    if (req.query.projectId != null && req.query.projectId !== '') {
      const projectId = Number(req.query.projectId)
      if (!Number.isInteger(projectId) || projectId <= 0) return res.status(400).json({ error: 'projectId inválido' })
      where.projectId = projectId
    }

    // executor: 'user' = las que hace la persona, 'agent' = las que hacen sus
    // agentes, 'any' (default) = las dos. Mismo vocabulario que task_create.
    const executor = req.query.executor
    if (executor === 'user') where.isAgentTask = false
    else if (executor === 'agent') where.isAgentTask = true
    else if (executor != null && executor !== '' && executor !== 'any') {
      return res.status(400).json({ error: "executor inválido ('user' | 'agent' | 'any')" })
    }

    // Rango sobre el día de la jornada en la que vive la tarea (`workDay.date`),
    // que es la fecha que muestra la app — no `createdAt`, que para una tarea
    // arrastrada o re-alojada no coincide con el día en que se trabajó.
    const from = isYMD(req.query.from) ? req.query.from : null
    const to = isYMD(req.query.to) ? req.query.to : null
    if (from || to) {
      where.workDay = { workspaceId, date: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
    }

    // Proyectos privados: quien no es admin solo ve los no privados o los suyos.
    if (!isAdmin(req)) {
      where.project = { OR: [{ isPrivate: false }, { members: { some: { userId: viewerId } } }] }
    }

    const rows = await prisma.task.findMany({
      where,
      select: {
        id: true, description: true, status: true, userId: true, createdAt: true,
        completedAt: true, startedAt: true, pausedMinutes: true, minutesOverride: true,
        scheduledFor: true, isBacklog: true, starred: true, blockedReason: true,
        isAgentTask: true, agentName: true,
        project: { select: { id: true, name: true } },
        user: { select: { name: true } },
        workDay: { select: { date: true } },
        agent: { select: { id: true, label: true } },
        _count: { select: { comments: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: take + 1,
    })

    res.json({ tasks: rows.slice(0, take).map(shapeRow), hasMore: rows.length > take })
  } catch (err) { next(err) }
}

module.exports = { searchTasks }
