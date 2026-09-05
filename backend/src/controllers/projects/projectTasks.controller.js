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
        id: true, name: true, createdAt: true, situation: true,
        timezone: true, linksEnabled: true, situationEnabled: true, briefsEnabled: true,
        websiteUrl: true, connections: true,
        chatChannel: { select: { slug: true } },
        links:    { orderBy: { createdAt: 'asc' } },
        services: { include: { service: true }, orderBy: { service: { name: 'asc' } } },
        members:  {
          include: { user: { select: { id: true, name: true, avatar: true } } },
          orderBy: { user: { name: 'asc' } },
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
        },
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
        take: ACTIVE_LIMIT,
      }),
      prisma.task.count({
        where: { projectId, status: { in: ['PENDING', 'IN_PROGRESS', 'PAUSED', 'BLOCKED'] }, ...notFuture },
      }),
    ])

    const byUser = {}
    for (const task of activeTasks) {
      const uid = task.user.id
      if (!byUser[uid]) byUser[uid] = { user: task.user, tasks: [] }
      byUser[uid].tasks.push({
        id: task.id, description: task.description, status: task.status,
        blockedReason: task.blockedReason, createdAt: task.createdAt, startedAt: task.startedAt,
        pausedAt: task.pausedAt, pausedMinutes: task.pausedMinutes, sessions: task.sessions,
        projectId: task.projectId, _count: task._count, recurrenceId: task.recurrenceId,
        createdBy: task.createdBy?.id !== task.user.id ? task.createdBy : null,
      })
    }

    res.json({
      project,
      byUser: Object.values(byUser),
      activeCount,
      activeLimit: ACTIVE_LIMIT,
    })
  } catch (err) { next(err) }
}

// GET /projects/:id/completed?skip=&from=&to=&userId= — historial de tareas
// completadas, con filtro opcional de rango de fechas (por completedAt, tz del
// workspace) y de persona. Lectura abierta a cualquier miembro del workspace.
async function projectCompletedHistory(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const tz = req.workspace.timezone
    const projectId = await resolveProjectId(req.params.id, workspaceId)
    if (!projectId) return res.status(404).json({ error: 'Proyecto no encontrado' })
    const skip = Math.max(0, Number(req.query.skip ?? 0))
    const TAKE = 20
    const { from, to, userId } = req.query

    const where = { projectId, status: 'COMPLETED' }
    if (from || to) where.completedAt = buildCompletedAtWhere(from, to, tz)
    if (userId) where.userId = Number(userId)

    const tasks = await prisma.task.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, avatar: true } },
        _count: { select: { comments: true } },
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
      })),
      hasMore,
    })
  } catch (err) { next(err) }
}

module.exports = { projectTasks, projectCompletedHistory }
