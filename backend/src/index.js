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
const { DEFAULT_TZ } = require('./utils/dates')
const { initSocket } = require('./lib/socket')

const PORT = process.env.PORT || 3001
const server = app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`)
  initSocket(server)
  console.log('[Socket.IO] Inicializado — chat en tiempo real activo.')
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

// Graceful shutdown: Railway manda SIGTERM en cada deploy. Cerramos el server para
// dejar de aceptar conexiones nuevas, drenamos las en vuelo y desconectamos Prisma.
// Sin esto, cada deploy cortaba requests en seco (502s) y dejaba conexiones colgadas.
let shuttingDown = false
async function shutdown(signal) {
  if (shuttingDown) return
  shuttingDown = true
  console.log(`[shutdown] ${signal} recibido — cerrando server...`)
  const forced = setTimeout(() => {
    console.error('[shutdown] Timeout de 15s — forzando salida.')
    process.exit(1)
  }, 15000)
  forced.unref()
  server.close(async () => {
    try { await prisma.$disconnect() } catch (err) { console.error('[shutdown] Error al desconectar Prisma:', err.message) }
    clearTimeout(forced)
    console.log('[shutdown] Cierre limpio completado.')
    process.exit(0)
  })
}
process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT',  () => shutdown('SIGINT'))

const cron = require('node-cron')
const { runCron } = require('./lib/cronLock')
const { sendAllWeeklyReports }          = require('./services/weeklyReport.service')
const { updateAllMemories }             = require('./services/insightMemory.service')
const { saveAllPreviousMonthSnapshots, refreshAllCurrentMonthSnapshots } = require('./services/analyticsSnapshot.service')
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
const { checkAndSendAllSeoAlerts }        = require('./services/seoAlerts.service')
const { saveAllAdsSnapshots }             = require('./services/adsSnapshot.service')
const { runWeeklyAdsAdvisor }             = require('./services/adsAdvisor.service')
const { runWeeklyRrssAdvisor }            = require('./services/rrssAdvisor.service')
const { saveAllMonthlyCompetitorSnapshots } = require('./services/competitorSnapshot.service')
const { saveAllPreviousMonthSnapshots: saveAllPrevRrhhMetrics } = require('./services/rrhhMetricSnapshot.service')
const { sendAllProductivityDigests } = require('./services/productivityDigest.service')
const { sendAllMarketingDigests }    = require('./services/marketingDigest.service')

// La exclusión mutua (dentro del proceso y ENTRE instancias/réplicas) la maneja
// `runCron(name, ttlMs, fn)` vía una lease en DB (ver lib/cronLock.js). El TTL de
// cada job debe superar su duración máxima esperada.

// Cron: resumen semanal — viernes 00:01 hora Buenos Aires (se envía en baches, todos lo reciben a primera hora)
cron.schedule('1 0 * * 5', () => runCron('weeklyReport', 2 * 60 * 60 * 1000, async () => {
  console.log('[WeeklyReport] Iniciando envío automático (viernes 00:01 ART)...')
  await sendAllWeeklyReports()
}), { timezone: DEFAULT_TZ })

// Cron: actualizar memoria de insights — sábados 00:00 hora Buenos Aires
cron.schedule('0 0 * * 6', () => runCron('insightMemory', 2 * 60 * 60 * 1000, async () => {
  console.log('[InsightMemory] Iniciando actualización semanal (sábado 00:00 ART)...')
  await updateAllMemories()
}), { timezone: DEFAULT_TZ })

// (Los jobs mensuales del día 1° — GEO, GA4, GSC, PageSpeed, keywords, RRSS, Ads, competidores,
// RRHH — corren en una única cadena secuencial `MONTHLY_CHAIN`, definida más abajo, en vez de
// como crons sueltos a distintos horarios que podían solaparse entre sí.)

// Cron: actualizar rankings del mes actual — lunes 06:00 ART (semanal, upsert)
cron.schedule('0 6 * * 1', () => runCron('keywordWeekly', 60 * 60 * 1000, async () => {
  console.log('[KeywordTracking] Iniciando actualización semanal de rankings del mes actual...')
  try { await saveCurrentMonthKeywordRankings() }
  catch (err) { console.error('[KeywordTracking] Error en cron semanal:', err.message) }
}), { timezone: DEFAULT_TZ })

// Cron: refrescar snapshots GA4 del mes en curso — lunes 06:15 ART (semanal, upsert).
// Mantiene la lista cross-proyecto (Marketing → Web) al día durante el mes en curso y
// evita que un proyecto recién conectado quede en "sin datos" hasta el 1° del mes.
cron.schedule('15 6 * * 1', () => runCron('analyticsWeekly', 60 * 60 * 1000, async () => {
  console.log('[AnalyticsSnapshot] Iniciando refresco semanal de snapshots del mes en curso...')
  try { await refreshAllCurrentMonthSnapshots() }
  catch (err) { console.error('[AnalyticsSnapshot] Error en cron semanal:', err.message) }
}), { timezone: DEFAULT_TZ })

// Cron: capturar SERP snapshots — lunes 06:30 ART (después del cron de keywords GSC)
cron.schedule('30 6 * * 1', () => runCron('serpSnapshot', 60 * 60 * 1000, async () => {
  console.log('[SerpAPI] Iniciando captura semanal de SERP snapshots...')
  try { await captureAllSerpSnapshots() }
  catch (err) { console.error('[SerpAPI] Error en cron semanal:', err.message) }
}), { timezone: DEFAULT_TZ })

// Cron: análisis automático de Ads Advisor (Meta/Google, IA) — lunes 09:00 ART. Corre
// generateAdsAdvisor() para todo proyecto con integración de ads activa, en workspaces
// con Marketing habilitado y el toggle adsAdvisorAutoEnabled prendido (opt-out).
cron.schedule('0 9 * * 1', () => runCron('adsAdvisorWeekly', 30 * 60 * 1000, async () => {
  console.log('[AdsAdvisorWeekly] Iniciando análisis semanal de Ads Advisor...')
  try { await runWeeklyAdsAdvisor() }
  catch (err) { console.error('[AdsAdvisorWeekly] Error:', err.message) }
}), { timezone: DEFAULT_TZ })

// Cron: análisis automático de RRSS Advisor (IA) — lunes 09:20 ART. Corre
// generateRrssAdvisor() para todo proyecto con alguna red social conectada, en
// workspaces con Marketing habilitado y el toggle rrssAdvisorAutoEnabled prendido.
cron.schedule('20 9 * * 1', () => runCron('rrssAdvisorWeekly', 30 * 60 * 1000, async () => {
  console.log('[RrssAdvisorWeekly] Iniciando análisis semanal de RRSS Advisor...')
  try { await runWeeklyRrssAdvisor() }
  catch (err) { console.error('[RrssAdvisorWeekly] Error:', err.message) }
}), { timezone: DEFAULT_TZ })

// Cron: limpieza semanal de tablas de crecimiento ilimitado — domingos 03:00 hora Buenos Aires
const { runWeeklyCleanup } = require('./services/cleanup.service')
cron.schedule('0 3 * * 0', () => runCron('weeklyCleanup', 30 * 60 * 1000, async () => {
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
}), { timezone: DEFAULT_TZ })

// Cron: email lifecycle del trial — diario a 09:00 ART (días 3, 7, 12, 13)
const { runTrialLifecycle } = require('./services/trialLifecycle.service')
cron.schedule('0 9 * * *', () => runCron('trialLifecycle', 30 * 60 * 1000, async () => {
  try {
    const result = await runTrialLifecycle()
    console.log(`[TrialLifecycle] ${result.workspacesChecked} workspace(s) revisado(s), ${result.emailsSent} email(s) enviado(s).`)
  } catch (err) {
    console.error('[TrialLifecycle] Error:', err.message)
  }
}), { timezone: DEFAULT_TZ })

// Cron: auto-pausar tareas EN CURSO al final del día — medianoche hora Buenos Aires
cron.schedule('0 0 * * *', () => runCron('autoPause', 10 * 60 * 1000, async () => {
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
}), { timezone: DEFAULT_TZ })

// Cron: reconciliar tier de billing (free tier ⇄ past_due) — diariamente 03:00 ART.
// Aplica la regla "hasta N usuarios gratis": trials vencidos con ≤ límite pasan a
// plan Gratis (active); los que superan el límite quedan en past_due. También
// rescata workspaces past_due que ahora califican para gratis (ej: bajaron usuarios
// o se subió el límite desde SuperAdmin).
cron.schedule('0 3 * * *', () => runCron('billingTier', 30 * 60 * 1000, async () => {
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
}), { timezone: DEFAULT_TZ })

// Cron: capturar stories de Instagram — cada 6 horas.
// Las stories viven 24h y no tienen histórico en la API, así que hay que leerlas
// antes de que expiren. Corriendo cada 6h vemos toda story y refinamos sus insights
// (que crecen mientras está viva) hasta 4 veces. La agregación mensual del informe
// lee de InstagramStory (ya persistido).
cron.schedule('0 */6 * * *', () => runCron('storiesCapture', 30 * 60 * 1000, async () => {
  try { await captureAllStories() }
  catch (err) { console.error('[InstagramStories] Error en cron:', err.message) }
}), { timezone: DEFAULT_TZ })

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
  ['SeoAlerts',          checkAndSendAllSeoAlerts], // compara el mes cerrado vs anterior y avisa retrocesos
]
cron.schedule('0 1 1 * *', () => runCron('monthlyChain', 6 * 60 * 60 * 1000, async () => {
  console.log('[MonthlyChain] Iniciando cadena mensual de snapshots (1° del mes)...')
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
}), { timezone: DEFAULT_TZ })

// Cron: aviso semanal de Productividad a admins/owners — lunes 08:00 ART
cron.schedule('0 8 * * 1', () => runCron('productivityDigest', 30 * 60 * 1000, async () => {
  console.log('[ProductivityDigest] Iniciando aviso semanal...')
  try { await sendAllProductivityDigests() }
  catch (err) { console.error('[ProductivityDigest] Error en cron semanal:', err.message) }
}), { timezone: DEFAULT_TZ })

// Cron: aviso semanal de Prioridades (Marketing) a admins/owners — lunes 08:15 ART
cron.schedule('15 8 * * 1', () => runCron('marketingDigest', 30 * 60 * 1000, async () => {
  console.log('[MarketingDigest] Iniciando aviso semanal...')
  try { await sendAllMarketingDigests() }
  catch (err) { console.error('[MarketingDigest] Error en cron semanal:', err.message) }
}), { timezone: DEFAULT_TZ })

// Cron: recordatorios de Ventas (próximas acciones para hoy / vencidas) — diario 08:00 ART
cron.schedule('0 8 * * *', () => runCron('salesReminders', 30 * 60 * 1000, async () => {
  const { sendAllSalesReminders } = require('./services/salesReminders.service')
  try { await sendAllSalesReminders() }
  catch (err) { console.error('[SalesReminders] Error en cron diario:', err.message) }
}), { timezone: DEFAULT_TZ })

// Cron: motor de reglas de WhatsApp (reactivación automática con plantillas) — diario 08:05 ART
cron.schedule('5 8 * * *', () => runCron('whatsappAutomation', 30 * 60 * 1000, async () => {
  const { runAllWhatsappAutomations } = require('./services/whatsappAutomation.service')
  try { await runAllWhatsappAutomations() }
  catch (err) { console.error('[WhatsappAutomation] Error en cron diario:', err.message) }
}), { timezone: DEFAULT_TZ })

// Cron: eliminar workspaces vencidos — cada 15 minutos
cron.schedule('*/15 * * * *', () => runCron('workspaceDeletion', 10 * 60 * 1000, async () => {
  const prisma = require('./lib/prisma')
  const { executeWorkspaceDeletion } = require('./controllers/workspace/deletion.controller')
  const expired = await prisma.workspaceDeletionRequest.findMany({
    where: {
      scheduledAt: { lte: new Date() },
      cancelledAt: null,
    },
    select: { workspaceId: true },
  })
  if (expired.length === 0) return
  console.log(`[WorkspaceDeletion] ${expired.length} workspace(s) a eliminar...`)
  for (const { workspaceId } of expired) {
    try {
      await executeWorkspaceDeletion(workspaceId)
      console.log(`[WorkspaceDeletion] Workspace ${workspaceId} eliminado.`)
    } catch (err) {
      console.error(`[WorkspaceDeletion] Error eliminando workspace ${workspaceId}:`, err.message)
    }
  }
}))
