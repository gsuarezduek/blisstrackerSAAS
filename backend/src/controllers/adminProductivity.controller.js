const prisma    = require('../lib/prisma')
const { generateMemoryForUser } = require('../services/insightMemory.service')
const { getWorkspaceStats, getAttendanceStats, getHoursHistory, computeBenchmark, memberStatus, median } = require('../services/productivityStats.service')
const { sendTestDigest } = require('../services/productivityDigest.service')
const { getProductivityPeriod, businessDaysBetween, tzOffsetStr, taskMins } = require('../lib/timeMetrics')
const { createTtlCache } = require('../lib/ttlCache')

// La tabla de productividad hace bucketing pesado de logins + tareas + asistencia sobre
// todo el equipo en cada request. TTL 60s: para una vista analítica de admin el desfase
// es aceptable, y un "Actualizar" manual invalida la entrada (ver refreshProductivity).
// Clave por workspace+modo (current|closed).
const prodCache = createTtlCache({ ttlMs: 60 * 1000, max: 200 })

// Modo de período: 'current' (mes en curso vs anterior, default) o 'closed' (mes anterior vs ante-anterior).
function periodMode(req) {
  return req.query.mode === 'closed' ? 'closed' : 'current'
}

const EMPTY_STATS = { current: { totalCompleted: 0, totalMinutes: 0, daysWorked: 0, tasaCompletado: 0 },
  delta: { tareasPct: null, horasPct: null, tasaCompletadoPts: 0 },
  porProyecto: [], topProject: null, weeklySeries: [], stuckTasks: 0, recentInactive: false, hasData: false }

// Da forma a la fila de un miembro (tabla completa y overview de un solo usuario comparten
// exactamente este cálculo, para que los números nunca diverjan entre ambas vistas).
function shapeMember(m, statsMap, attendanceMap, hist) {
  const u = m.user
  const s = statsMap.get(u.id) || EMPTY_STATS
  const att = attendanceMap.get(u.id) || null
  const insight = u.insightMemories[0] || null

  // Δ horas = horas registradas (tiempo activo de tareas completadas) ÷ horas disponibles.
  const registeredHours = Math.round(s.current.totalMinutes / 60 * 10) / 10
  const availableHours   = att?.availableHours ?? null
  const utilization      = availableHours && availableHours > 0 ? registeredHours / availableHours : null
  const attendanceOut    = att ? { ...att, registeredHours, availableHours, utilization } : null
  const hoursHistory     = hist.history.get(u.id) || hist.labels.map(v => ({ [hist.key]: v, hours: 0 }))

  return {
    id: u.id,
    name: u.name,
    avatar: u.avatar,
    role: m.teamRole,
    status: memberStatus(s),
    stats: {
      completed: s.current.totalCompleted,
      hours: registeredHours,
      tasaCompletado: s.current.tasaCompletado,
      daysWorked: s.current.daysWorked,
      delta: s.delta,
      topProject: s.topProject,
      porProyecto: s.porProyecto.slice(0, 6),
      weeklySeries: s.weeklySeries,
      stuckTasks: s.stuckTasks,
      hasData: s.hasData,
      attendance: attendanceOut,
      utilization,
      hoursHistory,
    },
    insight: insight && (insight.tendencias || insight.fortalezas || insight.areasDeAtencion)
      ? { tendencias: insight.tendencias, fortalezas: insight.fortalezas, areasDeAtencion: insight.areasDeAtencion, updatedAt: insight.updatedAt }
      : null,
  }
}

