require('dotenv').config()

const REQUIRED_ENV = [
  'DATABASE_URL',
  'JWT_SECRET',
  'RESEND_API_KEY',
  'EMAIL_FROM',
  'APP_DOMAIN',
  'ANTHROPIC_API_KEY',
  'ENCRYPTION_KEY',
]
const missing = REQUIRED_ENV.filter(k => !process.env[k])
if (missing.length) {
  console.error(`[startup] Variables de entorno faltantes: ${missing.join(', ')}`)
  process.exit(1)
}

const app = require('./app')
const prisma = require('./lib/prisma')
const { FEATURE_FLAGS } = require('./config/featureFlags')
const { PLATFORM_SETTINGS } = require('./config/platformSettings')

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

  // Sincronizar catálogo de platform settings — solo CREA si no existe.
  // Nunca pisar `value` en update: si el SuperAdmin cambió un valor, no queremos resetearlo al reiniciar.
  for (const setting of PLATFORM_SETTINGS) {
    await prisma.platformSetting.upsert({
      where:  { key: setting.key },
      create: { key: setting.key, value: { value: setting.default }, description: setting.help },
      update: { description: setting.help },
    }).catch(err => console.error(`[PlatformSettings] Error sync '${setting.key}':`, err.message))
  }
  console.log(`[PlatformSettings] ${PLATFORM_SETTINGS.length} setting(s) sincronizado(s).`)
})

const cron = require('node-cron')
const { sendAllWeeklyReports }          = require('./services/weeklyReport.service')
const { updateAllMemories }             = require('./services/insightMemory.service')
const { saveAllPreviousMonthSnapshots } = require('./services/analyticsSnapshot.service')
const { runAllMonthlyPageSpeed }        = require('./services/pageSpeed.service')
const { saveAllKeywordRankings, saveCurrentMonthKeywordRankings } = require('./services/keywordTracking.service')
const { captureAllSerpSnapshots } = require('./services/serpApi.service')
const { runAllMonthlyGeoAudits }           = require('./services/geoAudit.service')
const { sendAllMonthlyMarketingReports }   = require('./services/monthlyMarketingReport.service')
const { saveAllMonthlyInstagramSnapshots } = require('./services/instagramSnapshot.service')
const { saveAllMonthlyTikTokSnapshots }    = require('./services/tiktokSnapshot.service')
const { saveAllMonthlyLinkedinSnapshots }  = require('./services/linkedinSnapshot.service')
const { saveAllSearchConsoleSnapshots }   = require('./services/searchConsoleSnapshot.service')
const { refreshAllDomainRatings }         = require('./services/ahrefs.service')
const { saveAllAdsSnapshots }             = require('./services/adsSnapshot.service')
const { saveAllMonthlyCompetitorSnapshots } = require('./services/competitorSnapshot.service')

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
let linkedinSnapshotRunning     = false
let seoSnapshotRunning          = false
let serpSnapshotRunning         = false
let adsSnapshotRunning          = false
let competitorSnapshotRunning   = false

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

// Cron: capturar SERP snapshots — lunes 06:30 ART (después del cron de keywords GSC)
cron.schedule('30 6 * * 1', async () => {
  if (serpSnapshotRunning) { console.log('[SerpAPI] Ya en ejecución, se omite.'); return }
  serpSnapshotRunning = true
  console.log('[SerpAPI] Iniciando captura semanal de SERP snapshots...')
  try { await captureAllSerpSnapshots() }
  catch (err) { console.error('[SerpAPI] Error en cron semanal:', err.message) }
  finally { serpSnapshotRunning = false }
}, { timezone: 'America/Argentina/Buenos_Aires' })

// Cron: limpieza semanal de tablas de crecimiento ilimitado — domingos 03:00 hora Buenos Aires
const { runWeeklyCleanup } = require('./services/cleanup.service')
cron.schedule('0 3 * * 0', async () => {
  try {
    const result = await runWeeklyCleanup()
    const totals = Object.entries(result)
      .filter(([, count]) => count > 0)
      .map(([table, count]) => `${count} ${table}`)
    console.log(totals.length
      ? `[WeeklyCleanup] Eliminados: ${totals.join(', ')}`
      : '[WeeklyCleanup] Nada que limpiar.'
    )
  } catch (err) {
    console.error('[WeeklyCleanup] Error en limpieza semanal:', err.message)
  }
}, { timezone: 'America/Argentina/Buenos_Aires' })

// Cron: email lifecycle del trial — diario a 09:00 ART (días 3, 7, 12, 13)
let trialLifecycleRunning = false
const { runTrialLifecycle } = require('./services/trialLifecycle.service')
cron.schedule('0 9 * * *', async () => {
  if (trialLifecycleRunning) return
  trialLifecycleRunning = true
  try {
    const result = await runTrialLifecycle()
    console.log(`[TrialLifecycle] ${result.workspacesChecked} workspace(s) revisado(s), ${result.emailsSent} email(s) enviado(s).`)
  } catch (err) {
    console.error('[TrialLifecycle] Error:', err.message)
  } finally {
    trialLifecycleRunning = false
  }
}, { timezone: 'America/Argentina/Buenos_Aires' })

