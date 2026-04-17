const Anthropic = require('@anthropic-ai/sdk')
const prisma = require('../lib/prisma')
const { todayString } = require('../utils/dates')
const { parseAIJson } = require('../utils/parseAIJson')

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const AI_TIMEOUT_MS = 20000
const { logTokens } = require('../lib/logTokens')
const TZ = 'America/Argentina/Buenos_Aires'

function getNWeeksAgoMonday(n) {
  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: TZ })
  const [y, m, d] = todayStr.split('-').map(Number)
  const today = new Date(y, m - 1, d)
  const dow = today.getDay()
  const daysToMonday = dow === 0 ? 6 : dow - 1
  const monday = new Date(today)
  monday.setDate(today.getDate() - daysToMonday - n * 7)
  return monday.toISOString().slice(0, 10)
}

function daysAgo(n) {
  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: TZ })
  const [y, m, d] = todayStr.split('-').map(Number)
  const date = new Date(y, m - 1, d - n)
  return date.toISOString().slice(0, 10)
}

// Minutos activos reales: descuenta pausas del tiempo total
function taskMins(t) {
  if (t.minutesOverride != null) return t.minutesOverride
  if (t.startedAt && t.completedAt) {
    const raw = Math.round((new Date(t.completedAt) - new Date(t.startedAt)) / 60000)
    return Math.min(480, Math.max(0, raw - (t.pausedMinutes || 0)))
  }
  return 0
}

function fmtMins(m) {
  const h = Math.floor(m / 60)
  const min = m % 60
  return h > 0 ? `${h}h${min > 0 ? min + 'm' : ''}` : `${min}m`
}

