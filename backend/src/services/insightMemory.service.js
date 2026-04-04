const Anthropic = require('@anthropic-ai/sdk')
const prisma = require('../lib/prisma')
const { todayString } = require('../utils/dates')

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
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

async function generateMemoryForUser(userId) {
  const fourWeeksAgo = getNWeeksAgoMonday(4)
  const today = todayString()

  const [user, completedTasks, workDays] = await Promise.all([
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
      include: { project: true, workDay: { select: { date: true } } },
    }),
    prisma.workDay.findMany({
      where: { userId, date: { gte: fourWeeksAgo, lte: today } },
      include: {
        tasks: { select: { id: true, status: true, projectId: true, blockedReason: true } },
      },
    }),
  ])

  if (!user) return null

  // Estadísticas
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

  // Contexto para Claude
  const byProject = {}
  for (const t of completedTasks) {
    byProject[t.project.name] = (byProject[t.project.name] || 0) + 1
  }
  const projectSummary = Object.entries(byProject)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([p, n]) => `${p} (${n})`)
    .join(', ')

  // Días con bloqueos
  const daysWithBlocks = new Set()
  for (const wd of workDays) {
    if (wd.tasks.some(t => t.status === 'BLOCKED')) daysWithBlocks.add(wd.date)
  }

  let ctx = `ANÁLISIS DE LAS ÚLTIMAS 4 SEMANAS\n`
  ctx += `Rol: ${user.role}\n`
  ctx += `Días trabajados: ${workDaysWithTasks.length}\n`
  ctx += `Tareas creadas: ${totalCreated} | Completadas: ${totalCompleted} (${Math.round(tasaCompletado * 100)}%)\n`
  ctx += `Promedio tareas/día: ${promedioTareasPorDia} | Proyectos simultáneos: ${proyectosSimultaneos}\n`
  if (projectSummary) ctx += `Proyectos con tareas completadas: ${projectSummary}\n`
  if (daysWithBlocks.size > 0) ctx += `Días con bloqueos activos: ${daysWithBlocks.size}\n`

  const msg = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 300,
    system: `Analizás el historial de trabajo de un usuario y generás un perfil de productividad en JSON.

Devolvés ÚNICAMENTE un objeto JSON válido con estas claves:
- tendencias: 1-2 oraciones sobre patrones de comportamiento (cuándo rinde mejor, qué proyectos prioriza, etc.)
- fortalezas: 1 oración sobre en qué áreas o proyectos tiene mejor rendimiento
- areasDeAtencion: 1-2 oraciones sobre patrones negativos recurrentes (baja tasa de completado, muchos proyectos simultáneos, bloqueos frecuentes, etc.) — null si no hay señales preocupantes

Español rioplatense, directo. Solo hechos que los datos muestran. No supongas lo que no está en los datos.`,
    messages: [{ role: 'user', content: ctx }],
  })

  const parsed = JSON.parse(msg.content[0].text.trim())

  return prisma.userInsightMemory.upsert({
    where: { userId },
    create: {
      userId,
      tendencias:      String(parsed.tendencias      || ''),
      fortalezas:      String(parsed.fortalezas      || ''),
      areasDeAtencion: parsed.areasDeAtencion ? String(parsed.areasDeAtencion) : '',
      estadisticas:    { tasaCompletado, promedioTareasPorDia, proyectosSimultaneos },
      weekStart:       fourWeeksAgo,
    },
    update: {
      tendencias:      String(parsed.tendencias      || ''),
      fortalezas:      String(parsed.fortalezas      || ''),
      areasDeAtencion: parsed.areasDeAtencion ? String(parsed.areasDeAtencion) : '',
      estadisticas:    { tasaCompletado, promedioTareasPorDia, proyectosSimultaneos },
      weekStart:       fourWeeksAgo,
    },
  })
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
