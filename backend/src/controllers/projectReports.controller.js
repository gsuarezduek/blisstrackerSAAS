const prisma = require('../lib/prisma')
const { taskMins, buildCompletedAtWhere, monthStringInTz } = require('../lib/timeMetrics')
const { monthBounds, prevMonthsArr, monthLabel } = require('../lib/monthUtils')

// Resuelve :id (numérico o name) a un projectId del workspace actual.
async function resolveProjectId(param, workspaceId) {
  const num = Number(param)
  if (Number.isInteger(num) && num > 0) {
    const p = await prisma.project.findFirst({ where: { id: num, workspaceId }, select: { id: true } })
    return p?.id ?? null
  }
  const p = await prisma.project.findFirst({ where: { name: param, workspaceId }, select: { id: true } })
  return p?.id ?? null
}

/**
 * GET /api/projects/:id/reports/hours-history?months=12
 * Horas registradas + tareas completadas por mes calendario, de UN solo proyecto,
 * con desglose por persona. Lectura abierta a cualquier miembro del workspace
 * (mismo criterio que briefs/reuniones — "equipo = etiqueta, no barrera").
 */
async function hoursHistory(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const tz = req.workspace.timezone
    const projectId = await resolveProjectId(req.params.id, workspaceId)
    if (!projectId) return res.status(404).json({ error: 'Proyecto no encontrado' })

    const months = Math.min(24, Math.max(1, Number(req.query.months) || 12))
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, name: true, hoursEnabled: true, monthlyHours: true },
    })

    const currentMonth = monthStringInTz(new Date(), tz)
    const monthKeys = prevMonthsArr(currentMonth, months) // ascendente
    const completedAtRange = buildCompletedAtWhere(
      monthBounds(monthKeys[0]).startDate,
      monthBounds(monthKeys[monthKeys.length - 1]).endDate,
      tz,
    )

    const tasks = await prisma.task.findMany({
      where: {
        projectId,
        status: 'COMPLETED',
        startedAt: { not: null },
        completedAt: { not: null, ...completedAtRange },
      },
      select: {
        id: true, description: true, startedAt: true, completedAt: true,
        pausedMinutes: true, minutesOverride: true,
        user: { select: { id: true, name: true, avatar: true } },
      },
      orderBy: { completedAt: 'desc' },
    })

    const bucket = {}
    for (const m of monthKeys) {
      bucket[m] = { month: m, label: monthLabel(m), totalMinutes: 0, taskCount: 0, byUser: {} }
    }
    for (const t of tasks) {
      const key = monthStringInTz(t.completedAt, tz)
      const b = bucket[key]
      if (!b) continue // fuera del rango pedido (no debería pasar dado el filtro de completedAt)
      const mins = taskMins(t)
      b.totalMinutes += mins
      b.taskCount += 1
      const uid = t.user.id
      if (!b.byUser[uid]) b.byUser[uid] = { user: t.user, minutes: 0, tasks: 0, taskList: [] }
      b.byUser[uid].minutes += mins
      b.byUser[uid].tasks += 1
      b.byUser[uid].taskList.push({
        id: t.id, description: t.description, minutes: mins,
        completedAt: t.completedAt,
        isOverride: t.minutesOverride !== null && t.minutesOverride !== undefined,
      })
    }

    const monthsOut = monthKeys.map(m => ({ ...bucket[m], byUser: Object.values(bucket[m].byUser) })).reverse()

    res.json({ project, months: monthsOut })
  } catch (err) { next(err) }
}

module.exports = { hoursHistory }
