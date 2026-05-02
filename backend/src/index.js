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
const { saveAllKeywordRankings, saveCurrentMonthKeywordRankings } = require('./services/keywordTracking.service')
const { runAllMonthlyGeoAudits }           = require('./services/geoAudit.service')
const { sendAllMonthlyMarketingReports }   = require('./services/monthlyMarketingReport.service')
const { saveAllMonthlyInstagramSnapshots } = require('./services/instagramSnapshot.service')
const { saveAllMonthlyTikTokSnapshots }    = require('./services/tiktokSnapshot.service')
const { saveAllSearchConsoleSnapshots }   = require('./services/searchConsoleSnapshot.service')

// In-memory locks — prevent overlapping runs if a job takes longer than its schedule
let weeklyReportRunning         = false
let insightMemoryRunning        = false
let analyticsSnapshotRunning    = false
let pageSpeedMonthlyRunning     = false
let keywordRankingsRunning      = false
let keywordWeeklyRunning        = false
let geoMonthlyRunning           = false
let marketingReportRunning      = false
let instagramSnapshotRunning    = false
let tiktokSnapshotRunning       = false
let seoSnapshotRunning          = false

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

// Cron: actualizar rankings del mes actual — lunes 06:00 ART (semanal, upsert)
cron.schedule('0 6 * * 1', async () => {
  if (keywordWeeklyRunning) { console.log('[KeywordTracking] Semanal ya en ejecución, se omite.'); return }
  keywordWeeklyRunning = true
  console.log('[KeywordTracking] Iniciando actualización semanal de rankings del mes actual...')
  try { await saveCurrentMonthKeywordRankings() }
  catch (err) { console.error('[KeywordTracking] Error en cron semanal:', err.message) }
  finally { keywordWeeklyRunning = false }
}, { timezone: 'America/Argentina/Buenos_Aires' })

// Cron: limpieza semanal de tablas de crecimiento ilimitado — domingos 03:00 hora Buenos Aires
cron.schedule('0 3 * * 0', async () => {
  try {
    const prisma = require('./lib/prisma')
    const now    = new Date()
    const days   = d => new Date(now - d * 24 * 60 * 60 * 1000)

    // Notificaciones: leídas >30d, no leídas >90d
    const { count: notifCount } = await prisma.notification.deleteMany({
      where: {
        OR: [
          { read: true,  createdAt: { lt: days(30)  } },
          { read: false, createdAt: { lt: days(90)  } },
        ],
      },
    })

    // Logs de tokens IA: >90d (solo son estadísticas históricas)
    const { count: tokenCount } = await prisma.aiTokenLog.deleteMany({
      where: { createdAt: { lt: days(90) } },
    })

    // Historial de logins: >180d
    const { count: loginCount } = await prisma.userLogin.deleteMany({
      where: { loginAt: { lt: days(180) } },
    })

    // Insights diarios: >365d (se usan para contexto de IA hasta hace ~30d, los viejos no sirven)
    const { count: insightCount } = await prisma.dailyInsight.deleteMany({
      where: { createdAt: { lt: days(365) } },
    })

    // Email logs: >180d
    const { count: emailCount } = await prisma.emailLog.deleteMany({
      where: { createdAt: { lt: days(180) } },
    })

    const totals = [
      notifCount  && `${notifCount} notif.`,
      tokenCount  && `${tokenCount} token logs`,
      loginCount  && `${loginCount} logins`,
      insightCount && `${insightCount} insights`,
      emailCount  && `${emailCount} email logs`,
    ].filter(Boolean)

    console.log(totals.length
      ? `[WeeklyCleanup] Eliminados: ${totals.join(', ')}`
      : '[WeeklyCleanup] Nada que limpiar.'
    )
  } catch (err) {
    console.error('[WeeklyCleanup] Error en limpieza semanal:', err.message)
  }
}, { timezone: 'America/Argentina/Buenos_Aires' })

