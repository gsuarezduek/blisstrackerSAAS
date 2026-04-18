const prisma = require('../lib/prisma')

/**
 * GET /api/users
 * Lista todos los miembros del workspace actual (activos e inactivos).
 * Incluye datos personales para el panel de admin.
 */
async function list(req, res, next) {
  try {
    const workspaceId = req.workspace.id

    const members = await prisma.workspaceMember.findMany({
      where: { workspaceId },
      include: {
        user: {
          select: {
            id: true, name: true, email: true, avatar: true, createdAt: true,
            phone: true, birthday: true, address: true, dni: true, cuit: true, alias: true, bankName: true,
            maritalStatus: true, children: true, educationLevel: true, educationTitle: true,
            bloodType: true, medicalConditions: true, healthInsurance: true, emergencyContact: true,
          },
        },
      },
      orderBy: { user: { name: 'asc' } },
    })

    // Aplanar para mantener compatibilidad con el frontend
    const result = members.map(m => ({
      ...m.user,
      role: m.teamRole,
      isAdmin: m.role === 'admin' || m.role === 'owner',
      active: m.active,
      vacationDays: m.vacationDays,
      weeklyEmailEnabled: m.weeklyEmailEnabled,
      dailyInsightEnabled: m.dailyInsightEnabled,
      insightMemoryEnabled: m.insightMemoryEnabled,
      taskQualityEnabled: m.taskQualityEnabled,
    }))

    res.json(result)
  } catch (err) { next(err) }
}

/**
 * GET /api/users/:id/tasks
 * Tareas activas + completadas esta semana para un usuario del workspace.
 */
async function getUserTasks(req, res, next) {
  try {
    const userId = Number(req.params.id)
    const workspaceId = req.workspace.id
    const TZ = req.workspace.timezone

    const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: TZ })
    const [y, m, d] = todayStr.split('-').map(Number)
    const today = new Date(y, m - 1, d)
    const dow = today.getDay()
    const daysToMonday = dow === 0 ? 6 : dow - 1
    const monday = new Date(today)
    monday.setDate(today.getDate() - daysToMonday)
    const weekStart = monday.toISOString().slice(0, 10)
    const weekEnd   = todayStr

    // Offset de zona horaria para calcular rango UTC
    const tzOffset = -3 * 60 // ART es UTC-3; en el futuro usar workspace.timezone dinámicamente
    const fromUTC = new Date(`${weekStart}T00:00:00${tzOffset >= 0 ? '+' : '-'}${String(Math.abs(tzOffset / 60)).padStart(2, '0')}:00`)
    const toUTC   = new Date(`${weekEnd}T23:59:59${tzOffset >= 0 ? '+' : '-'}${String(Math.abs(tzOffset / 60)).padStart(2, '0')}:00`)

    const taskInclude = {
      project: true,
      _count: { select: { comments: true } },
    }

    const [activeTasks, completedTasks] = await Promise.all([
      prisma.task.findMany({
        where: {
          userId,
          status: { not: 'COMPLETED' },
          workDay: { workspaceId },
        },
        include: taskInclude,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.task.findMany({
        where: {
          userId,
          status: 'COMPLETED',
          completedAt: { gte: fromUTC, lte: toUTC },
          workDay: { workspaceId },
        },
        include: taskInclude,
        orderBy: { completedAt: 'desc' },
      }),
    ])

    const map = {}
    for (const t of activeTasks) {
      const pid = t.project.id
      if (!map[pid]) map[pid] = { project: t.project, tasks: [] }
      map[pid].tasks.push(t)
    }

    res.json({ byProject: Object.values(map), completedThisWeek: completedTasks })
  } catch (err) { next(err) }
}

module.exports = { list, getUserTasks }