async function listProductivity(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const mode = periodMode(req)

    const cacheKey = `prod:${workspaceId}:${mode}`
    const cached = prodCache.get(cacheKey)
    if (cached) return res.json(cached)

    const tz = req.workspace.timezone
    const period = getProductivityPeriod(mode, tz)

    const [members, statsMap, attendanceMap, hist] = await Promise.all([
      prisma.workspaceMember.findMany({
        where: { workspaceId, active: true },
        include: {
          user: {
            select: {
              id: true, name: true, avatar: true,
              insightMemories: {
                where: { workspaceId },
                select: { tendencias: true, fortalezas: true, areasDeAtencion: true, updatedAt: true },
                orderBy: { weekStart: 'desc' },
                take: 1,
              },
            },
          },
        },
        orderBy: { user: { name: 'asc' } },
      }),
      getWorkspaceStats(workspaceId, tz, period),
      getAttendanceStats(workspaceId, tz, period),
      getHoursHistory(workspaceId, tz, { granularity: 'daily', days: 60 }),
    ])

    const benchmark = computeBenchmark(statsMap)

    const result = members.map(m => shapeMember(m, statsMap, attendanceMap, hist))

    // Mediana de utilización del equipo (para "Comparación con el equipo" → Δ horas).
    if (benchmark) {
      const utils = result.map(r => r.stats.utilization).filter(v => v != null)
      benchmark.utilizationMedian = utils.length ? median(utils) : null
    }

    // Δ horas del equipo (encabezado de la sección): promedio simple de la utilización por persona,
    // más los totales para el detalle y la variante ponderada (Σ registradas ÷ Σ disponibles).
    const withUtil       = result.filter(r => r.stats.utilization != null)
    const totalRegistered = withUtil.reduce((s, r) => s + (r.stats.attendance?.registeredHours || 0), 0)
    const totalAvailable  = withUtil.reduce((s, r) => s + (r.stats.attendance?.availableHours  || 0), 0)
    const teamHours = {
      utilizationAvg:      withUtil.length ? withUtil.reduce((s, r) => s + r.stats.utilization, 0) / withUtil.length : null,
      utilizationWeighted: totalAvailable > 0 ? totalRegistered / totalAvailable : null,
      totalRegistered:     Math.round(totalRegistered * 10) / 10,
      totalAvailable:      Math.round(totalAvailable  * 10) / 10,
      nWithSchedule:       withUtil.length,
      nTotal:              result.length,
    }

    const periodOut = { ...period, businessDays: businessDaysBetween(period.curStart, period.curEnd) }
    const payload = { members: result, period: periodOut, benchmark, teamHours }
    prodCache.set(cacheKey, payload)
    res.json(payload)
  } catch (err) { next(err) }
}

// GET /api/admin/productivity/users/:userId/overview
// Slice de un solo miembro (mismo cálculo que listProductivity, benchmark incluido) para el
// panel de administración del perfil de usuario. Reaprovecha la caché de la tabla completa
// si ya está tibia; si no, computa directo (sin escribir ahí — sería una caché parcial).
async function userOverview(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const userId = Number(req.params.userId)
    const mode = periodMode(req)
    const tz = req.workspace.timezone

    const cached = prodCache.get(`prod:${workspaceId}:${mode}`)
    if (cached) {
      const found = cached.members.find(m => m.id === userId)
      if (found) return res.json({ member: found, benchmark: cached.benchmark, period: cached.period })
    }

    const member = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
      include: {
        user: {
          select: {
            id: true, name: true, avatar: true,
            insightMemories: {
              where: { workspaceId },
              select: { tendencias: true, fortalezas: true, areasDeAtencion: true, updatedAt: true },
              orderBy: { weekStart: 'desc' },
              take: 1,
            },
          },
        },
      },
    })
    if (!member) return res.status(404).json({ error: 'Usuario no encontrado en este workspace' })

    const period = getProductivityPeriod(mode, tz)
    const [statsMap, attendanceMap, hist] = await Promise.all([
      getWorkspaceStats(workspaceId, tz, period),
      getAttendanceStats(workspaceId, tz, period),
      getHoursHistory(workspaceId, tz, { granularity: 'daily', days: 60 }),
    ])
    const benchmark = computeBenchmark(statsMap)
    if (benchmark) {
      const utils = []
      for (const [uid, st] of statsMap) {
        const avail = attendanceMap.get(uid)?.availableHours ?? null
        const reg = st.current.totalMinutes / 60
        if (avail && avail > 0) utils.push(reg / avail)
      }
      benchmark.utilizationMedian = utils.length ? median(utils) : null
    }

    const shaped = shapeMember(member, statsMap, attendanceMap, hist)
    const periodOut = { ...period, businessDays: businessDaysBetween(period.curStart, period.curEnd) }
    res.json({ member: shaped, benchmark, period: periodOut })
  } catch (err) { next(err) }
}

