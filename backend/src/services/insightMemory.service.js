const prisma = require('../lib/prisma')
const { parseAIJson } = require('../utils/parseAIJson')

const { anthropic } = require('../lib/claude')
const AI_TIMEOUT_MS = 20000
const { logTokens } = require('../lib/logTokens')
const { getNWeeksAgoMonday, daysAgo, fmtMins, businessDaysBetween } = require('../lib/timeMetrics')
const { todayString } = require('../utils/dates')
const { getMemberStats, getWorkspaceStats, computeBenchmark } = require('./productivityStats.service')

const pct    = r => `${Math.round(r * 100)}%`
const signed = n => (n > 0 ? `+${n}` : `${n}`)
const fmtPct = r => (r === null ? 's/d' : `${r > 0 ? '+' : ''}${Math.round(r * 100)}%`)

// workspace: { id, timezone }
// opts.stats      — stats de productividad ya computadas (evita re-fetch en el cron batch)
// opts.benchmark  — mediana del equipo ya computada (evita re-fetch en el cron batch)
async function generateMemoryForUser(userId, workspace, opts = {}) {
  const tz          = workspace.timezone
  const workspaceId = workspace.id
  const { hasTokenBudget } = require('../lib/tokenBudget')
  if (!(await hasTokenBudget(workspaceId))) {
    console.log(`[InsightMemory] Workspace ${workspaceId} superó el límite mensual de tokens — omitiendo usuario ${userId}`)
    return
  }
  const fourWeeksAgo  = getNWeeksAgoMonday(4, tz)
  const thirtyDaysAgo = daysAgo(30, tz)

  const [user, member, feedbackRecords] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true },
    }),
    prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
      select: { teamRole: true, insightMemoryEnabled: true },
    }),
    prisma.dailyInsight.findMany({
      where: {
        userId,
        workspaceId,
        feedback: { not: null },
        createdAt: { gte: new Date(thirtyDaysAgo) },
      },
      select: { feedback: true },
    }),
  ])

  if (!user || !member) return null

  const teamRole = member.teamRole || null

  // Métricas determinísticas (período actual vs previo) + benchmark del equipo
  const stats = opts.stats || await getMemberStats(userId, workspaceId, tz)
  const benchmark = opts.benchmark !== undefined
    ? opts.benchmark
    : computeBenchmark(await getWorkspaceStats(workspaceId, tz))

  const c = stats.current, p = stats.previous, d = stats.delta

  // Perfil del rol
  const roleExpectation = teamRole
    ? await prisma.roleExpectation.findUnique({
        where: { workspaceId_roleName: { workspaceId, roleName: teamRole } },
        select: { description: true, expectedResults: true, operationalResponsibilities: true },
      })
    : null

  // Asistencia del período (para distinguir "menos días" por licencia/ausencia de bajo rendimiento)
  const windowEnd = todayString(tz)
  const windowBiz = businessDaysBetween(fourWeeksAgo, windowEnd)
  const approvedLeaves = await prisma.vacationRequest.findMany({
    where: { workspaceId, userId, status: 'approved', startDate: { lte: windowEnd }, endDate: { gte: fourWeeksAgo } },
    select: { startDate: true, endDate: true, type: true },
  })
  let leaveDays = 0
  for (const lv of approvedLeaves) {
    const s = lv.startDate > fourWeeksAgo ? lv.startDate : fourWeeksAgo
    const e = lv.endDate   < windowEnd    ? lv.endDate   : windowEnd
    leaveDays += businessDaysBetween(s, e)
  }

  // Receptividad al coaching (feedback de los últimos 30 días)
  const upvotes   = feedbackRecords.filter(f => f.feedback === 'up').length
  const downvotes = feedbackRecords.filter(f => f.feedback === 'down').length
  const feedbackScore = (upvotes + downvotes) >= 5
    ? Math.round(upvotes / (upvotes + downvotes) * 100) / 100
    : null

  // Contexto para Claude
  let ctx = `PERFIL DE PRODUCTIVIDAD — ÚLTIMAS 4 SEMANAS vs 4 SEMANAS PREVIAS\n`
  ctx += `Rol: ${teamRole || 'sin rol definido'}\n`

  if (roleExpectation) {
    if (roleExpectation.description) ctx += `Propósito del rol: ${roleExpectation.description}\n`
    const results = Array.isArray(roleExpectation.expectedResults) ? roleExpectation.expectedResults : []
    if (results.length > 0) ctx += `Resultados esperados: ${results.join(' | ')}\n`
    const resps = Array.isArray(roleExpectation.operationalResponsibilities) ? roleExpectation.operationalResponsibilities : []
    if (resps.length > 0) ctx += `Responsabilidades: ${resps.map(r => r.category).join(', ')}\n`
  }

  ctx += `\nMÉTRICAS (actual → previo → cambio):\n`
  ctx += `- Tareas completadas: ${c.totalCompleted} → ${p.totalCompleted} (${fmtPct(d.tareasPct)})\n`
  ctx += `- Tasa de completado: ${pct(c.tasaCompletado)} → ${pct(p.tasaCompletado)} (${signed(d.tasaCompletadoPts)} pts)\n`
  ctx += `- Horas trabajadas: ${(c.totalMinutes / 60).toFixed(1)}h → ${(p.totalMinutes / 60).toFixed(1)}h (${fmtPct(d.horasPct)})\n`
  ctx += `- Días con actividad: ${c.daysWorked} de ${windowBiz} hábiles${leaveDays > 0 ? ` (${leaveDays} de licencia aprobada)` : ''} → ${p.daysWorked} en el período previo\n`
  if (stats.stuckTasks > 0) ctx += `- Tareas atascadas (>7 días sin moverse): ${stats.stuckTasks}\n`

  if (benchmark) {
    ctx += `\nBENCHMARK DEL EQUIPO (mediana de ${benchmark.teamSize} personas con actividad):\n`
    ctx += `- Tasa de completado: ${pct(benchmark.tasaCompletado)} | Tareas/día: ${benchmark.tareasPorDia} | Horas: ${benchmark.horas}h\n`
  }

  if (stats.porProyecto.length > 0) {
    ctx += `\nTIEMPO POR PROYECTO (período actual):\n`
    for (const pr of stats.porProyecto.slice(0, 5)) {
      ctx += `  - ${pr.name}: ${fmtMins(pr.minutes)} (${pr.completadas} completadas)\n`
    }
  }

  if (feedbackScore !== null) {
    ctx += `\nReceptividad al coaching: ${pct(feedbackScore)} de insights aceptados (${upvotes}👍/${downvotes}👎)\n`
  }

  const msg = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 400,
    system: `Sos un analista de productividad para el dueño de una agencia. El dueño ya conoce a cada persona; no necesita un resumen genérico, necesita señales accionables y honestas para decidir.

Recibís métricas que comparan el período actual con el previo, más el benchmark (mediana) del equipo.

Devolvés ÚNICAMENTE un objeto JSON con estas tres claves. CUALQUIERA puede ser null:
- tendencias: SOLO el cambio más relevante respecto al período previo, citando el número. Ej: "Cayó de 18 a 7 tareas completadas (-61%)". Si nada cambió de forma significativa, null.
- fortalezas: SOLO si está claramente por encima de la mediana del equipo en alguna métrica, citando el número concreto. Si no supera el benchmark, null. No inventes fortalezas.
- areasDeAtencion: SOLO riesgos evidenciados con un número del contexto (caída fuerte, tasa baja vs equipo, tareas atascadas, desalineación con el rol). Si no hay número que lo respalde, null.

Reglas estrictas:
- Máximo 25 palabras por campo.
- Español rioplatense, directo, sin adulación ni relleno ni obviedades.
- No repitas la misma idea en dos campos.
- Los conteos absolutos (tareas, horas, días) son de ventanas del mismo largo, pero NO interpretes "menos días con actividad" como bajo rendimiento por sí solo: puede ser licencia o ausencia. Si la licencia aprobada lo explica, no lo marques como riesgo. Para tendencia, priorizá métricas de ritmo (tareas/día, tasa) sobre conteos absolutos.
- Preferí null antes que decir algo genérico. Un perfil con los tres campos en null es una respuesta válida y correcta para alguien estable y dentro del promedio.`,
    messages: [{ role: 'user', content: ctx }],
  }, { timeout: AI_TIMEOUT_MS })
  logTokens('insightMemory', userId, msg.usage, workspaceId)

  let parsed
  try { parsed = parseAIJson(msg.content[0].text) }
  catch { throw new Error('Respuesta de IA inválida') }

  const clean = v => (v && String(v).trim().toLowerCase() !== 'null' ? String(v).trim() : '')

  const estadisticas = {
    tasaCompletado: c.tasaCompletado,
    promedioTareasPorDia: c.tareasPorDia,
    totalCompleted: c.totalCompleted,
    totalMinutes: c.totalMinutes,
    daysWorked: c.daysWorked,
    delta: d,
    topProject: stats.topProject,
    porProyecto: stats.porProyecto.slice(0, 6),
    weeklySeries: stats.weeklySeries,
    stuckTasks: stats.stuckTasks,
  }

  await prisma.userInsightMemory.upsert({
    where: { userId_workspaceId_weekStart: { userId, workspaceId, weekStart: fourWeeksAgo } },
    create: {
      userId,
      workspaceId,
      tendencias:      clean(parsed.tendencias),
      fortalezas:      clean(parsed.fortalezas),
      areasDeAtencion: clean(parsed.areasDeAtencion),
      estadisticas,
      weekStart: fourWeeksAgo,
    },
    update: {
      tendencias:      clean(parsed.tendencias),
      fortalezas:      clean(parsed.fortalezas),
      areasDeAtencion: clean(parsed.areasDeAtencion),
      estadisticas,
    },
  })

  // Mantener solo las últimas 4 entradas por usuario/workspace
  const allRecords = await prisma.userInsightMemory.findMany({
    where: { userId, workspaceId },
    orderBy: { weekStart: 'desc' },
    select: { id: true },
  })
  if (allRecords.length > 4) {
    const toDelete = allRecords.slice(4).map(r => r.id)
    await prisma.userInsightMemory.deleteMany({ where: { id: { in: toDelete } } })
  }
}