// Cron: auto-pausar tareas EN CURSO al final del día — medianoche hora Buenos Aires
cron.schedule('0 0 * * *', async () => {
  console.log('[AutoPause] Pausando tareas en curso al cierre del día...')
  try {
    const prisma = require('./lib/prisma')
    const { count } = await prisma.task.updateMany({
      where: { status: 'IN_PROGRESS' },
      data: { status: 'PAUSED', pausedAt: new Date() },
    })
    console.log(count > 0 ? `[AutoPause] ${count} tarea(s) pausada(s).` : '[AutoPause] Sin tareas activas.')
  } catch (err) {
    console.error('[AutoPause] Error al pausar tareas:', err.message)
  }
}, { timezone: 'America/Argentina/Buenos_Aires' })

// Cron: marcar trials expirados como past_due — diariamente a las 03:00 ART
cron.schedule('0 3 * * *', async () => {
  try {
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
  } catch (err) {
    console.error('[TrialExpiry] Error al marcar trials expirados:', err.message)
  }
}, { timezone: 'America/Argentina/Buenos_Aires' })

// Cron: GEO audit mensual — 1° del mes 01:00 ART
cron.schedule('0 1 1 * *', async () => {
  if (geoMonthlyRunning) { console.log('[GeoAudit] Ya en ejecución, se omite.'); return }
  geoMonthlyRunning = true
  try { await runAllMonthlyGeoAudits() }
  catch (err) { console.error('[GeoAudit] Error en cron mensual:', err.message) }
  finally { geoMonthlyRunning = false }
}, { timezone: 'America/Argentina/Buenos_Aires' })

// Cron: informe mensual de marketing — 1° del mes 05:00 ART
cron.schedule('0 5 1 * *', async () => {
  if (marketingReportRunning) { console.log('[MonthlyReport] Ya en ejecución, se omite.'); return }
  marketingReportRunning = true
  try { await sendAllMonthlyMarketingReports() }
  catch (err) { console.error('[MonthlyReport] Error en cron mensual:', err.message) }
  finally { marketingReportRunning = false }
}, { timezone: 'America/Argentina/Buenos_Aires' })

// Cron: snapshot mensual de Instagram — 1° del mes 04:30 ART
cron.schedule('30 4 1 * *', async () => {
  if (instagramSnapshotRunning) { console.log('[InstagramSnapshot] Ya en ejecución, se omite.'); return }
  instagramSnapshotRunning = true
  console.log('[InstagramSnapshot] Iniciando guardado mensual automático...')
  try { await saveAllMonthlyInstagramSnapshots() }
  catch (err) { console.error('[InstagramSnapshot] Error en cron mensual:', err.message) }
  finally { instagramSnapshotRunning = false }
}, { timezone: 'America/Argentina/Buenos_Aires' })

// Cron: snapshot GSC mensual — 1° de cada mes a las 02:30 ART
cron.schedule('30 2 1 * *', async () => {
  if (seoSnapshotRunning) { console.log('[SeoSnapshot] Ya en ejecución, se omite.'); return }
  seoSnapshotRunning = true
  console.log('[SeoSnapshot] Iniciando guardado mensual automático...')
  try { await saveAllSearchConsoleSnapshots() }
  catch (err) { console.error('[SeoSnapshot] Error en cron mensual:', err.message) }
  finally { seoSnapshotRunning = false }
}, { timezone: 'America/Argentina/Buenos_Aires' })

// Cron: snapshot TikTok mensual — 1° de cada mes a las 05:30 ART
cron.schedule('30 5 1 * *', async () => {
  if (tiktokSnapshotRunning) { console.log('[TikTokSnapshot] Ya en ejecución, se omite.'); return }
  tiktokSnapshotRunning = true
  try { await saveAllMonthlyTikTokSnapshots() }
  catch (err) { console.error('[TikTokSnapshot] Error en cron mensual:', err.message) }
  finally { tiktokSnapshotRunning = false }
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