// Drill-down persona→proyecto→tarea del período (lazy, al expandir un proyecto en el
// detalle de una persona). Reemplaza al viejo tab "Por persona" de Reportes.
// Usa taskMins (tope 8h) para ser consistente con las horas de la sección Productividad.
async function userBreakdown(req, res, next) {
  try {
    const userId = Number(req.params.userId)
    const workspaceId = req.workspace.id
    const tz = req.workspace.timezone
    const period = getProductivityPeriod(periodMode(req), tz)
    const offset = tzOffsetStr(tz)

    const tasks = await prisma.task.findMany({
      where: {
        userId,
        status: 'COMPLETED',
        completedAt: {
          gte: new Date(period.curStart + 'T00:00:00' + offset),
          lte: new Date(period.curEnd   + 'T23:59:59' + offset),
        },
        workDay: { workspaceId },
      },
      select: {
        id: true, description: true, startedAt: true, completedAt: true,
        pausedMinutes: true, minutesOverride: true,
        project: { select: { id: true, name: true } },
      },
      orderBy: { completedAt: 'desc' },
    })

    const byProject = {}
    for (const t of tasks) {
      const mins = taskMins(t)
      const pid = t.project.id
      if (!byProject[pid]) byProject[pid] = { project: t.project, minutes: 0, taskList: [] }
      byProject[pid].minutes += mins
      byProject[pid].taskList.push({
        id: t.id, description: t.description, minutes: mins,
        completedAt: t.completedAt,
        isOverride: t.minutesOverride !== null && t.minutesOverride !== undefined,
      })
    }

    res.json({
      byProject: Object.values(byProject)
        .map(p => ({ ...p, taskList: p.taskList.sort((a, b) => new Date(a.completedAt) - new Date(b.completedAt)) }))
        .sort((a, b) => b.minutes - a.minutes),
    })
  } catch (err) { next(err) }
}

async function refreshProductivity(req, res, next) {
  try {
    const userId = Number(req.params.userId)
    const workspace = req.workspace

    const member = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: workspace.id, userId } },
    })
    if (!member || !member.active) return res.status(404).json({ error: 'Usuario no encontrado' })

    await generateMemoryForUser(userId, workspace)
    // Se regeneró la memoria IA de un miembro → la tabla cacheada quedó desactualizada.
    // Invalidamos ambos modos del workspace para que el cambio se vea en el próximo fetch.
    prodCache.del(`prod:${workspace.id}:current`)
    prodCache.del(`prod:${workspace.id}:closed`)
    const memory = await prisma.userInsightMemory.findFirst({
      where: { userId, workspaceId: workspace.id },
      orderBy: { weekStart: 'desc' },
      select: { tendencias: true, fortalezas: true, areasDeAtencion: true, updatedAt: true },
    })
    const hasContent = memory && (memory.tendencias || memory.fortalezas || memory.areasDeAtencion)
    res.json(hasContent ? memory : null)
  } catch (err) { next(err) }
}

// POST /api/admin/productivity/digest/send-now — envía el aviso de prueba al admin que lo pide.
async function sendDigestNow(req, res, next) {
  try {
    const email = req.user?.email
    if (!email) return res.status(400).json({ error: 'No se encontró tu email' })
    const result = await sendTestDigest(req.workspace, email)
    res.json(result)
  } catch (err) { next(err) }
}

module.exports = { listProductivity, userOverview, userBreakdown, refreshProductivity, sendDigestNow }
