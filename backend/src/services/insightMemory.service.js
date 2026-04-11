const Anthropic = require('@anthropic-ai/sdk')
const prisma = require('../lib/prisma')
const { todayString } = require('../utils/dates')

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

// Minutos activos reales: descuenta pausas del tiempo total
function taskMins(t) {
  if (t.minutesOverride != null) return t.minutesOverride
  if (t.startedAt && t.completedAt) {
    const raw = Math.round((new Date(t.completedAt) - new Date(t.startedAt)) / 60000)
    return Math.min(480, Math.max(0, raw - (t.pausedMinutes || 0)))
  }
  return 0
}

async function generateMemoryForUser(userId) {
  const fourWeeksAgo = getNWeeksAgoMonday(4)
  const today = todayString()

  const [user, completedTasks, workDays, previousMemories] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, role: true },
    }),
    prisma.task.findMany({
      where: {
        userId,
        status: 'COMPLETED',
        workDay: { date: { gte: fourWeeksAgo, lte: today } },
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
          },
        },
      },
    }),
    // Últimas 3 memorias anteriores para mostrar evolución
    prisma.userInsightMemory.findMany({
      where: { userId, weekStart: { not: '' } },
      orderBy: { weekStart: 'desc' },
      take: 3,
      select: { weekStart: true, estadisticas: true },
    }),
  ])

  if (!user) return null

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

  // Promedio de minutos en PAUSED para tareas completadas que fueron pausadas
  const pausedCompleted = completedTasks.filter(t => (t.pausedMinutes || 0) > 0)
  const avgPauseMinutes = pausedCompleted.length > 0
    ? Math.round(pausedCompleted.reduce((s, t) => s + t.pausedMinutes, 0) / pausedCompleted.length)
    : 0

  // Tareas atascadas (siguen PAUSED o BLOCKED en el período)
  const stuckTasksCount = workDays.reduce(
    (s, wd) => s + wd.tasks.filter(t => t.status === 'PAUSED' || t.status === 'BLOCKED').length, 0
  )

  // Distribución por proyecto con tiempo real
  const byProject = {}
  for (const t of completedTasks) {
    const name = t.project.name
    if (!byProject[name]) byProject[name] = { count: 0, minutes: 0 }
    byProject[name].count   += 1
    byProject[name].minutes += taskMins(t)
  }
  const projectSummary = Object.entries(byProject)
    .sort((a, b) => b[1].minutes - a[1].minutes)
    .slice(0, 8)
    .map(([p, { count, minutes }]) => {
      const h = Math.floor(minutes / 60)
      const m = minutes % 60
      const timeStr = h > 0 ? `${h}h${m > 0 ? m + 'm' : ''}` : `${m}m`
      return `${p}: ${count} tareas, ${timeStr}`
    })
    .join(' | ')

  // Días con bloqueos
  const daysWithBlocks = new Set()
  for (const wd of workDays) {
    if (wd.tasks.some(t => t.status === 'BLOCKED')) daysWithBlocks.add(wd.date)
  }

  // Contexto para Claude
  const totalMinutes = Object.values(byProject).reduce((s, v) => s + v.minutes, 0)
  const totalHours = Math.floor(totalMinutes / 60)
  const totalMinsRem = totalMinutes % 60

  let ctx = `ANÁLISIS DE LAS ÚLTIMAS 4 SEMANAS\n`
  ctx += `Rol: ${user.role}\n`
  ctx += `Días trabajados: ${workDaysWithTasks.length}\n`
  ctx += `Tareas creadas: ${totalCreated} | Completadas: ${totalCompleted} (${Math.round(tasaCompletado * 100)}%)\n`
  ctx += `Promedio tareas/día: ${promedioTareasPorDia} | Proyectos simultáneos: ${proyectosSimultaneos}\n`
  if (totalMinutes > 0) {
    ctx += `Tiempo total trabajado: ${totalHours > 0 ? totalHours + 'h' : ''}${totalMinsRem > 0 ? totalMinsRem + 'm' : ''}\n`
  }
  if (projectSummary) ctx += `Distribución por proyecto: ${projectSummary}\n`
  if (daysWithBlocks.size > 0) ctx += `Días con bloqueos activos: ${daysWithBlocks.size}\n`
  if (stuckTasksCount > 0) ctx += `Tareas atascadas (PAUSED/BLOCKED sin resolver): ${stuckTasksCount}\n`
  if (avgPauseMinutes > 0) {
    const ph = Math.floor(avgPauseMinutes / 60)
    const pm = avgPauseMinutes % 60
    ctx += `Promedio en pausa antes de retomar: ${ph > 0 ? ph + 'h' : ''}${pm > 0 ? pm + 'm' : ''}\n`
  }

  // Evolución histórica (últimas semanas previas)
  if (previousMemories.length > 0) {
    ctx += `\nEVOLUCIÓN HISTÓRICA:\n`
    for (const m of previousMemories) {
      const s = m.estadisticas || {}
      if (s.tasaCompletado !== undefined) {
        ctx += `  Semana ${m.weekStart}: ${Math.round(s.tasaCompletado * 100)}% completado`
        if (s.promedioTareasPorDia) ctx += `, ${s.promedioTareasPorDia} tareas/día`
        if (s.avgPauseMinutes) ctx += `, ${s.avgPauseMinutes}m pausa prom.`
        if (s.stuckTasksCount) ctx += `, ${s.stuckTasksCount} atascadas`
        ctx += '\n'
      }
    }
  }

  const msg = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 400,
    system: `Analizás el historial de trabajo de un usuario y generás un perfil de productividad en JSON.

Devolvés ÚNICAMENTE un objeto JSON válido con estas claves:
- tendencias: 1-2 oraciones sobre patrones de comportamiento. Usá horas trabajadas por proyecto (no solo cantidad de tareas). Si hay evolución histórica, comentá si mejoró o empeoró.
- fortalezas: 1 oración sobre en qué áreas o proyectos tiene mejor rendimiento (mencioná proyectos concretos).
- areasDeAtencion: 1-2 oraciones sobre patrones negativos (baja tasa de completado, bloqueos frecuentes, tareas que quedan atascadas mucho tiempo, desequilibrio de tiempo entre proyectos, etc.). null si no hay señales preocupantes.

Español rioplatense, directo. Solo hechos que los datos muestran. No supongas lo que no está en los datos.`,
    messages: [{ role: 'user', content: ctx }],
  }, { timeout: AI_TIMEOUT_MS })
  logTokens('insightMemory', userId, msg.usage)

  let rawText = msg.content[0].text.trim()
  if (rawText.startsWith('```')) {
    rawText = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  }
  let parsed
  try { parsed = JSON.parse(rawText) }
  catch { throw new Error('Respuesta de IA inválida') }

  const estadisticas = {
    tasaCompletado,
    promedioTareasPorDia,
    proyectosSimultaneos,
    avgPauseMinutes,
    stuckTasksCount,
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
