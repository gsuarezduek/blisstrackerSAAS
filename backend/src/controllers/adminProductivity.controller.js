const prisma    = require('../lib/prisma')
const { generateMemoryForUser } = require('../services/insightMemory.service')
const { getWorkspaceStats, getAttendanceStats, getHoursHistory, computeBenchmark, memberStatus, median } = require('../services/productivityStats.service')
const { sendTestDigest } = require('../services/productivityDigest.service')
const { getProductivityPeriod, businessDaysBetween, tzOffsetStr, taskMins, daysBetweenInclusive } = require('../lib/timeMetrics')
const { createTtlCache } = require('../lib/ttlCache')

// La tabla de productividad hace bucketing pesado de logins + tareas + asistencia sobre
// todo el equipo en cada request. TTL 60s: para una vista analítica de admin el desfase
// es aceptable, y un "Actualizar" manual invalida la entrada (ver refreshProductivity).
// Clave por workspace+modo (current|previous|custom:from:to).
const prodCache = createTtlCache({ ttlMs: 60 * 1000, max: 200 })

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const MAX_CUSTOM_RANGE_DAYS = 366

// Lee y valida los parámetros de período de la query string.
// mode: 'current' (mes en curso, default) | 'previous' (mes anterior completo) |
// 'custom' (rango libre `from`/`to`, YYYY-MM-DD — cubre un mes específico del pasado o
// varios meses como un trimestre; tope de MAX_CUSTOM_RANGE_DAYS para no traer volúmenes
// de datos desmedidos). Devuelve { mode, from?, to? }; lanza 400 si custom viene inválido.
function resolvePeriodParams(req) {
  if (req.query.mode === 'custom') {
    const { from, to } = req.query
    if (!DATE_RE.test(from || '') || !DATE_RE.test(to || '') || from > to) {
      const err = new Error('Rango de fechas inválido')
      err.status = 400
      throw err
    }
    if (daysBetweenInclusive(from, to) > MAX_CUSTOM_RANGE_DAYS) {
      const err = new Error(`El rango no puede superar ${MAX_CUSTOM_RANGE_DAYS} días`)
      err.status = 400
      throw err
    }
    return { mode: 'custom', from, to }
  }
  return { mode: req.query.mode === 'previous' ? 'previous' : 'current' }
}

function cacheKeyFor(workspaceId, params) {
  return params.mode === 'custom'
    ? `prod:${workspaceId}:custom:${params.from}:${params.to}`
    : `prod:${workspaceId}:${params.mode}`
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
    const params = resolvePeriodParams(req)

    const cacheKey = cacheKeyFor(workspaceId, params)
    const cached = prodCache.get(cacheKey)
    if (cached) return res.json(cached)

    const tz = req.workspace.timezone
    const period = getProductivityPeriod(params.mode, tz, params)

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
    const params = resolvePeriodParams(req)
    const tz = req.workspace.timezone

    const cached = prodCache.get(cacheKeyFor(workspaceId, params))
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

    const period = getProductivityPeriod(params.mode, tz, params)
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
    const params = resolvePeriodParams(req)
    const period = getProductivityPeriod(params.mode, tz, params)
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

// GET /api/admin/productivity/users/:userId/hours-history?back=N
// Historial de horas por día de un solo usuario, corrido `back` bloques de 60 días hacia
// atrás (navegación a meses anteriores del gráfico de la fila expandida). Liviano y sin
// caché: no recalcula stats/asistencia, solo el historial — igual que el drill-down de
// `userBreakdown`, se pide bajo demanda al navegar, no en el fetch inicial de la tabla.
async function userHoursHistory(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const userId = Number(req.params.userId)
    const back = Math.max(0, Number(req.query.back) || 0)
    const tz = req.workspace.timezone

    const hist = await getHoursHistory(workspaceId, tz, { granularity: 'daily', days: 60, back })
    const history = hist.history.get(userId) || hist.labels.map(v => ({ [hist.key]: v, hours: 0 }))
    res.json({ history, key: hist.key })
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
    // Invalidamos todo lo cacheado de este workspace (current/previous/cualquier rango
    // custom en caché) para que el cambio se vea en el próximo fetch, sea cual sea el modo.
    prodCache.delPrefix(`prod:${workspace.id}:`)
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

module.exports = { listProductivity, userOverview, userBreakdown, userHoursHistory, refreshProductivity, sendDigestNow }
