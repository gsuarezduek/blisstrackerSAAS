const prisma = require('../../lib/prisma')
const { todayString } = require('../../utils/dates')
const { buildCompletedAtWhere } = require('../../lib/timeMetrics')
const { resolveProjectId } = require('./_shared')

async function projectTasks(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const tz = req.workspace.timezone
    const projectId = await resolveProjectId(req.params.id, workspaceId)
    if (!projectId) return res.status(404).json({ error: 'Proyecto no encontrado' })

    // Lectura abierta a cualquier integrante del workspace (proyecto scopeado por workspaceId).
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true, name: true, createdAt: true,
        timezone: true, linksEnabled: true, situationEnabled: true, briefsEnabled: true, filesEnabled: true,
        marketingEnabled: true, contenidoEnabled: true,
        websiteUrl: true, connections: true, isPrivate: true,
        chatChannel: { select: { slug: true } },
        links:    { orderBy: { createdAt: 'asc' } },
        services: { include: { service: true }, orderBy: { service: { name: 'asc' } } },
        members:  {
          include: { user: { select: { id: true, name: true, avatar: true } } },
          orderBy: { user: { name: 'asc' } },
        },
        // Agentes del equipo del proyecto: los pinta la tarjeta "Equipo" del Resumen y
        // alimentan el filtro por agente del historial de completadas.
        agents: {
          include: { agent: { select: { id: true, label: true, color: true, teamRole: true, user: { select: { id: true, name: true } } } } },
          orderBy: { agent: { label: 'asc' } },
        },
      },
    })
    if (!project) return res.status(404).json({ error: 'Proyecto no encontrado' })

    const ACTIVE_LIMIT = 200

    const today = todayString(tz)
    // Excluir tareas futuras programadas (scheduledFor posterior a hoy)
    const notFuture = { OR: [{ scheduledFor: null }, { scheduledFor: { lte: today } }] }

    const [activeTasks, activeCount] = await Promise.all([
      prisma.task.findMany({
        where: { projectId, status: { in: ['PENDING', 'IN_PROGRESS', 'PAUSED', 'BLOCKED'] }, ...notFuture },
        include: {
          user:      { select: { id: true, name: true, avatar: true } },
          createdBy: { select: { id: true, name: true } },
          _count:    { select: { comments: true } },
          sessions:  { select: { startedAt: true, endedAt: true } },
          agent:     { select: { id: true, label: true, color: true, teamRole: true } }, // tarea de agente: la ejecuta un agente de IA de esa persona
          createdByAgent: { select: { id: true, label: true } }, // la creó un agente (el detalle lo muestra)
        },
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
        take: ACTIVE_LIMIT,
      }),
      prisma.task.count({
        where: { projectId, status: { in: ['PENDING', 'IN_PROGRESS', 'PAUSED', 'BLOCKED'] }, ...notFuture },
      }),
    ])

    const shape = task => ({
      id: task.id, description: task.description, status: task.status,
      blockedReason: task.blockedReason, createdAt: task.createdAt, startedAt: task.startedAt,
      pausedAt: task.pausedAt, pausedMinutes: task.pausedMinutes, sessions: task.sessions,
      projectId: task.projectId, _count: task._count, recurrenceId: task.recurrenceId,
      createdBy: task.createdBy?.id !== task.user.id ? task.createdBy : null,
      isAgentTask: task.isAgentTask, agent: task.agent, agentName: task.agentName,
      // El include ya traía `createdByAgent` y este map lo descartaba, así que la
      // pestaña no podía mostrar "la creó un agente" aunque el dato estuviera en la
      // consulta.
      createdByAgent: task.createdByAgent, createdByAgentName: task.createdByAgentName,
    })

    // Dos grupos, no uno. Antes todo se agrupaba por `Task.userId`, y como una tarea de
    // agente lleva a su dueño como responsable, el trabajo de los agentes caía dentro de
    // la tarjeta de la persona — mezclado con el suyo y ordenado a mano para que al menos
    // quedara junto. Separarlos es lo que deja ver qué hizo cada agente en esta cuenta.
    const byUser = {}
    const byAgent = {}
    for (const task of activeTasks) {
      const row = shape(task)
      if (!task.isAgentTask) {
        const uid = task.user.id
        byUser[uid] ??= { user: task.user, tasks: [] }
        byUser[uid].tasks.push(row)
        continue
      }
      // `agentId` null + isAgentTask = delegada a "cualquiera de los agentes de esta
      // persona" y todavía sin tomar. Se agrupa por DUEÑO (clave `any:<userId>`) porque
      // no hay un agente al que atribuirla, y meterla en la tarjeta de uno cualquiera
      // sería inventar quién la está haciendo.
      const key = task.agent ? `a:${task.agent.id}` : `any:${task.user.id}`
      byAgent[key] ??= { key, agent: task.agent, owner: task.user, tasks: [] }
      byAgent[key].tasks.push(row)
    }

    res.json({
      project,
      byUser: Object.values(byUser),
      byAgent: Object.values(byAgent),
      activeCount,
      activeLimit: ACTIVE_LIMIT,
    })
  } catch (err) { next(err) }
}

// GET /projects/:id/completed?skip=&from=&to=&userId=&agentId= — historial de tareas
// completadas, con filtro opcional de rango de fechas (por completedAt, tz del
// workspace), de persona y de agente. Lectura abierta a cualquier miembro del workspace.
async function projectCompletedHistory(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const tz = req.workspace.timezone
    const projectId = await resolveProjectId(req.params.id, workspaceId)
    if (!projectId) return res.status(404).json({ error: 'Proyecto no encontrado' })
    const skip = Math.max(0, Number(req.query.skip ?? 0))
    const TAKE = 20
    const { from, to, userId, agentId } = req.query

    const where = { projectId, status: 'COMPLETED' }
    if (from || to) where.completedAt = buildCompletedAtWhere(from, to, tz)
    if (userId) where.userId = Number(userId)
    // `agentId` filtra por EJECUTOR, no por dueño: es independiente de `userId` (se
    // pueden combinar, aunque la UI ofrece uno u otro).
    if (agentId) where.agentId = Number(agentId)

    const tasks = await prisma.task.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, avatar: true } },
        _count: { select: { comments: true } },
        agent: { select: { id: true, label: true, color: true } }, // tarea de agente: la ejecutó un agente de IA de esa persona
        createdBy: { select: { id: true, name: true } },
        createdByAgent: { select: { id: true, label: true } }, // quién la creó (el detalle lo muestra)
      },
      orderBy: { completedAt: 'desc' },
      skip,
      take: TAKE + 1,
    })

    const hasMore = tasks.length > TAKE
    res.json({
      tasks: tasks.slice(0, TAKE).map(t => ({
        id: t.id, description: t.description, completedAt: t.completedAt, user: t.user,
        startedAt: t.startedAt, pausedMinutes: t.pausedMinutes, minutesOverride: t.minutesOverride,
        _count: t._count,
        isAgentTask: t.isAgentTask, agent: t.agent, agentName: t.agentName,
      })),
      hasMore,
    })
  } catch (err) { next(err) }
}

module.exports = { projectTasks, projectCompletedHistory }
