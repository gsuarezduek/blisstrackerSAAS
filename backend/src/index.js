const app = require('./app')

const PORT = process.env.PORT || 3001
app.listen(PORT, () => console.log(`Server running on port ${PORT}`))

const cron = require('node-cron')
const { sendAllWeeklyReports } = require('./services/weeklyReport.service')
const { updateAllMemories }    = require('./services/insightMemory.service')

// In-memory locks — prevent overlapping runs if a job takes longer than its schedule
let weeklyReportRunning = false
let insightMemoryRunning = false

// Cron: resumen semanal — viernes 14:00 hora Buenos Aires
cron.schedule('0 14 * * 5', async () => {
  if (weeklyReportRunning) { console.log('[WeeklyReport] Ya en ejecución, se omite.'); return }
  weeklyReportRunning = true
  console.log('[WeeklyReport] Iniciando envío automático (viernes 14:00 ART)...')
  try { await sendAllWeeklyReports() }
  finally { weeklyReportRunning = false }
}, { timezone: 'America/Argentina/Buenos_Aires' })

// Cron: actualizar memoria de insights — sábados 00:00 hora Buenos Aires
cron.schedule('0 0 * * 6', async () => {
  if (insightMemoryRunning) { console.log('[InsightMemory] Ya en ejecución, se omite.'); return }
  insightMemoryRunning = true
  console.log('[InsightMemory] Iniciando actualización semanal (sábado 00:00 ART)...')
  try { await updateAllMemories() }
  finally { insightMemoryRunning = false }
}, { timezone: 'America/Argentina/Buenos_Aires' })

// Cron: auto-pausar tareas EN CURSO al final del día — medianoche hora Buenos Aires
cron.schedule('0 0 * * *', async () => {
  console.log('[AutoPause] Pausando tareas en curso al cierre del día...')
  const prisma = require('./lib/prisma')
  const { count } = await prisma.task.updateMany({
    where: { status: 'IN_PROGRESS' },
    data: { status: 'PAUSED', pausedAt: new Date() },
  })
  console.log(count > 0 ? `[AutoPause] ${count} tarea(s) pausada(s).` : '[AutoPause] Sin tareas activas.')
}, { timezone: 'America/Argentina/Buenos_Aires' })
