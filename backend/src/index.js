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
const { saveAllMonthlyInstagramSnapshots } = require('./services/instagramSnapshot.service')
const { captureAllStories }                = require('./services/instagramStories.service')
const { saveAllMonthlyTikTokSnapshots }    = require('./services/tiktokSnapshot.service')
const { saveAllMonthlyYouTubeSnapshots }   = require('./services/youtubeSnapshot.service')
const { saveAllMonthlyLinkedinSnapshots }  = require('./services/linkedinSnapshot.service')
const { saveAllMonthlyFacebookSnapshots }  = require('./services/facebookSnapshot.service')
const { saveAllSearchConsoleSnapshots }   = require('./services/searchConsoleSnapshot.service')
const { refreshAllDomainRatings }         = require('./services/ahrefs.service')
const { saveAllAdsSnapshots }             = require('./services/adsSnapshot.service')
const { saveAllMonthlyCompetitorSnapshots } = require('./services/competitorSnapshot.service')
const { saveAllPreviousMonthSnapshots: saveAllPrevRrhhMetrics } = require('./services/rrhhMetricSnapshot.service')
const { sendAllProductivityDigests } = require('./services/productivityDigest.service')

// In-memory locks — prevent overlapping runs if a job takes longer than its schedule
let weeklyReportRunning         = false
let insightMemoryRunning        = false
let keywordWeeklyRunning        = false
let serpSnapshotRunning         = false
let monthlyChainRunning         = false  // cadena mensual de snapshots del día 1°
let storiesCaptureRunning       = false  // captura de stories de Instagram (efímeras 24h)
let productivityDigestRunning   = false

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

// (Los jobs mensuales del día 1° — GEO, GA4, GSC, PageSpeed, keywords, RRSS, Ads, competidores,
// RRHH — corren en una única cadena secuencial `MONTHLY_CHAIN`, definida más abajo, en vez de
// como crons sueltos a distintos horarios que podían solaparse entre sí.)

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

// Cron: capturar stories de Instagram — cada 6 horas.
// Las stories viven 24h y no tienen histórico en la API, así que hay que leerlas
// antes de que expiren. Corriendo cada 6h vemos toda story y refinamos sus insights
// (que crecen mientras está viva) hasta 4 veces. La agregación mensual del informe
// lee de InstagramStory (ya persistido).
cron.schedule('0 */6 * * *', async () => {
  if (storiesCaptureRunning) { console.log('[InstagramStories] Ya en ejecución, se omite.'); return }
  storiesCaptureRunning = true
  try { await captureAllStories() }
  catch (err) { console.error('[InstagramStories] Error en cron:', err.message) }
  finally { storiesCaptureRunning = false }
}, { timezone: 'America/Argentina/Buenos_Aires' })

// ── Cadena mensual de snapshots — 1° del mes 01:00 ART ─────────────────────────
// Corre TODOS los jobs pesados del día 1° de forma SECUENCIAL (uno arranca al terminar el
// anterior → no se solapan entre sí) y cada uno aislado en su try/catch (un fallo no corta
// la cadena). Orden: web/SEO → RRSS/Ads/RRHH. Todos capturan datos del mes ya cerrado, así
// quedan listos a la mañana del 1° (el informe on-demand `/report/:token` lee estos snapshots).
// El informe mensual por email (legacy) fue deprecado.
// A ~100 workspaces: migrar a worker process + cola (ver "Deuda técnica" en CLAUDE.md).
const MONTHLY_CHAIN = [
  ['GeoAudit',           runAllMonthlyGeoAudits],
  ['AnalyticsSnapshot',  saveAllPreviousMonthSnapshots],
  ['SeoSnapshot+DR',     async () => { await saveAllSearchConsoleSnapshots(); await refreshAllDomainRatings() }],
  ['PageSpeed',          runAllMonthlyPageSpeed],
  ['KeywordRankings',    saveAllKeywordRankings],
  ['InstagramSnapshot',  saveAllMonthlyInstagramSnapshots],
  ['TikTokSnapshot',     saveAllMonthlyTikTokSnapshots],
  ['YouTubeSnapshot',    saveAllMonthlyYouTubeSnapshots],
  ['LinkedinSnapshot',   saveAllMonthlyLinkedinSnapshots],
  ['FacebookSnapshot',   saveAllMonthlyFacebookSnapshots],
  ['AdsSnapshot',        saveAllAdsSnapshots],
  ['CompetitorSnapshot', saveAllMonthlyCompetitorSnapshots],
  ['RrhhMetricSnapshot', saveAllPrevRrhhMetrics],
]
cron.schedule('0 1 1 * *', async () => {
  if (monthlyChainRunning) { console.log('[MonthlyChain] Ya en ejecución, se omite.'); return }
  monthlyChainRunning = true
  console.log('[MonthlyChain] Iniciando cadena mensual de snapshots (1° del mes)...')
  try {
    for (const [name, job] of MONTHLY_CHAIN) {
      const t0 = Date.now()
      try {
        await job()
        console.log(`[MonthlyChain] ✓ ${name} (${Math.round((Date.now() - t0) / 1000)}s)`)
      } catch (err) {
        console.error(`[MonthlyChain] ✗ ${name}: ${err.message}`)
      }
    }
    console.log('[MonthlyChain] Cadena mensual completada.')
  } finally {
    monthlyChainRunning = false
  }
}, { timezone: 'America/Argentina/Buenos_Aires' })

// Cron: aviso semanal de Productividad a admins/owners — lunes 08:00 ART
cron.schedule('0 8 * * 1', async () => {
  if (productivityDigestRunning) { console.log('[ProductivityDigest] Ya en ejecución, se omite.'); return }
  productivityDigestRunning = true
  console.log('[ProductivityDigest] Iniciando aviso semanal...')
  try { await sendAllProductivityDigests() }
  catch (err) { console.error('[ProductivityDigest] Error en cron semanal:', err.message) }
  finally { productivityDigestRunning = false }
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
