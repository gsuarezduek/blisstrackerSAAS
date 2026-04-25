const app = require('./app')
const prisma = require('./lib/prisma')
const { FEATURE_FLAGS } = require('./config/featureFlags')

const PORT = process.env.PORT || 3001
app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`)
  // Sincronizar catálogo de feature flags — upsert para que siempre existan en DB
  for (const { key, name, description } of FEATURE_FLAGS) {
    await prisma.featureFlag.upsert({
      where:  { key },
      update: { name, description },
      create: { key, name, description },
    }).catch(err => console.error(`[FeatureFlags] Error sync '${key}':`, err.message))
  }
  console.log(`[FeatureFlags] ${FEATURE_FLAGS.length} flag(s) sincronizado(s).`)
})

const cron = require('node-cron')
const { sendAllWeeklyReports }          = require('./services/weeklyReport.service')
const { updateAllMemories }             = require('./services/insightMemory.service')
const { saveAllPreviousMonthSnapshots } = require('./services/analyticsSnapshot.service')
const { runAllMonthlyPageSpeed }        = require('./services/pageSpeed.service')
const { saveAllKeywordRankings }        = require('./services/keywordTracking.service')

// In-memory locks — prevent overlapping runs if a job takes longer than its schedule
let weeklyReportRunning       = false
let insightMemoryRunning      = false
let analyticsSnapshotRunning  = false
let pageSpeedMonthlyRunning   = false
let keywordRankingsRunning    = false

// Cron: resumen semanal — viernes 00:01 hora Buenos Aires (se envía en baches, todos lo reciben a primera hora)
cron.schedule('1 0 * * 5', async () => {
  if (weeklyReportRunning) { console.log('[WeeklyReport] Ya en ejecución, se omite.'); return }
  weeklyReportRunning = true
  console.log('[WeeklyReport] Iniciando envío automático (viernes 00:01 ART)...')
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

// Cron: PageSpeed mensual — 1° de cada mes a las 03:30 ART (después del snapshot de analytics)
cron.schedule('30 3 1 * *', async () => {
  if (pageSpeedMonthlyRunning) { console.log('[PageSpeed] Ya en ejecución, se omite.'); return }
  pageSpeedMonthlyRunning = true
  console.log('[PageSpeed] Iniciando análisis mensual automático...')
  try { await runAllMonthlyPageSpeed() }
  finally { pageSpeedMonthlyRunning = false }
}, { timezone: 'America/Argentina/Buenos_Aires' })

// Cron: guardar snapshot del mes anterior — 1° de cada mes a las 02:00 ART
cron.schedule('0 2 1 * *', async () => {
  if (analyticsSnapshotRunning) { console.log('[AnalyticsSnapshot] Ya en ejecución, se omite.'); return }
  analyticsSnapshotRunning = true
  console.log('[AnalyticsSnapshot] Iniciando guardado mensual automático...')
  try { await saveAllPreviousMonthSnapshots() }
  finally { analyticsSnapshotRunning = false }
}, { timezone: 'America/Argentina/Buenos_Aires' })

// Cron: guardar rankings de keywords del mes anterior — 1° de cada mes a las 04:00 ART (después de analytics y pagespeed)
cron.schedule('0 4 1 * *', async () => {
  if (keywordRankingsRunning) { console.log('[KeywordTracking] Ya en ejecución, se omite.'); return }
  keywordRankingsRunning = true
  console.log('[KeywordTracking] Iniciando guardado mensual de rankings...')
  try { await saveAllKeywordRankings() }
  finally { keywordRankingsRunning = false }
}, { timezone: 'America/Argentina/Buenos_Aires' })

// Cron: limpiar notificaciones antiguas — domingos 03:00 hora Buenos Aires
cron.schedule('0 3 * * 0', async () => {
  console.log('[NotifCleanup] Limpiando notificaciones antiguas...')
  const prisma = require('./lib/prisma')
  const now = new Date()
  const cutoffRead   = new Date(now - 30 * 24 * 60 * 60 * 1000)  // 30 días
  const cutoffUnread = new Date(now - 90 * 24 * 60 * 60 * 1000)  // 90 días
  const { count } = await prisma.notification.deleteMany({
    where: {
      OR: [
        { read: true,  createdAt: { lt: cutoffRead   } },
        { read: false, createdAt: { lt: cutoffUnread } },
      ],
    },
  })
  console.log(count > 0 ? `[NotifCleanup] ${count} notificación(es) eliminada(s).` : '[NotifCleanup] Nada que limpiar.')
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

// Cron: marcar trials expirados como past_due — diariamente a las 03:00 ART
cron.schedule('0 3 * * *', async () => {
  const expired = await prisma.workspace.findMany({
    where: { status: 'trialing', trialEndsAt: { lt: new Date() } },
    select: { id: true },
  })
  if (expired.length === 0) return
  const ids = expired.map(w => w.id)
  const { count } = await prisma.workspace.updateMany({
    where: { id: { in: ids } },
    data:  { status: 'past_due' },
  })
  console.log(`[TrialExpiry] ${count} workspace(s) marcado(s) como past_due.`)
}, { timezone: 'America/Argentina/Buenos_Aires' })

// Cron: eliminar workspaces vencidos — cada 15 minutos
let deletionRunning = false
cron.schedule('*/15 * * * *', async () => {
  if (deletionRunning) return
  deletionRunning = true
  try {
    const prisma = require('./lib/prisma')
    const { executeWorkspaceDeletion } = require('./controllers/workspace.controller')
    const expired = await prisma.workspaceDeletionRequest.findMany({
      where: {
        scheduledAt: { lte: new Date() },
        cancelledAt: null,
      },
      select: { workspaceId: true },
    })
    if (expired.length === 0) { deletionRunning = false; return }
    console.log(`[WorkspaceDeletion] ${expired.length} workspace(s) a eliminar...`)
    for (const { workspaceId } of expired) {
      try {
        await executeWorkspaceDeletion(workspaceId)
        console.log(`[WorkspaceDeletion] Workspace ${workspaceId} eliminado.`)
      } catch (err) {
        console.error(`[WorkspaceDeletion] Error eliminando workspace ${workspaceId}:`, err.message)
      }
    }
  } finally {
    deletionRunning = false
  }
})
