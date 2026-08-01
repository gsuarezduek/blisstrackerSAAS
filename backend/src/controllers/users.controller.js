const prisma = require('../lib/prisma')
const { taskMins, tzOffsetStr } = require('../lib/timeMetrics')

// Filtro Prisma { gte, lte } para un intervalo de días [startStr, endStr] (YYYY-MM-DD), en la TZ dada.
function utcRange(startStr, endStr, tz) {
  const off = tzOffsetStr(tz) // ej "-03:00"
  return {
    gte: new Date(`${startStr}T00:00:00.000${off}`),
    lte: new Date(`${endStr}T23:59:59.999${off}`),
  }
}

// Lunes (YYYY-MM-DD) de la semana que contiene `dateStr`.
function mondayOf(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  const dow = dt.getUTCDay()
  const daysToMonday = dow === 0 ? 6 : dow - 1
  dt.setUTCDate(dt.getUTCDate() - daysToMonday)
  return dt.toISOString().slice(0, 10)
}

// Suma n días a una fecha YYYY-MM-DD (n puede ser negativo).
function shiftDay(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + n))
  return dt.toISOString().slice(0, 10)
}

const memberUserSelect = {
  id: true, name: true, email: true, avatar: true, createdAt: true,
  phone: true, birthday: true, address: true, dni: true, cuit: true, alias: true, bankName: true,
  maritalStatus: true, children: true, educationLevel: true, educationTitle: true,
  bloodType: true, medicalConditions: true, healthInsurance: true, emergencyContact: true,
}

// Aplana WorkspaceMember + User en un solo objeto (compatibilidad con el frontend).
function flattenMember(m) {
  return {
    ...m.user,
    role: m.teamRole,
    workspaceJoinedAt: m.joinedAt,
    isAdmin: m.role === 'admin' || m.role === 'owner',
    active: m.active,
    vacationDays: m.vacationDays,
    workStartTime: m.workStartTime,
    workEndTime: m.workEndTime,
    legajoData: m.legajoData ?? {},
    weeklyEmailEnabled: m.weeklyEmailEnabled,
    dailyInsightEnabled: m.dailyInsightEnabled,
    insightMemoryEnabled: m.insightMemoryEnabled,
    taskQualityEnabled: m.taskQualityEnabled,
  }
}

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
      include: { user: { select: memberUserSelect } },
      orderBy: { user: { name: 'asc' } },
    })

    res.json(members.map(flattenMember))
  } catch (err) { next(err) }
}

/**
 * GET /api/users/:id/admin-detail
 * Datos personales + legajo + saldo de vacaciones + preferencias de IA de UN usuario
 * (admin-only). Mismo shape que un item de GET /api/users, pero sin traer al resto del
 * workspace — se usa en el panel de administración del perfil público de un usuario.
 */
async function getAdminUserDetail(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const targetId = Number(req.params.id)

    const member = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: targetId } },
      include: { user: { select: memberUserSelect } },
    })
    if (!member) return res.status(404).json({ error: 'Usuario no encontrado en este workspace' })

    res.json(flattenMember(member))
  } catch (err) { next(err) }
}

/**
 * GET /api/users/:id/tasks
 * Tareas activas + completadas esta semana para un usuario del workspace.
 */
// Include para tareas del perfil: proyecto, quién la creó/delegó, asignado y conteo de comentarios.
const profileTaskInclude = {
  project: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true, avatar: true } },
  user: { select: { id: true, name: true, avatar: true } },
  _count: { select: { comments: true } },
}

/**
 * GET /api/users/:id/profile
 * Perfil público de una persona del workspace (accesible a cualquier miembro).
 * Devuelve datos básicos, proyectos, estado de licencia, resumen de completadas
 * y las tareas activas/futuras/delegadas (en ambos sentidos).
 */