async function generateMemoryForUser(userId) {
  const fourWeeksAgo = getNWeeksAgoMonday(4)
  const today = todayString()
  const thirtyDaysAgo = daysAgo(30)

  const [user, completedTasks, workDays, previousMemories, feedbackRecords] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, role: true, insightMemoryEnabled: true },
    }),
    prisma.task.findMany({
      where: {
        userId,
        status: 'COMPLETED',
        completedAt: {
          gte: new Date(fourWeeksAgo + 'T00:00:00-03:00'),
          lte: new Date(today        + 'T23:59:59-03:00'),
        },
      },
      select: {
        id: true,
        projectId: true,
        startedAt: true,
        completedAt: true,
        pausedMinutes: true,
        minutesOverride: true,
        project: { select: { name: true } },
        workDay: { select: { date: true } },
      },
    }),
    prisma.workDay.findMany({
      where: { userId, date: { gte: fourWeeksAgo, lte: today } },
      include: {
        tasks: {
          select: {
            id: true,
            status: true,
            projectId: true,
            blockedReason: true,
            pausedMinutes: true,
            project: { select: { name: true } },
          },
        },
      },
    }),
    // Últimas 3 memorias para comparar evolución
    prisma.userInsightMemory.findMany({
      where: { userId, weekStart: { not: '' } },
      orderBy: { weekStart: 'desc' },
      take: 3,
      select: { weekStart: true, estadisticas: true },
    }),
    // Feedback de los últimos 30 días para medir receptividad
    prisma.dailyInsight.findMany({
      where: {
        userId,
        feedback: { not: null },
        createdAt: { gte: new Date(thirtyDaysAgo) },
      },
      select: { feedback: true, tono: true },
    }),
  ])

  if (!user) return null

  // Perfil del rol
  const roleExpectation = user.role
    ? await prisma.roleExpectation.findUnique({
        where: { roleName: user.role },
        select: { description: true, expectedResults: true, operationalResponsibilities: true, recurrentTasks: true },
      })
    : null

  // Estadísticas base
  const workDaysWithTasks = workDays.filter(wd => wd.tasks.length > 0)
  const totalCreated   = workDays.reduce((s, wd) => s + wd.tasks.length, 0)
  const totalCompleted = completedTasks.length
  const tasaCompletado = totalCreated > 0
    ? Math.round((totalCompleted / totalCreated) * 100) / 100
    : 0
  const promedioTareasPorDia = workDaysWithTasks.length > 0
    ? Math.round((totalCompleted / workDaysWithTasks.length) * 10) / 10
    : 0
  const proyectosSimultaneos = workDaysWithTasks.length > 0
    ? Math.round(
        workDaysWithTasks.reduce((s, wd) =>
          s + new Set(wd.tasks.map(t => t.projectId)).size, 0
        ) / workDaysWithTasks.length * 10
      ) / 10
    : 0

  // Promedio en pausa antes de retomar
  const pausedCompleted = completedTasks.filter(t => (t.pausedMinutes || 0) > 0)
  const avgPauseMinutes = pausedCompleted.length > 0
    ? Math.round(pausedCompleted.reduce((s, t) => s + t.pausedMinutes, 0) / pausedCompleted.length)
    : 0

  // Tareas atascadas (siguen PAUSED/BLOCKED al final del período)
  const stuckTasksCount = workDays.reduce(
    (s, wd) => s + wd.tasks.filter(t => t.status === 'PAUSED' || t.status === 'BLOCKED').length, 0
  )

  // Clasificación de velocidad: quickWins / deepWork / mediana
  const taskDurations = completedTasks.map(t => taskMins(t)).filter(m => m > 0).sort((a, b) => a - b)
  const quickWins = taskDurations.filter(m => m < 30).length
  const deepWork  = taskDurations.filter(m => m >= 90).length
  const medianMinutes = taskDurations.length > 0
    ? taskDurations[Math.floor(taskDurations.length / 2)]
    : 0

  // Tasa de completado por proyecto (contando TODAS las tareas del período)
  const byProjectAll = {}
  for (const wd of workDays) {
    for (const t of wd.tasks) {
      const name = t.project.name
      if (!byProjectAll[name]) byProjectAll[name] = { creadas: 0, completadas: 0, minutes: 0 }
      byProjectAll[name].creadas += 1
    }
  }
  for (const t of completedTasks) {
    const name = t.project.name
    if (!byProjectAll[name]) byProjectAll[name] = { creadas: 0, completadas: 0, minutes: 0 }
    byProjectAll[name].completadas += 1
    byProjectAll[name].minutes     += taskMins(t)
  }
  // Top proyectos por tiempo invertido
  const porProyecto = Object.entries(byProjectAll)
    .sort((a, b) => b[1].minutes - a[1].minutes)
    .slice(0, 4)
    .map(([nombre, { creadas, completadas, minutes }]) => ({ nombre, creadas, completadas, minutes }))

  // Receptividad al coaching (feedback de los últimos 30 días)
  const upvotes   = feedbackRecords.filter(f => f.feedback === 'up').length
  const downvotes = feedbackRecords.filter(f => f.feedback === 'down').length
  const totalFeedback = upvotes + downvotes
  const feedbackScore = totalFeedback >= 5
    ? Math.round(upvotes / totalFeedback * 100) / 100
    : null

  // Días con bloqueos
  const daysWithBlocks = new Set()
  for (const wd of workDays) {
    if (wd.tasks.some(t => t.status === 'BLOCKED')) daysWithBlocks.add(wd.date)
  }

  // Totales de tiempo
  const totalMinutes = porProyecto.reduce((s, p) => s + p.minutes, 0)

  // Contexto para Claude
  let ctx = `ANÁLISIS DE LAS ÚLTIMAS 4 SEMANAS\n`
  ctx += `Rol: ${user.role}\n`

  // Perfil del rol — para que Claude contextualice el rendimiento
  if (roleExpectation) {
    if (roleExpectation.description) {
      ctx += `Propósito del rol: ${roleExpectation.description}\n`
    }
    const results = Array.isArray(roleExpectation.expectedResults) ? roleExpectation.expectedResults : []
    if (results.length > 0) {
      ctx += `Resultados esperados: ${results.join(' | ')}\n`
    }
    const resps = Array.isArray(roleExpectation.operationalResponsibilities) ? roleExpectation.operationalResponsibilities : []
    if (resps.length > 0) {
      ctx += `Responsabilidades: ${resps.map(r => r.category).join(', ')}\n`
    }
  }
  ctx += `Días trabajados: ${workDaysWithTasks.length}\n`
  ctx += `Tareas creadas: ${totalCreated} | Completadas: ${totalCompleted} (${Math.round(tasaCompletado * 100)}%)\n`
  ctx += `Promedio tareas/día: ${promedioTareasPorDia} | Proyectos simultáneos: ${proyectosSimultaneos}\n`
  if (totalMinutes > 0) ctx += `Tiempo total trabajado: ${fmtMins(totalMinutes)}\n`
  if (daysWithBlocks.size > 0) ctx += `Días con bloqueos activos: ${daysWithBlocks.size}\n`
  if (stuckTasksCount > 0) ctx += `Tareas atascadas (PAUSED/BLOCKED sin resolver): ${stuckTasksCount}\n`
  if (avgPauseMinutes > 0) ctx += `Promedio en pausa antes de retomar: ${fmtMins(avgPauseMinutes)}\n`

  if (taskDurations.length > 0) {
    ctx += `Velocidad: mediana ${medianMinutes}m/tarea`
    if (quickWins > 0) ctx += `, ${quickWins} quick wins (<30m)`
    if (deepWork  > 0) ctx += `, ${deepWork} trabajo profundo (≥90m)`
    ctx += '\n'
  }

  if (porProyecto.length > 0) {
    ctx += `Distribución por proyecto:\n`
    for (const p of porProyecto) {
      const pct = p.creadas > 0 ? Math.round(p.completadas / p.creadas * 100) : 0
      ctx += `  - ${p.nombre}: ${p.completadas}/${p.creadas} completadas (${pct}%)${p.minutes > 0 ? ', ' + fmtMins(p.minutes) : ''}\n`
    }
  }

  if (feedbackScore !== null) {
    ctx += `Receptividad al coaching: ${Math.round(feedbackScore * 100)}% de insights aceptados (${upvotes}👍 / ${downvotes}👎)\n`
  }

  // Evolución histórica semana a semana
  if (previousMemories.length > 0) {
    ctx += `\nEVOLUCIÓN HISTÓRICA:\n`
    for (const m of previousMemories) {
      const s = m.estadisticas || {}
      if (s.tasaCompletado !== undefined) {
        ctx += `  ${m.weekStart}: ${Math.round(s.tasaCompletado * 100)}% completado`
        if (s.promedioTareasPorDia) ctx += `, ${s.promedioTareasPorDia} tareas/día`
        if (s.medianMinutes > 0)    ctx += `, mediana ${s.medianMinutes}m`
        if (s.stuckTasksCount > 0)  ctx += `, ${s.stuckTasksCount} atascadas`
        ctx += '\n'
      }
    }
  }

  const msg = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 500,
    system: `Analizás el historial de trabajo de un usuario y generás un perfil de productividad en JSON.

Si el contexto incluye "Propósito del rol", "Resultados esperados" o "Responsabilidades", usalos para evaluar si el trabajo real está alineado con lo que se espera del rol. Por ejemplo: si se espera producir piezas visuales pero el historial muestra pocas tareas de diseño, eso es relevante para areasDeAtencion.

Devolvés ÚNICAMENTE un objeto JSON válido con estas claves:
- tendencias: 1-2 oraciones sobre patrones de comportamiento. Usá datos concretos: proyectos con más tiempo, ritmo (quick wins vs trabajo profundo), tendencia temporal si hay evolución histórica. Si el trabajo está bien alineado con el propósito del rol, mencionalo.
- fortalezas: 1 oración específica sobre dónde tiene mejor rendimiento. Mencioná proyectos y métricas concretas.
- areasDeAtencion: 1-2 oraciones sobre los patrones negativos más relevantes. Priorizá por impacto: desalineación con resultados esperados del rol, tasa de completado baja por proyecto, tareas atascadas, bloqueos recurrentes. null si no hay señales preocupantes.

Español rioplatense, directo. Solo hechos que los datos muestran. No supongas lo que no está en los datos.`,
    messages: [{ role: 'user', content: ctx }],
  }, { timeout: AI_TIMEOUT_MS })
  logTokens('insightMemory', userId, msg.usage)

  let parsed
  try { parsed = parseAIJson(msg.content[0].text) }
  catch { throw new Error('Respuesta de IA inválida') }

  const estadisticas = {
    tasaCompletado,
    promedioTareasPorDia,
    proyectosSimultaneos,
    avgPauseMinutes,
    stuckTasksCount,
    quickWins,
    deepWork,
    medianMinutes,
    feedbackScore,
    porProyecto,
  }

  await prisma.userInsightMemory.upsert({
    where: { userId_weekStart: { userId, weekStart: fourWeeksAgo } },
    create: {
      userId,
      tendencias:      String(parsed.tendencias      || ''),
      fortalezas:      String(parsed.fortalezas      || ''),
      areasDeAtencion: parsed.areasDeAtencion ? String(parsed.areasDeAtencion) : '',
      estadisticas,
      weekStart: fourWeeksAgo,
    },
    update: {
      tendencias:      String(parsed.tendencias      || ''),
      fortalezas:      String(parsed.fortalezas      || ''),
      areasDeAtencion: parsed.areasDeAtencion ? String(parsed.areasDeAtencion) : '',
      estadisticas,
    },
  })

  // Mantener solo las últimas 4 entradas por usuario
  const allRecords = await prisma.userInsightMemory.findMany({
    where: { userId, weekStart: { not: '' } },
    orderBy: { weekStart: 'desc' },
    select: { id: true },
  })
  if (allRecords.length > 4) {
    const toDelete = allRecords.slice(4).map(r => r.id)
    await prisma.userInsightMemory.deleteMany({ where: { id: { in: toDelete } } })
  }
}

async function updateAllMemories() {
  const users = await prisma.user.findMany({
    where: { active: true, insightMemoryEnabled: true },
    select: { id: true, name: true },
  })

  console.log(`[InsightMemory] Procesando ${users.length} usuarios...`)

  for (let i = 0; i < users.length; i++) {
    try {
      await generateMemoryForUser(users[i].id)
      console.log(`[InsightMemory] ✓ ${users[i].name}`)
    } catch (err) {
      console.error(`[InsightMemory] Error para ${users[i].name}:`, err.message)
    }
    if (i < users.length - 1) {
      await new Promise(r => setTimeout(r, 3000))
    }
  }

  console.log('[InsightMemory] Completado.')
}

module.exports = { generateMemoryForUser, updateAllMemories }