// Cron: auto-pausar tareas EN CURSO al final del día — medianoche hora Buenos Aires
cron.schedule('0 0 * * *', async () => {
  console.log('[AutoPause] Pausando tareas en curso al cierre del día...')
  try {
    const prisma = require('./lib/prisma')
    const now = new Date()
    // Cerrar las sesiones abiertas además de pausar la tarea: si una sesión cruza la
    // medianoche sin cerrarse, el tiempo activo (que se calcula sumando TaskSession) se
    // infla con las horas no trabajadas. Solo las tareas IN_PROGRESS tienen sesión abierta.
    const [{ count }] = await prisma.$transaction([
      prisma.task.updateMany({
        where: { status: 'IN_PROGRESS' },
        data: { status: 'PAUSED', pausedAt: now },
      }),
      prisma.taskSession.updateMany({
        where: { endedAt: null },
        data: { endedAt: now },
      }),
    ])
    console.log(count > 0 ? `[AutoPause] ${count} tarea(s) pausada(s).` : '[AutoPause] Sin tareas activas.')
  } catch (err) {
    console.error('[AutoPause] Error al pausar tareas:', err.message)
  }
}, { timezone: 'America/Argentina/Buenos_Aires' })

// Cron: reconciliar tier de billing (free tier ⇄ past_due) — diariamente 03:00 ART.
// Aplica la regla "hasta N usuarios gratis": trials vencidos con ≤ límite pasan a
// plan Gratis (active); los que superan el límite quedan en past_due. También
// rescata workspaces past_due que ahora califican para gratis (ej: bajaron usuarios
// o se subió el límite desde SuperAdmin).
cron.schedule('0 3 * * *', async () => {
  try {
    const { reconcileWorkspaceTier } = require('./services/billingTier.service')
    const now = new Date()
    const candidates = await prisma.workspace.findMany({
      where: {
        billingExempt: false,
        OR: [
          { status: 'trialing', trialEndsAt: { lt: now } },
          { status: 'past_due' },
          { status: 'active' }, // re-evaluar gratis por si bajaron usuarios o cambió el límite
        ],
      },
      select: { id: true },
    })
    for (const w of candidates) {
      try { await reconcileWorkspaceTier(w.id) }
      catch (e) { console.error(`[BillingTier] Error reconciliando workspace ${w.id}:`, e.message) }
    }
    console.log(`[BillingTier] Reconciliados ${candidates.length} workspace(s).`)
  } catch (err) {
    console.error('[BillingTier] Error en cron de reconciliación de tiers:', err.message)
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
  try {
    await saveAllSearchConsoleSnapshots()
    // Refresca el Domain Rating cacheado de todos los proyectos con websiteUrl
    await refreshAllDomainRatings()
  }
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

// Cron: snapshot LinkedIn mensual — 1° de cada mes a las 05:45 ART
cron.schedule('45 5 1 * *', async () => {
  if (linkedinSnapshotRunning) { console.log('[LinkedinSnapshot] Ya en ejecución, se omite.'); return }
  linkedinSnapshotRunning = true
  console.log('[LinkedinSnapshot] Iniciando guardado mensual automático...')
  try { await saveAllMonthlyLinkedinSnapshots() }
  catch (err) { console.error('[LinkedinSnapshot] Error en cron mensual:', err.message) }
  finally { linkedinSnapshotRunning = false }
}, { timezone: 'America/Argentina/Buenos_Aires' })

// Cron: snapshot de Ads (Meta + Google) mensual — 1° de cada mes a las 06:00 ART
cron.schedule('0 6 1 * *', async () => {
  if (adsSnapshotRunning) { console.log('[AdsSnapshot] Ya en ejecución, se omite.'); return }
  adsSnapshotRunning = true
  console.log('[AdsSnapshot] Iniciando guardado mensual automático...')
  try { await saveAllAdsSnapshots() }
  catch (err) { console.error('[AdsSnapshot] Error en cron mensual:', err.message) }
  finally { adsSnapshotRunning = false }
}, { timezone: 'America/Argentina/Buenos_Aires' })

// Cron: snapshot mensual de competidores (Instagram) — 1° de cada mes a las 06:15 ART
cron.schedule('15 6 1 * *', async () => {
  if (competitorSnapshotRunning) { console.log('[CompetitorSnapshot] Ya en ejecución, se omite.'); return }
  competitorSnapshotRunning = true
  console.log('[CompetitorSnapshot] Iniciando guardado mensual automático...')
  try { await saveAllMonthlyCompetitorSnapshots() }
  catch (err) { console.error('[CompetitorSnapshot] Error en cron mensual:', err.message) }
  finally { competitorSnapshotRunning = false }
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