async function getUserProfile(req, res, next) {
  try {
    const targetId = Number(req.params.id)
    const workspaceId = req.workspace.id
    const TZ = req.workspace.timezone

    const member = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: targetId } },
      include: {
        user: { select: { id: true, name: true, email: true, avatar: true } },
      },
    })
    if (!member) return res.status(404).json({ error: 'Usuario no encontrado en este workspace' })

    const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: TZ })
    const monthStart = `${todayStr.slice(0, 7)}-01`
    const weekStart = mondayOf(todayStr)

    const notFuture = { OR: [{ scheduledFor: null }, { scheduledFor: { lte: todayStr } }] }

    const [projectMembers, onLeaveReq, completedMonth, activeTasks, futureTasks, delegatedByThem, delegatedToThem] = await Promise.all([
      prisma.projectMember.findMany({
        where: { userId: targetId, project: { workspaceId, active: true } },
        select: { project: { select: { id: true, name: true } } },
      }),
      prisma.vacationRequest.findFirst({
        where: {
          workspaceId, userId: targetId, status: 'approved',
          startDate: { lte: todayStr }, endDate: { gte: todayStr },
        },
        select: { type: true, startDate: true, endDate: true },
      }),
      // Completadas del mes en curso (1 → hoy): se bucketea día/semana/mes en JS.
      prisma.task.findMany({
        where: {
          userId: targetId, status: 'COMPLETED', workDay: { workspaceId },
          completedAt: utcRange(monthStart, todayStr, TZ),
        },
        select: { completedAt: true, minutesOverride: true, startedAt: true, pausedMinutes: true },
      }),
      prisma.task.findMany({
        where: { userId: targetId, status: { not: 'COMPLETED' }, workDay: { workspaceId }, ...notFuture },
        include: profileTaskInclude,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.task.findMany({
        where: { userId: targetId, status: { not: 'COMPLETED' }, workDay: { workspaceId }, scheduledFor: { gt: todayStr } },
        include: profileTaskInclude,
        orderBy: { scheduledFor: 'asc' },
      }),
      prisma.task.findMany({
        where: {
          createdById: targetId, userId: { not: targetId }, status: { not: 'COMPLETED' },
          workDay: { workspaceId }, ...notFuture,
        },
        include: profileTaskInclude,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.task.findMany({
        where: {
          userId: targetId, status: { not: 'COMPLETED' }, workDay: { workspaceId }, ...notFuture,
          AND: [{ createdById: { not: null } }, { createdById: { not: targetId } }],
        },
        include: profileTaskInclude,
        orderBy: { createdAt: 'desc' },
      }),
    ])

    // Resumen de completadas: hoy / semana / mes (a la fecha), con minutos vía taskMins.
    const { gte: dayFrom } = utcRange(todayStr, todayStr, TZ)
    const { gte: weekFrom } = utcRange(weekStart, todayStr, TZ)
    const summary = { day: { count: 0, minutes: 0 }, week: { count: 0, minutes: 0 }, month: { count: 0, minutes: 0 } }
    for (const t of completedMonth) {
      const mins = taskMins(t)
      const at = new Date(t.completedAt)
      summary.month.count++; summary.month.minutes += mins
      if (at >= weekFrom) { summary.week.count++; summary.week.minutes += mins }
      if (at >= dayFrom) { summary.day.count++; summary.day.minutes += mins }
    }

    const byStatus = { IN_PROGRESS: [], PENDING: [], PAUSED: [], BLOCKED: [] }
    for (const t of activeTasks) {
      if (byStatus[t.status]) byStatus[t.status].push(t)
    }

    res.json({
      user: {
        id: member.user.id,
        name: member.user.name,
        email: member.user.email,
        avatar: member.user.avatar,
        teamRole: member.teamRole,
        workspaceJoinedAt: member.joinedAt,
        active: member.active,
      },
      projects: projectMembers.map(pm => pm.project),
      onLeave: onLeaveReq || null,
      summary,
      active: byStatus,
      future: futureTasks,
      delegatedByThem,
      delegatedToThem,
    })
  } catch (err) { next(err) }
}

/**
 * GET /api/users/:id/completed?period=day|week|month&date=YYYY-MM-DD
 * Tareas completadas por una persona en el período anclado a `date` (TZ del workspace).
 */
async function getUserCompleted(req, res, next) {
  try {
    const targetId = Number(req.params.id)
    const workspaceId = req.workspace.id
    const TZ = req.workspace.timezone

    const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: TZ })
    const period = ['day', 'week', 'month'].includes(req.query.period) ? req.query.period : 'day'
    const date = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date || '') ? req.query.date : todayStr

    let startStr, endStr
    if (period === 'week') {
      startStr = mondayOf(date)
      endStr = shiftDay(startStr, 6)
    } else if (period === 'month') {
      startStr = `${date.slice(0, 7)}-01`
      const [y, m] = date.split('-').map(Number)
      endStr = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
    } else {
      startStr = date
      endStr = date
    }

    const tasks = await prisma.task.findMany({
      where: {
        userId: targetId, status: 'COMPLETED', workDay: { workspaceId },
        completedAt: utcRange(startStr, endStr, TZ),
      },
      include: profileTaskInclude,
      orderBy: { completedAt: 'desc' },
    })

    let totalMinutes = 0
    const items = tasks.map(t => {
      const minutes = taskMins(t)
      totalMinutes += minutes
      return {
        id: t.id,
        description: t.description,
        project: t.project,
        createdAt: t.createdAt,
        completedAt: t.completedAt,
        minutes,
        createdBy: t.createdBy,
        _count: t._count,
      }
    })

    res.json({ period, startDate: startStr, endDate: endStr, items, total: { count: items.length, minutes: totalMinutes } })
  } catch (err) { next(err) }
}

module.exports = { list, getAdminUserDetail, getUserProfile, getUserCompleted }