async function updateAllMemories() {
  // Obtener todos los miembros activos con insightMemoryEnabled en workspaces activos
  const members = await prisma.workspaceMember.findMany({
    where: {
      active: true,
      insightMemoryEnabled: true,
      workspace: { status: { in: ['active', 'trialing'] } },
    },
    include: {
      user:      { select: { id: true, name: true } },
      workspace: { select: { id: true, timezone: true } },
    },
  })

  console.log(`[InsightMemory] Procesando ${members.length} miembro${members.length !== 1 ? 's' : ''}...`)

  // Cachear stats y benchmark por workspace para no recalcular en cada miembro.
  const wsCache = new Map() // workspaceId -> { statsMap, benchmark }
  async function workspaceContext(workspace) {
    if (!wsCache.has(workspace.id)) {
      const statsMap = await getWorkspaceStats(workspace.id, workspace.timezone)
      wsCache.set(workspace.id, { statsMap, benchmark: computeBenchmark(statsMap) })
    }
    return wsCache.get(workspace.id)
  }

  for (let i = 0; i < members.length; i++) {
    const m = members[i]
    try {
      const { statsMap, benchmark } = await workspaceContext(m.workspace)
      await generateMemoryForUser(m.user.id, m.workspace, {
        stats: statsMap.get(m.user.id),
        benchmark,
      })
      console.log(`[InsightMemory] ✓ ${m.user.name}`)
    } catch (err) {
      console.error(`[InsightMemory] Error para ${m.user.name}:`, err.message)
    }
    if (i < members.length - 1) {
      await new Promise(r => setTimeout(r, 3000))
    }
  }

  console.log('[InsightMemory] Completado.')
}

module.exports = { generateMemoryForUser, updateAllMemories }
