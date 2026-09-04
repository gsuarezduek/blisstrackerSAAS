const prisma    = require('../lib/prisma')
const { logTokens } = require('../lib/logTokens')
const { fetchGoogleAdsData }             = require('./googleAds.service')
const { fetchMetaAdsData, getValidFbToken } = require('./metaAds.service')
const { getStoriesSummary }              = require('./instagramStories.service')
const { computeObjectives }              = require('./marketingObjectives.service')
const { cacheImagesInArray }             = require('./socialImageCache.service')
const { monthBounds, prevMonthStr, prevMonthsArr, monthsInRange, rangeLabel, rangeDataLabel } = require('../lib/monthUtils')

// Resuelve el período de datos de un informe.
//   - Con periodStart/End explícitos → ese rango (fechas "YYYY-MM-DD").
//   - Sin ellos (legacy/default)      → el mes calendario anterior completo a `month`.
function resolveReportPeriod(month, periodStart, periodEnd) {
  const toYmd = (v) => {
    if (!v) return null
    if (typeof v === 'string') return v.slice(0, 10)
    return new Date(v).toISOString().slice(0, 10) // DateTime → YYYY-MM-DD
  }
  const s = toYmd(periodStart)
  const e = toYmd(periodEnd)
  if (s && e) return { start: s, end: e }
  const { startDate, endDate } = monthBounds(prevMonthStr(month))
  return { start: startDate, end: endDate }
}

// Metadata del período para el frontend (label + rango legible + meses cubiertos).
function buildPeriodMeta(period, monthsCovered, multiMonth) {
  return {
    start:      period.start,
    end:        period.end,
    label:      rangeLabel(period.start, period.end),      // "Junio 2026" | "Abril–Junio 2026" | "1–29 Jun 2026"
    dataLabel:  rangeDataLabel(period.start, period.end),  // "Datos del 01/06/2026 al 30/06/2026"
    months:     monthsCovered,
    multiMonth,
  }
}

const { anthropic, hasTokenBudget } = require('../lib/claude')

// ─── Helpers ──────────────────────────────────────────────────────────────────

function geoBand(score) {
  if (score >= 86) return 'Excelente'
  if (score >= 68) return 'Bueno'
  if (score >= 36) return 'Base'
  return 'Crítico'
}

function pct(curr, prev) {
  if (prev == null || prev === 0) return null
  return parseFloat(((curr - prev) / prev * 100).toFixed(1))
}

// Compara la cuenta propia de Instagram (snapshot del período) contra los competidores.
// Solo devuelve datos si la cuenta propia LIDERA (rank #1, estrictamente mejor que TODOS)
// en al menos una métrica elegida (engagement, crecimiento de seguidores, avg likes).
// Caso contrario devuelve null → la sección se omite del informe ("solo si hay algo bueno").
function buildCompetitorComparison({ ownSnap, ownPrev, competitorAccounts, dataMonth, prev, ownLabel }) {
  if (!ownSnap || !competitorAccounts || competitorAccounts.length === 0) return null

  const competitors = competitorAccounts.map(c => {
    const cur = c.snapshots.find(s => s.month === dataMonth)
    if (!cur) return null
    const prv = c.snapshots.find(s => s.month === prev)
    return {
      name:       c.displayName || `@${c.username}`,
      engagement: cur.engagementRate ?? null,
      avgLikes:   cur.avgLikes ?? null,
      growth:     prv ? pct(cur.followersCount, prv.followersCount) : null,
    }
  }).filter(Boolean)

  if (competitors.length === 0) return null

  const own = {
    name:       ownLabel,
    engagement: ownSnap.engagementRate ?? null,
    avgLikes:   ownSnap.avgLikes ?? null,
    growth:     ownPrev ? pct(ownSnap.followersCount, ownPrev.followersCount) : null,
  }

  const METRICS = [
    { key: 'engagement', label: 'Engagement',                unit: '%', decimals: 2 },
    { key: 'growth',     label: 'Crecimiento de seguidores', unit: '%', decimals: 1 },
    { key: 'avgLikes',   label: 'Promedio de likes',         unit: '',  decimals: 0 },
  ]

  const wins = []
  for (const m of METRICS) {
    const ownVal = own[m.key]
    if (ownVal == null) continue
    const withMetric = competitors.filter(c => c[m.key] != null)
    if (withMetric.length === 0) continue
    // rank #1: estrictamente mayor que todos los competidores
    if (!withMetric.every(c => ownVal > c[m.key])) continue
    const ranking = [
      { name: own.name, value: ownVal, isOwn: true },
      ...withMetric.map(c => ({ name: c.name, value: c[m.key], isOwn: false })),
    ].sort((a, b) => b.value - a.value)
    wins.push({ metric: m.key, label: m.label, unit: m.unit, decimals: m.decimals, ranking })
  }

  if (wins.length === 0) return null
  return { month: dataMonth, ownLabel, competitorsCount: competitors.length, wins }
}

// Mes en el que cae una fecha UTC
function monthOfDate(d) {
  const date = new Date(d)
  const y = date.getFullYear()
  const m = date.getMonth() + 1
  return `${y}-${String(m).padStart(2, '0')}`
}

// ─── Agregador principal ──────────────────────────────────────────────────────

/**
 * Recopila todos los datos necesarios para el informe mensual de un proyecto.
 * Retorna un objeto estructurado con secciones condicionales.
 */
async function aggregateReportData(projectId, workspaceId, month, cachedAnalysis = null, objectives = {}, cachedData = null, enabledSections = null, opts = {}) {
  // Período de datos del informe. Con periodStart/End explícitos se usa ese rango;
  // sin ellos (informes legacy / default) el período es el mes calendario anterior completo.
  // Ej: "Informe de Junio 2026" → período de datos: 01/06/2026–30/06/2026.
  const period       = resolveReportPeriod(month, opts.periodStart, opts.periodEnd)
  const monthsCovered = monthsInRange(period.start, period.end)
  const dataMonth    = monthsCovered[monthsCovered.length - 1] // mes ancla (más reciente) — stock + objetivos + label
  const multiMonth   = monthsCovered.length > 1                // rango que abarca >1 mes calendario
  const briefs       = opts.briefs ?? null

  // Ignorar análisis cacheado sin resumen válido (ej: guardado vacío tras un error de Claude)
  const validCachedAnalysis = cachedAnalysis?.resumen ? cachedAnalysis : null

  // Warnings de datos: fetch en vivo fallidos (token vencido, rate limit, timeout) que
  // antes se tragaban con un console.warn y dejaban la sección en null sin aviso — ahora
  // se juntan acá para mostrarse en el informe y para que el intento NO se cachee como
  // definitivo (ver `_dataCacheIsNew` más abajo), así un próximo request reintenta solo.
  const dataWarnings = []
  const warn = (section, label, err) => {
    dataWarnings.push({ section, label, message: err?.message || 'error desconocido' })
    console.warn(`[MonthlyReport] ${label} fetch en vivo fallido (ignorado):`, err?.message)
  }

  // Secciones habilitadas para este informe. null = todas (compatibilidad con informes legacy).
  // `evolution` se rige por `analytics` (es la serie histórica del mismo dato).
  const enabledSet = Array.isArray(enabledSections) ? new Set(enabledSections) : null
  const wants = (key) => !enabledSet || enabledSet.has(key === 'evolution' ? 'analytics' : key)

  // Caché completo disponible: retornar sin queries ni llamadas a APIs externas.
  // Los OBJETIVOS no se cachean — se recalculan siempre (queries livianas a snapshots)
  // para reflejar al instante cualquier target editado.
  if (cachedData && validCachedAnalysis) {
    const objectivesResults = wants('objectives')
      ? await computeObjectives({
          projectId, workspaceId, dataMonth,
          googleAds: cachedData.sections?.googleAds ?? null,
          metaAds:   cachedData.sections?.metaAds   ?? null,
        })
      : []
    return {
      project:        cachedData.project,
      month,
      dataMonth:      cachedData.dataMonth,
      period:         buildPeriodMeta(period, monthsCovered, multiMonth),
      connectedTypes: cachedData.connectedTypes,
      sections:       cachedData.sections,
      objectives:     objectivesResults,
      analysis:       validCachedAnalysis,
      analysisError:  null,
      dataWarnings:   [], // un dataCache persistido nunca tiene warnings (ver `_dataCacheIsNew` más abajo)
      _analysisIsNew:  false,
      _dataCacheIsNew: false,
    }
  }

  const prev      = prevMonthStr(monthsCovered[0])   // mes anterior al inicio del período (para deltas mes-completo)
  const last6     = prevMonthsArr(dataMonth, 6)

  // Rango de fechas real del período de datos (para tasks). Usa el rango elegido,
  // no el mes ancla — así un informe parcial o multi-mes cuenta las tareas correctas.
  const monthStart = new Date(`${period.start}T00:00:00.000Z`)
  const monthEnd   = new Date(`${period.end}T23:59:59.999Z`)

  const [
    project,
    geoAudit,
    geoAuditHistory,
    analyticsSnap,
    analyticsPrev,
    analyticsEvolution,
    instagramSnap,
    instagramPrev,
    tiktokSnap,
    tiktokPrev,
    youtubeSnap,
    youtubePrev,
    linkedinSnap,
    linkedinPrev,
    facebookSnap,
    facebookPrev,
    pageSpeedMobile,
    pageSpeedDesktop,
    allKeywords,
    completedTasks,
    integrations,
    seoSnap,
    seoPrev,
    competitorAccounts,
  ] = await Promise.all([
    // Proyecto
    prisma.project.findUnique({
      where:  { id: projectId },
      select: { id: true, name: true, websiteUrl: true, connections: true,
                services: { include: { service: { select: { name: true } } } } },
    }),

    // GEO audit más reciente completado
    prisma.geoAudit.findFirst({
      where:   { projectId, workspaceId, status: 'completed' },
      orderBy: { createdAt: 'desc' },
      select:  { score: true, createdAt: true, citability: true, brandAuthority: true, eeat: true, technical: true, platforms: true, schema: true },
    }),

    // Historial de scores GEO (últimos 6 audits completados, para gráfico de evolución)
    prisma.geoAudit.findMany({
      where:   { projectId, workspaceId, status: 'completed' },
      orderBy: { createdAt: 'desc' },
      take:    6,
      select:  { score: true, createdAt: true },
    }),

    // GA4 snapshots — se usa dataMonth (mes anterior al del informe)
    prisma.analyticsSnapshot.findFirst({
      where:   { projectId, workspaceId, month: dataMonth },
      select:  { sessions: true, activeUsers: true, newUsers: true, pageviews: true,
                 bounceRate: true, avgDuration: true, conversions: true, topChannels: true,
                 topPages: true, topSources: true, aiTraffic: true },
    }),
    prisma.analyticsSnapshot.findFirst({
      where:   { projectId, workspaceId, month: prev },
      select:  { sessions: true, activeUsers: true, newUsers: true, pageviews: true,
                 bounceRate: true, avgDuration: true, conversions: true },
    }),
    // Últimos 6 snapshots GA4 (evolución)
    prisma.analyticsSnapshot.findMany({
      where:   { projectId, workspaceId, month: { in: last6 } },
      orderBy: { month: 'asc' },
      select:  { month: true, sessions: true, activeUsers: true, newUsers: true, conversions: true },
    }),

    // Instagram snapshots
    prisma.instagramSnapshot.findFirst({
      where:   { projectId, workspaceId, month: dataMonth },
      select:  { followersCount: true, engagementRate: true, avgLikes: true,
                 avgComments: true, postsCount: true, mediaCount: true, topPosts: true,
                 reach: true, views: true, totalSaved: true, totalShares: true, avgReach: true },
    }),
    prisma.instagramSnapshot.findFirst({
      where:   { projectId, workspaceId, month: prev },
      select:  { followersCount: true, engagementRate: true, reach: true },
    }),

    // TikTok snapshots
    prisma.tikTokSnapshot.findFirst({
      where:   { projectId, workspaceId, month: dataMonth },
      select:  { followersCount: true, engagementRate: true, avgViews: true,
                 avgLikes: true, postsThisMonth: true, likesCount: true, topVideos: true },
    }),
    prisma.tikTokSnapshot.findFirst({
      where:   { projectId, workspaceId, month: prev },
      select:  { followersCount: true, engagementRate: true },
    }),

    // YouTube snapshots
    prisma.youTubeSnapshot.findFirst({
      where:   { projectId, workspaceId, month: dataMonth },
      select:  { subscriberCount: true, engagementRate: true, avgViews: true, monthViews: true,
                 viewCountTotal: true, videosThisMonth: true, longsThisMonth: true,
                 shortsThisMonth: true, videoCount: true, topVideos: true },
    }),
    prisma.youTubeSnapshot.findFirst({
      where:   { projectId, workspaceId, month: prev },
      select:  { subscriberCount: true, engagementRate: true, viewCountTotal: true },
    }),

    // LinkedIn snapshots
    prisma.linkedinSnapshot.findFirst({
      where:   { projectId, workspaceId, month: dataMonth },
      select:  { followersCount: true, engagementRate: true, impressions: true,
                 clicks: true, ctr: true, totalLikes: true, totalComments: true,
                 totalShares: true, postsThisMonth: true, topPosts: true, demographics: true },
    }),
    prisma.linkedinSnapshot.findFirst({
      where:   { projectId, workspaceId, month: prev },
      select:  { followersCount: true, engagementRate: true, impressions: true },
    }),

    // Facebook snapshots
    prisma.facebookSnapshot.findFirst({
      where:   { projectId, workspaceId, month: dataMonth },
      select:  { followersCount: true, fanCount: true, engagementRate: true, reach: true,
                 impressions: true, totalLikes: true, totalComments: true,
                 totalShares: true, postsThisMonth: true, topPosts: true },
    }),
    prisma.facebookSnapshot.findFirst({
      where:   { projectId, workspaceId, month: prev },
      select:  { followersCount: true, engagementRate: true, reach: true },
    }),

    // PageSpeed
    prisma.pageSpeedResult.findFirst({
      where:   { projectId, workspaceId, strategy: 'mobile', status: 'done' },
      orderBy: { createdAt: 'desc' },
      select:  { performanceScore: true, metrics: true, createdAt: true },
    }),
    prisma.pageSpeedResult.findFirst({
      where:   { projectId, workspaceId, strategy: 'desktop', status: 'done' },
      orderBy: { createdAt: 'desc' },
      select:  { performanceScore: true, metrics: true, createdAt: true },
    }),

    // Keywords — todos los rankings (sin filtrar por mes), el más reciente se usa como "actual"
    prisma.trackedKeyword.findMany({
      where:   { projectId, workspaceId },
      include: {
        rankings: {
          orderBy: { month: 'desc' },
        },
      },
    }),

    // Tasks COMPLETED en el mes
    prisma.task.findMany({
      where: {
        projectId,
        status:      'COMPLETED',
        completedAt: { gte: monthStart, lte: monthEnd },
      },
      select: {
        id: true, description: true, completedAt: true,
        startedAt: true, pausedMinutes: true, minutesOverride: true,
        user:      { select: { name: true } },
      },
      orderBy: { completedAt: 'desc' },
    }),

    // Integraciones activas del proyecto (incluyendo tokens para ads)
    prisma.projectIntegration.findMany({
      where:  { projectId, status: 'active' },
      select: { id: true, type: true, status: true, customerId: true, propertyId: true,
                accessToken: true, refreshToken: true, expiresAt: true, scopes: true },
    }),

    // Search Console snapshot (SEO)
    prisma.searchConsoleSnapshot.findFirst({
      where:   { projectId, workspaceId, month: dataMonth },
      select:  { clicks: true, impressions: true, ctr: true, avgPosition: true,
                 topQueries: true, topPages: true, devices: true },
    }),
    prisma.searchConsoleSnapshot.findFirst({
      where:   { projectId, workspaceId, month: prev },
      select:  { clicks: true, impressions: true, ctr: true, avgPosition: true },
    }),

    // Competidores de Instagram — snapshots del período (dataMonth) + mes anterior (para crecimiento)
    prisma.competitorAccount.findMany({
      where:  { projectId, platform: 'instagram' },
      select: {
        username: true, displayName: true,
        snapshots: {
          where:  { month: { in: [dataMonth, prev] } },
          select: { month: true, followersCount: true, engagementRate: true, avgLikes: true },
        },
      },
    }),
  ])

  // ── Integrations map ─────────────────────────────────────────────────────────
  const connectedTypes = new Set(integrations.map(i => i.type))

  // ── Suma de flujos multi-mes (rama aditiva) ──────────────────────────────────
  // Para un informe que abarca varios meses completos, las métricas de FLUJO
  // (sesiones, clicks, posts, vistas…) se SUMAN a lo largo de los meses cubiertos.
  // Las de STOCK (seguidores, engagement, posición) se toman del mes ancla (dataMonth).
  // En informes de un solo mes esta rama no corre → comportamiento idéntico al actual.
  let flow = null
  if (multiMonth) {
    const inMonths = { projectId, workspaceId, month: { in: monthsCovered } }
    const [ga4Rows, seoRows, igRows, tkRows, ytRows, liRows, fbRows] = await Promise.all([
      prisma.analyticsSnapshot.findMany({ where: inMonths, select: { sessions: true, activeUsers: true, newUsers: true, pageviews: true, conversions: true } }),
      prisma.searchConsoleSnapshot.findMany({ where: inMonths, select: { clicks: true, impressions: true } }),
      prisma.instagramSnapshot.findMany({ where: inMonths, select: { postsCount: true } }),
      prisma.tikTokSnapshot.findMany({ where: inMonths, select: { postsThisMonth: true } }),
      prisma.youTubeSnapshot.findMany({ where: inMonths, select: { monthViews: true, videosThisMonth: true, shortsThisMonth: true, longsThisMonth: true } }),
      prisma.linkedinSnapshot.findMany({ where: inMonths, select: { postsThisMonth: true, impressions: true, clicks: true, totalLikes: true, totalComments: true, totalShares: true } }),
      prisma.facebookSnapshot.findMany({ where: inMonths, select: { postsThisMonth: true, totalLikes: true, totalComments: true, totalShares: true } }),
    ])
    const sum = (rows, f) => rows.reduce((s, r) => s + (r[f] ?? 0), 0)
    flow = {
      ga4: { sessions: sum(ga4Rows, 'sessions'), activeUsers: sum(ga4Rows, 'activeUsers'), newUsers: sum(ga4Rows, 'newUsers'), pageviews: sum(ga4Rows, 'pageviews'), conversions: sum(ga4Rows, 'conversions') },
      seo: { clicks: sum(seoRows, 'clicks'), impressions: sum(seoRows, 'impressions') },
      ig:  { postsCount: sum(igRows, 'postsCount') },
      tk:  { postsThisMonth: sum(tkRows, 'postsThisMonth') },
      yt:  { monthViews: sum(ytRows, 'monthViews'), videosThisMonth: sum(ytRows, 'videosThisMonth'), shortsThisMonth: sum(ytRows, 'shortsThisMonth'), longsThisMonth: sum(ytRows, 'longsThisMonth') },
      li:  { postsThisMonth: sum(liRows, 'postsThisMonth'), impressions: sum(liRows, 'impressions'), clicks: sum(liRows, 'clicks'), totalLikes: sum(liRows, 'totalLikes'), totalComments: sum(liRows, 'totalComments'), totalShares: sum(liRows, 'totalShares') },
      fb:  { postsThisMonth: sum(fbRows, 'postsThisMonth'), totalLikes: sum(fbRows, 'totalLikes'), totalComments: sum(fbRows, 'totalComments'), totalShares: sum(fbRows, 'totalShares') },
    }
  }

  // ── Google Ads + Meta Ads (fetch async con el rango de fechas REAL del informe) ──
  // Ads es range-native: para informes parciales o multi-mes trae el rango exacto.
  const dateRange = { startDate: period.start, endDate: period.end }

  const gadsIntegration = integrations.find(i => i.type === 'google_ads')
  const metaIntegration = integrations.find(i => i.type === 'meta_ads')

  const [googleAdsRaw, metaAdsRaw] = await Promise.all([
    wants('googleAds') && gadsIntegration && gadsIntegration.customerId && process.env.GOOGLE_ADS_DEVELOPER_TOKEN
      ? fetchGoogleAdsData(gadsIntegration, 'this_month', dateRange).catch(err => {
          warn('googleAds', 'Google Ads', err)
          return null
        })
      : Promise.resolve(null),
    wants('metaAds') && metaIntegration && metaIntegration.propertyId
      ? getValidFbToken(metaIntegration)
          .then(token => fetchMetaAdsData(metaIntegration.propertyId, token, 'this_month', dateRange))
          .catch(err => {
            warn('metaAds', 'Meta Ads', err)
            return null
          })
      : Promise.resolve(null),
  ])

  const googleAds = googleAdsRaw ? {
    cost:        googleAdsRaw.cost,
    impressions: googleAdsRaw.impressions,
    clicks:      googleAdsRaw.clicks,
    ctr:         googleAdsRaw.ctr,
    conversions: googleAdsRaw.conversions,
    avgCpc:      googleAdsRaw.avgCpc,
    campaigns:   (googleAdsRaw.campaigns ?? []).slice(0, 5),
    topAds:      (googleAdsRaw.topAds ?? []).slice(0, 5),  // preview de texto, sin imagen
  } : null

  const metaAds = metaAdsRaw ? {
    spend:       metaAdsRaw.spend,
    impressions: metaAdsRaw.impressions,
    clicks:      metaAdsRaw.clicks,
    ctr:         metaAdsRaw.ctr,
    reach:       metaAdsRaw.reach,
    cpm:         metaAdsRaw.cpm,
    campaigns:   (metaAdsRaw.campaigns ?? []).slice(0, 5),
    // Miniaturas del creativo cacheadas (las URLs de Meta vencen)
    topAds:      await cacheImagesInArray((metaAdsRaw.topAds ?? []).slice(0, 5), 'thumbnailUrl', workspaceId),
  } : null

  // ── GEO ──────────────────────────────────────────────────────────────────────
  const geo = geoAudit ? {
    score: geoAudit.score,
    band:  geoBand(geoAudit.score),
    date:  geoAudit.createdAt,
    components: {
      citability:     geoAudit.citability     ?? null,
      brandAuthority: geoAudit.brandAuthority ?? null,
      eeat:           geoAudit.eeat           ?? null,
      technical:      geoAudit.technical      ?? null,
      platforms:      geoAudit.platforms      ?? null,
      schema:         geoAudit.schema         ?? null,
    },
    // Historial de audits ordenado de más antiguo a más reciente (para gráfico de evolución)
    history: geoAuditHistory.length >= 2
      ? [...geoAuditHistory].reverse().map(a => ({
          score: a.score,
          date:  a.createdAt,
        }))
      : null,
  } : null

  // ── Analytics GA4 ────────────────────────────────────────────────────────────
  const analytics = analyticsSnap ? {
    sessions:    flow ? flow.ga4.sessions    : (analyticsSnap.sessions    ?? 0),
    activeUsers: flow ? flow.ga4.activeUsers : (analyticsSnap.activeUsers ?? 0),
    newUsers:    flow ? flow.ga4.newUsers    : (analyticsSnap.newUsers    ?? 0),
    pageviews:   flow ? flow.ga4.pageviews   : (analyticsSnap.pageviews   ?? 0),
    bounceRate:  analyticsSnap.bounceRate  ?? 0,
    avgDuration: analyticsSnap.avgDuration ?? 0,
    conversions: flow ? flow.ga4.conversions : (analyticsSnap.conversions ?? 0),
    topChannels: (() => {
      try { return JSON.parse(analyticsSnap.topChannels || '[]') } catch { return [] }
    })(),
    topPages: (() => {
      try { return JSON.parse(analyticsSnap.topPages || '[]') } catch { return [] }
    })(),
    topSources: (() => {
      try { return JSON.parse(analyticsSnap.topSources || '[]') } catch { return [] }
    })(),
    aiTraffic: (() => {
      try {
        const raw = JSON.parse(analyticsSnap.aiTraffic || '{}')
        // Solo incluir fuentes con > 0 sesiones
        return Object.fromEntries(Object.entries(raw).filter(([, v]) => v > 0))
      } catch { return {} }
    })(),
    // Deltas mes-a-mes solo tienen sentido en informes de un mes; en multi-mes se omiten.
    delta: (!flow && analyticsPrev) ? {
      sessions:    pct(analyticsSnap.sessions    ?? 0, analyticsPrev.sessions),
      activeUsers: pct(analyticsSnap.activeUsers ?? 0, analyticsPrev.activeUsers),
      newUsers:    pct(analyticsSnap.newUsers    ?? 0, analyticsPrev.newUsers),
      pageviews:   pct(analyticsSnap.pageviews   ?? 0, analyticsPrev.pageviews),
      conversions: pct(analyticsSnap.conversions ?? 0, analyticsPrev.conversions),
    } : null,
  } : null

  // ── Evolution (últimos 3 meses GA4) ─────────────────────────────────────────
  const evolution = analyticsEvolution.length >= 2 ? analyticsEvolution : null

  // ── Instagram (con fallback a snapshot más reciente o datos en vivo) ──────────
  function parseIgTopPosts(json) {
    if (!json) return []
    try { const v = JSON.parse(json); return Array.isArray(v) ? v : [] }
    catch { return [] }
  }

  // Mejor publicación por alcance, derivada de los topPosts cacheados.
  function bestPostByReach(topPosts) {
    const withReach = topPosts.filter(p => p.reach != null)
    if (!withReach.length) return null
    return withReach.sort((a, b) => (b.reach ?? 0) - (a.reach ?? 0))[0]
  }

  let instagram = null
  if (instagramSnap) {
    // Idempotente: si el snapshot ya tiene URLs cacheadas (/api/social-image) es no-op;
    // si quedaron URLs de CDN (snapshot tomado antes del cacheo, aún frescas) las cachea
    // ahora, antes de congelarlas en el dataCache del informe.
    const topPosts = await cacheImagesInArray(parseIgTopPosts(instagramSnap.topPosts), 'imgSrc', workspaceId)
    instagram = {
      followersCount:  instagramSnap.followersCount,
      engagementRate:  instagramSnap.engagementRate,
      avgLikes:        instagramSnap.avgLikes,
      avgComments:     instagramSnap.avgComments,
      postsCount:      flow ? flow.ig.postsCount : instagramSnap.postsCount,
      topPosts,
      bestPost:        topPosts[0] ?? null,
      reach:           instagramSnap.reach,
      views:           instagramSnap.views,
      totalSaved:      instagramSnap.totalSaved,
      totalShares:     instagramSnap.totalShares,
      avgReach:        instagramSnap.avgReach,
      bestByReach:     bestPostByReach(topPosts),
      deltaFollowers:  (!flow && instagramPrev) ? pct(instagramSnap.followersCount, instagramPrev.followersCount) : null,
      deltaEngagement: (!flow && instagramPrev) ? pct(instagramSnap.engagementRate ?? 0, instagramPrev.engagementRate) : null,
      deltaReach:      (!flow && instagramPrev?.reach != null && instagramSnap.reach != null) ? pct(instagramSnap.reach, instagramPrev.reach) : null,
    }
  } else {
    // Fallback 1: snapshot más reciente disponible (cualquier mes)
    const recentIg = await prisma.instagramSnapshot.findFirst({
      where:   { projectId, workspaceId },
      orderBy: { month: 'desc' },
      select:  { followersCount: true, engagementRate: true, avgLikes: true,
                 avgComments: true, postsCount: true, mediaCount: true, topPosts: true, month: true,
                 reach: true, views: true, totalSaved: true, totalShares: true, avgReach: true },
    })
    if (recentIg) {
      const prevIg = await prisma.instagramSnapshot.findFirst({
        where:  { projectId, workspaceId, month: prevMonthStr(recentIg.month) },
        select: { followersCount: true, engagementRate: true, reach: true },
      })
      const topPosts = await cacheImagesInArray(parseIgTopPosts(recentIg.topPosts), 'imgSrc', workspaceId)
      instagram = {
        followersCount:  recentIg.followersCount,
        engagementRate:  recentIg.engagementRate,
        avgLikes:        recentIg.avgLikes,
        avgComments:     recentIg.avgComments,
        postsCount:      recentIg.postsCount,
        topPosts,
        bestPost:        topPosts[0] ?? null,
        reach:           recentIg.reach,
        views:           recentIg.views,
        totalSaved:      recentIg.totalSaved,
        totalShares:     recentIg.totalShares,
        avgReach:        recentIg.avgReach,
        bestByReach:     bestPostByReach(topPosts),
        deltaFollowers:  prevIg ? pct(recentIg.followersCount, prevIg.followersCount) : null,
        deltaEngagement: prevIg ? pct(recentIg.engagementRate ?? 0, prevIg.engagementRate) : null,
        deltaReach:      prevIg?.reach != null && recentIg.reach != null ? pct(recentIg.reach, prevIg.reach) : null,
        _fallbackMonth:  recentIg.month,
      }
    }
    // Ya no hay fallback en vivo acá — ver "check-readiness" (se corre antes de
    // generar, desde el modal, y deja el snapshot del mes guardado si hace falta).
  }

  // Stories del mes (efímeras, capturadas a diario por el cron → persistidas en
  // InstagramStory). Se adjuntan al bloque de Instagram si hay al menos una.
  if (instagram) {
    try {
      instagram.stories = await getStoriesSummary(projectId, dataMonth)
    } catch (err) {
      console.warn('[MonthlyReport] Stories de Instagram no disponibles:', err.message)
      instagram.stories = null
    }
  }

  // ── Comparación con competidores (solo si lideramos en alguna métrica) ────────
  // Usa el snapshot propio del período (instagramSnap) para comparar mes contra mes.
  const competitors = buildCompetitorComparison({
    ownSnap:  instagramSnap,
    ownPrev:  instagramPrev,
    competitorAccounts,
    dataMonth,
    prev,
    ownLabel: project?.name || 'Tu cuenta',
  })

  // ── TikTok (con fallback a snapshot más reciente o datos en vivo) ─────────────
  function parseTkTopVideos(json) {
    if (!json) return []
    try { const v = JSON.parse(json); return Array.isArray(v) ? v : [] }
    catch { return [] }
  }

  let tiktok = null
  if (tiktokSnap) {
    const topVideos = parseTkTopVideos(tiktokSnap.topVideos)
    tiktok = {
      followersCount:  tiktokSnap.followersCount,
      engagementRate:  tiktokSnap.engagementRate,
      avgViews:        tiktokSnap.avgViews,
      avgLikes:        tiktokSnap.avgLikes,
      postsThisMonth:  flow ? flow.tk.postsThisMonth : tiktokSnap.postsThisMonth,
      likesCount:      tiktokSnap.likesCount,
      topVideos,
      bestVideo:       topVideos[0] ?? null,
      deltaFollowers:  (!flow && tiktokPrev) ? pct(tiktokSnap.followersCount, tiktokPrev.followersCount) : null,
      deltaEngagement: (!flow && tiktokPrev) ? pct(tiktokSnap.engagementRate ?? 0, tiktokPrev.engagementRate) : null,
    }
  } else {
    // Fallback 1: snapshot más reciente disponible (cualquier mes)
    const recentTk = await prisma.tikTokSnapshot.findFirst({
      where:   { projectId, workspaceId },
      orderBy: { month: 'desc' },
      select:  { followersCount: true, engagementRate: true, avgViews: true,
                 avgLikes: true, postsThisMonth: true, likesCount: true, topVideos: true, month: true },
    })
    if (recentTk) {
      const prevTk = await prisma.tikTokSnapshot.findFirst({
        where:  { projectId, workspaceId, month: prevMonthStr(recentTk.month) },
        select: { followersCount: true, engagementRate: true },
      })
      const topVideos = parseTkTopVideos(recentTk.topVideos)
      tiktok = {
        followersCount:  recentTk.followersCount,
        engagementRate:  recentTk.engagementRate,
        avgViews:        recentTk.avgViews,
        avgLikes:        recentTk.avgLikes,
        postsThisMonth:  recentTk.postsThisMonth,
        likesCount:      recentTk.likesCount,
        topVideos,
        bestVideo:       topVideos[0] ?? null,
        deltaFollowers:  prevTk ? pct(recentTk.followersCount, prevTk.followersCount) : null,
        deltaEngagement: prevTk ? pct(recentTk.engagementRate ?? 0, prevTk.engagementRate) : null,
        _fallbackMonth:  recentTk.month,
      }
    }
    // Ya no hay fallback en vivo acá — ver "check-readiness".
  }

  // ── YouTube (con fallback a snapshot más reciente o datos en vivo) ────────────
  function parseYtTopVideos(json) {
    if (!json) return []
    try { const v = JSON.parse(json); return Array.isArray(v) ? v : [] }
    catch { return [] }
  }
  // `useFlow` = aplicar la suma multi-mes (solo para el snapshot del mes ancla, no en fallbacks)
  function buildYt(snap, prevSnap, fallbackMonth, useFlow = false) {
    const topVideos = parseYtTopVideos(snap.topVideos)
    const f = useFlow ? flow : null
    return {
      subscriberCount:  snap.subscriberCount,
      engagementRate:   snap.engagementRate,
      avgViews:         snap.avgViews,
      monthViews:       f ? f.yt.monthViews      : snap.monthViews,
      videosThisMonth:  f ? f.yt.videosThisMonth : snap.videosThisMonth,
      shortsThisMonth:  f ? f.yt.shortsThisMonth : snap.shortsThisMonth,
      longsThisMonth:   f ? f.yt.longsThisMonth  : snap.longsThisMonth,
      topVideos,
      bestVideo:        topVideos[0] ?? null,
      deltaSubscribers: (!f && prevSnap) ? pct(snap.subscriberCount, prevSnap.subscriberCount) : null,
      deltaViews:       (!f && prevSnap?.viewCountTotal != null && snap.viewCountTotal != null)
                          ? snap.viewCountTotal - prevSnap.viewCountTotal : null,
      ...(fallbackMonth ? { _fallbackMonth: fallbackMonth } : {}),
    }
  }

  let youtube = null
  if (youtubeSnap) {
    youtube = buildYt(youtubeSnap, youtubePrev, null, true)
  } else {
    // Fallback 1: snapshot más reciente disponible (cualquier mes)
    const recentYt = await prisma.youTubeSnapshot.findFirst({
      where:   { projectId, workspaceId },
      orderBy: { month: 'desc' },
      select:  { subscriberCount: true, engagementRate: true, avgViews: true, monthViews: true,
                 viewCountTotal: true, videosThisMonth: true, longsThisMonth: true,
                 shortsThisMonth: true, topVideos: true, month: true },
    })
    if (recentYt) {
      const prevYt = await prisma.youTubeSnapshot.findFirst({
        where:  { projectId, workspaceId, month: prevMonthStr(recentYt.month) },
        select: { subscriberCount: true, viewCountTotal: true },
      })
      youtube = buildYt(recentYt, prevYt, recentYt.month)
    }
    // Ya no hay fallback en vivo acá — ver "check-readiness".
  }

  // ── LinkedIn (con fallback a snapshot más reciente o datos en vivo) ──────────
  function parseLi(snap) {
    if (!snap) return null
    return {
      ...snap,
      topPosts:     (() => { try { return JSON.parse(snap.topPosts     ?? '[]') } catch { return [] } })(),
      demographics: (() => { try { return JSON.parse(snap.demographics ?? '{}') } catch { return {} } })(),
    }
  }

  let linkedin = null
  if (linkedinSnap) {
    const s = parseLi(linkedinSnap)
    linkedin = {
      followersCount:  s.followersCount,
      engagementRate:  s.engagementRate,
      impressions:     flow ? flow.li.impressions : s.impressions,
      clicks:          flow ? flow.li.clicks      : s.clicks,
      ctr:             flow ? (flow.li.impressions > 0 ? parseFloat((flow.li.clicks / flow.li.impressions * 100).toFixed(2)) : null) : s.ctr,
      totalLikes:      flow ? flow.li.totalLikes    : s.totalLikes,
      totalComments:   flow ? flow.li.totalComments : s.totalComments,
      totalShares:     flow ? flow.li.totalShares   : s.totalShares,
      postsThisMonth:  flow ? flow.li.postsThisMonth : s.postsThisMonth,
      topPosts:        s.topPosts,
      demographics:    s.demographics,
      deltaFollowers:  (!flow && linkedinPrev) ? pct(s.followersCount, linkedinPrev.followersCount) : null,
      deltaEngagement: (!flow && linkedinPrev) ? pct(s.engagementRate ?? 0, linkedinPrev.engagementRate) : null,
      deltaImpressions: (!flow && linkedinPrev) ? pct(s.impressions ?? 0, linkedinPrev.impressions) : null,
    }
  } else {
    // Fallback 1: snapshot más reciente disponible
    const recentLi = await prisma.linkedinSnapshot.findFirst({
      where:   { projectId, workspaceId },
      orderBy: { month: 'desc' },
      select:  { followersCount: true, engagementRate: true, impressions: true,
                 clicks: true, ctr: true, totalLikes: true, totalComments: true,
                 totalShares: true, postsThisMonth: true, topPosts: true, demographics: true, month: true },
    })
    if (recentLi) {
      const prevLi = await prisma.linkedinSnapshot.findFirst({
        where:  { projectId, workspaceId, month: prevMonthStr(recentLi.month) },
        select: { followersCount: true, engagementRate: true, impressions: true },
      })
      const s = parseLi(recentLi)
      linkedin = {
        followersCount:  s.followersCount,
        engagementRate:  s.engagementRate,
        impressions:     s.impressions,
        clicks:          s.clicks,
        ctr:             s.ctr,
        totalLikes:      s.totalLikes,
        totalComments:   s.totalComments,
        totalShares:     s.totalShares,
        postsThisMonth:  s.postsThisMonth,
        topPosts:        s.topPosts,
        demographics:    s.demographics,
        deltaFollowers:  prevLi ? pct(s.followersCount, prevLi.followersCount) : null,
        deltaEngagement: prevLi ? pct(s.engagementRate ?? 0, prevLi.engagementRate) : null,
        deltaImpressions: prevLi ? pct(s.impressions ?? 0, prevLi.impressions) : null,
        _fallbackMonth:  s.month,
      }
    }
    // Ya no hay fallback en vivo acá — ver "check-readiness".
  }

  // ── Facebook (con fallback a snapshot más reciente o datos en vivo) ──────────
  function parseFb(snap) {
    if (!snap) return null
    return {
      ...snap,
      topPosts: (() => { try { return JSON.parse(snap.topPosts ?? '[]') } catch { return [] } })(),
    }
  }

  let facebook = null
  if (facebookSnap) {
    const s = parseFb(facebookSnap)
    facebook = {
      followersCount:  s.followersCount,
      fanCount:        s.fanCount,
      engagementRate:  s.engagementRate,
      reach:           s.reach,
      impressions:     s.impressions,
      totalLikes:      flow ? flow.fb.totalLikes    : s.totalLikes,
      totalComments:   flow ? flow.fb.totalComments : s.totalComments,
      totalShares:     flow ? flow.fb.totalShares   : s.totalShares,
      postsThisMonth:  flow ? flow.fb.postsThisMonth : s.postsThisMonth,
      topPosts:        s.topPosts,
      deltaFollowers:  (!flow && facebookPrev) ? pct(s.followersCount, facebookPrev.followersCount) : null,
      deltaEngagement: (!flow && facebookPrev) ? pct(s.engagementRate ?? 0, facebookPrev.engagementRate) : null,
      deltaReach:      (!flow && facebookPrev) ? pct(s.reach ?? 0, facebookPrev.reach) : null,
    }
  } else {
    // Fallback 1: snapshot más reciente disponible
    const recentFb = await prisma.facebookSnapshot.findFirst({
      where:   { projectId, workspaceId },
      orderBy: { month: 'desc' },
      select:  { followersCount: true, fanCount: true, engagementRate: true, reach: true,
                 impressions: true, totalLikes: true, totalComments: true,
                 totalShares: true, postsThisMonth: true, topPosts: true, month: true },
    })
    if (recentFb) {
      const prevFb = await prisma.facebookSnapshot.findFirst({
        where:  { projectId, workspaceId, month: prevMonthStr(recentFb.month) },
        select: { followersCount: true, engagementRate: true, reach: true },
      })
      const s = parseFb(recentFb)
      facebook = {
        followersCount:  s.followersCount,
        fanCount:        s.fanCount,
        engagementRate:  s.engagementRate,
        reach:           s.reach,
        impressions:     s.impressions,
        totalLikes:      s.totalLikes,
        totalComments:   s.totalComments,
        totalShares:     s.totalShares,
        postsThisMonth:  s.postsThisMonth,
        topPosts:        s.topPosts,
        deltaFollowers:  prevFb ? pct(s.followersCount, prevFb.followersCount) : null,
        deltaEngagement: prevFb ? pct(s.engagementRate ?? 0, prevFb.engagementRate) : null,
        deltaReach:      prevFb ? pct(s.reach ?? 0, prevFb.reach) : null,
        _fallbackMonth:  s.month,
      }
    }
    // Ya no hay fallback en vivo acá — ver "check-readiness".
  }

  // ── PageSpeed ─────────────────────────────────────────────────────────────────
  const performance = (pageSpeedMobile || pageSpeedDesktop) ? {
    mobile:  pageSpeedMobile  ? {
      score:   pageSpeedMobile.performanceScore,
      metrics: (() => { try { return JSON.parse(pageSpeedMobile.metrics  || '{}') } catch { return {} } })(),
    } : null,
    desktop: pageSpeedDesktop ? {
      score:   pageSpeedDesktop.performanceScore,
      metrics: (() => { try { return JSON.parse(pageSpeedDesktop.metrics || '{}') } catch { return {} } })(),
    } : null,
    date: (pageSpeedMobile || pageSpeedDesktop).createdAt,
  } : null

  // ── Search Console (SEO) ────────────────────────────────────────────────────
  const seo = seoSnap ? {
    clicks:      flow ? flow.seo.clicks      : (seoSnap.clicks      ?? 0),
    impressions: flow ? flow.seo.impressions : (seoSnap.impressions ?? 0),
    ctr:         flow ? (flow.seo.impressions > 0 ? flow.seo.clicks / flow.seo.impressions : 0) : (seoSnap.ctr ?? 0),
    avgPosition: seoSnap.avgPosition  != null ? parseFloat(Number(seoSnap.avgPosition).toFixed(1)) : null,
    topQueries: (() => {
      try { return (JSON.parse(seoSnap.topQueries || '[]')).slice(0, 10) } catch { return [] }
    })(),
    topPages: (() => {
      try { return (JSON.parse(seoSnap.topPages || '[]')).slice(0, 5) } catch { return [] }
    })(),
    delta: (!flow && seoPrev) ? {
      clicks:      pct(seoSnap.clicks      ?? 0, seoPrev.clicks),
      impressions: pct(seoSnap.impressions ?? 0, seoPrev.impressions),
      ctr:         pct(seoSnap.ctr         ?? 0, seoPrev.ctr),
      avgPosition: seoPrev.avgPosition > 0
        ? parseFloat(((seoPrev.avgPosition - (seoSnap.avgPosition ?? 0))).toFixed(1))
        : null,
    } : null,
  } : null

  // ── Keywords — usa el ranking más reciente disponible como "actual"
  // Preferencia: dataMonth → cualquier mes más reciente (fallback)
  // Delta: solo si hay un ranking del mes anterior (prev) para comparar
  const kwTable = allKeywords
    .map(kw => {
      if (kw.rankings.length === 0) return null
      // Preferir el ranking de dataMonth; si no, el más reciente (ya vienen desc)
      const curr = kw.rankings.find(r => r.month === dataMonth) || kw.rankings[0]
      if (!curr || curr.position <= 0) return null
      // Comparación: solo si hay ranking del mes anterior exacto
      const prv = kw.rankings.find(r => r.month === prev)
      return {
        query:       kw.query,
        position:    curr.position,
        delta:       prv && prv.position > 0 ? parseFloat((prv.position - curr.position).toFixed(1)) : null,
        clicks:      curr.clicks,
        impressions: curr.impressions,
        ctr:         curr.ctr,
      }
    })
    .filter(Boolean)
    .sort((a, b) => a.position - b.position)

  const kwMovers  = kwTable.filter(k => k.delta != null)
  const kwImproved = kwMovers.filter(m => m.delta > 0).sort((a, b) => b.delta - a.delta).slice(0, 5)
  const kwDeclined = kwMovers.filter(m => m.delta < 0).sort((a, b) => a.delta - b.delta).slice(0, 5)

  const keywords = kwTable.length > 0 ? {
    table:       kwTable,
    improved:    kwImproved,
    declined:    kwDeclined,
    avgPosition: parseFloat((kwTable.reduce((s, k) => s + k.position, 0) / kwTable.length).toFixed(1)),
    count:       kwTable.length,
  } : null

  // ── Tasks completadas ────────────────────────────────────────────────────────
  const tasks = completedTasks.length > 0 ? completedTasks : null

  // ── Servicios del proyecto ────────────────────────────────────────────────────
  const services = project?.services?.map(ps => ps.service.name) ?? []

  // ── Secciones (filtradas según enabledSections) ───────────────────────────────
  // Si el informe define secciones habilitadas, las demás se excluyen por completo
  // (no se guardan en el caché ni viajan al link público del cliente).
  const allSections = { geo, analytics, evolution, instagram, tiktok, youtube, linkedin, facebook, seo, keywords, googleAds, metaAds, performance, tasks, competitors }
  const sections = {}
  for (const [key, val] of Object.entries(allSections)) {
    sections[key] = wants(key) ? val : null
  }

  // ── Objetivos (persistentes, recalculados siempre, NO se cachean) ─────────────
  const objectivesResults = wants('objectives')
    ? await computeObjectives({
        projectId, workspaceId, dataMonth,
        googleAds: sections.googleAds, metaAds: sections.metaAds,
      })
    : []

  // ── Análisis IA ──────────────────────────────────────────────────────────────
  // Si ya existe un análisis cacheado con resumen válido, no se regenera.
  // El análisis solo considera las secciones habilitadas.
  const periodMeta = buildPeriodMeta(period, monthsCovered, multiMonth)
  const analysis = validCachedAnalysis
    ? validCachedAnalysis
    : await generateAnalysis({ project, month: dataMonth, periodLabel: periodMeta.label,
        geo: sections.geo, analytics: sections.analytics, instagram: sections.instagram,
        tiktok: sections.tiktok, youtube: sections.youtube, linkedin: sections.linkedin, facebook: sections.facebook, keywords: sections.keywords,
        seo: sections.seo, performance: sections.performance, googleAds: sections.googleAds,
        metaAds: sections.metaAds, competitors: sections.competitors,
        workspaceId, objectives: objectivesResults, services, briefs })

  return {
    project: {
      id:         projectId,
      name:       project?.name ?? '',
      websiteUrl: project?.websiteUrl,
      services,
    },
    month,        // mes ancla del informe (ej: "2026-06") — id/navegación
    dataMonth,    // mes ancla del período (más reciente cubierto)
    period:         periodMeta,   // { start, end, label, dataLabel, months, multiMonth }
    connectedTypes: [...connectedTypes],
    sections,
    objectives: objectivesResults,
    analysis,
    analysisError:  analysis?._error ?? null,
    dataWarnings,
    _analysisIsNew:  !validCachedAnalysis && !!analysis?.resumen,
    // No cachear si hubo algún warning (fetch en vivo fallido — un próximo request debe
    // reintentar solo, sin depender de que alguien apriete "Regenerar") ni si estamos
    // usando datos en vivo exitosos (cambian a diario, no son un snapshot congelable).
    _dataCacheIsNew: dataWarnings.length === 0 &&
      instagram?._fallbackMonth !== 'live' && tiktok?._fallbackMonth !== 'live' && youtube?._fallbackMonth !== 'live' && linkedin?._fallbackMonth !== 'live' && facebook?._fallbackMonth !== 'live',
  }
}

// ─── Análisis IA ──────────────────────────────────────────────────────────────

// Arma un contexto compacto de los briefs del cliente para el prompt de IA.
// Los briefs (memoria, marca, y los por-servicio) aportan objetivos, tono y contexto.
// Se recorta agresivamente por tokens: máx ~3500 chars totales, ~400 por valor.
function buildBriefsContext(briefs) {
  if (!briefs) return ''
  const arr = Array.isArray(briefs) ? briefs : Object.entries(briefs).map(([type, answers]) => ({ type, answers }))
  const TYPE_LABEL = {
    memoria: 'Memoria / notas del cliente', marca: 'Marca (documento madre)',
    organico: 'Orgánico / RRSS', meta_ads: 'Meta Ads', web: 'Web', seo_sem: 'SEO / SEM', crm: 'CRM',
  }
  const parts = []
  let budget = 3500
  for (const b of arr) {
    const answers = b.answers && typeof b.answers === 'object' ? b.answers : {}
    const lines = []
    for (const [k, v] of Object.entries(answers)) {
      if (v == null || v === '' || v === false) continue
      const val = String(v).replace(/\s+/g, ' ').trim().slice(0, 400)
      if (!val) continue
      const line = `- ${k}: ${val}`
      lines.push(line)
    }
    if (lines.length === 0) continue
    const block = `[${TYPE_LABEL[b.type] || b.type}]\n${lines.join('\n')}`
    if (budget - block.length < 0) { parts.push(block.slice(0, Math.max(0, budget))); break }
    parts.push(block)
    budget -= block.length
  }
  if (parts.length === 0) return ''
  return `\nCONTEXTO DEL CLIENTE (briefs cargados — usalos para entender los objetivos de negocio, la marca y el tono; alineá el análisis a esto):\n${parts.join('\n\n')}\n`
}

async function generateAnalysis({ project, month, periodLabel, geo, analytics, instagram, tiktok, youtube, linkedin, facebook, keywords, seo, performance, googleAds, metaAds, competitors, workspaceId, objectives = [], services = [], briefs = null }) {
  // Cumplimiento de objetivos (array calculado por computeObjectives)
  const fmtVal = (v, unit) => v == null ? '—' : (unit === '$' ? `$${v}` : unit === '%' ? `${v}%` : unit === 'pos' ? `#${v}` : `${v}`)
  const objCtx = (Array.isArray(objectives) ? objectives : [])
    .filter(o => o.status !== 'orphaned')
    .map(o => ({
      metrica:  `${o.label} (${o.periodLabel})`,
      objetivo: o.metric === 'competidores' ? 'superar competidor' : fmtVal(o.target, o.unit),
      real:     fmtVal(o.actual, o.unit),
      pct:      o.pct,
      status:   o.status,
    }))

  const dataCtx = JSON.stringify({
    proyecto:          project?.name,
    mes:               month,
    serviciosContratados: services.length > 0 ? services : null,
    geo:      geo      ? { score: geo.score, band: geo.band } : null,
    analytics: analytics ? {
      sesiones:       analytics.sessions,
      deltaSesiones:  analytics.delta?.sessions,
      nuevosUsuarios: analytics.newUsers,
      deltaNuevos:    analytics.delta?.newUsers,
      conversiones:   analytics.conversions,
      deltaConversiones: analytics.delta?.conversions,
      tasaRebote:     analytics.bounceRate != null ? `${(analytics.bounceRate * 100).toFixed(1)}%` : null,
    } : null,
    instagram: instagram ? {
      seguidores:      instagram.followersCount,
      deltaSeguidores: instagram.deltaFollowers,
      engagement:      instagram.engagementRate != null ? `${instagram.engagementRate.toFixed(2)}%` : null,
      posts:           instagram.postsCount,
    } : null,
    // Solo se incluye cuando la cuenta propia LIDERA frente a competidores (rank #1).
    competidores: competitors ? {
      vsCompetidores: competitors.competitorsCount,
      lideramosEn:    competitors.wins.map(w => w.label),
    } : null,
    tiktok: tiktok ? {
      seguidores:      tiktok.followersCount,
      deltaSeguidores: tiktok.deltaFollowers,
      engagement:      tiktok.engagementRate != null ? `${tiktok.engagementRate.toFixed(2)}%` : null,
    } : null,
    youtube: youtube ? {
      suscriptores:      youtube.subscriberCount,
      deltaSuscriptores: youtube.deltaSubscribers,
      vistasDelMes:      youtube.monthViews,
      videosNuevos:      youtube.videosThisMonth,
      shorts:            youtube.shortsThisMonth,
      videosLargos:      youtube.longsThisMonth,
      engagement:        youtube.engagementRate != null ? `${youtube.engagementRate.toFixed(2)}%` : null,
    } : null,
    linkedin: linkedin ? {
      seguidores:       linkedin.followersCount,
      deltaSeguidores:  linkedin.deltaFollowers,
      impresiones:      linkedin.impressions,
      deltaImpresiones: linkedin.deltaImpressions,
      clicks:           linkedin.clicks,
      engagement:       linkedin.engagementRate != null ? `${linkedin.engagementRate.toFixed(2)}%` : null,
      posts:            linkedin.postsThisMonth,
    } : null,
    facebook: facebook ? {
      seguidores:      facebook.followersCount,
      deltaSeguidores: facebook.deltaFollowers,
      alcance:         facebook.reach,
      engagement:      facebook.engagementRate != null ? `${facebook.engagementRate.toFixed(2)}%` : null,
      posts:           facebook.postsThisMonth,
    } : null,
    posicionamiento: keywords ? {
      posPromedio:   keywords.avgPosition,
      totalKeywords: keywords.count,
      mejoraronTop3: keywords.improved.slice(0, 3).map(k => k.query),
    } : null,
    seo: seo ? {
      clicks:      seo.clicks,
      impresiones: seo.impressions,
      ctr:         seo.ctr != null ? `${(seo.ctr * 100).toFixed(2)}%` : null,
      posPromedio: seo.avgPosition,
      deltaClicks: seo.delta?.clicks,
    } : null,
    performance: performance ? {
      mobile:  performance.mobile?.score,
      desktop: performance.desktop?.score,
    } : null,
    googleAds: googleAds ? {
      inversion: `$${googleAds.cost.toFixed(2)}`,
      clicks:    googleAds.clicks,
      ctr:       `${googleAds.ctr}%`,
      conversiones: googleAds.conversions,
    } : null,
    metaAds: metaAds ? {
      inversion: `$${metaAds.spend.toFixed(2)}`,
      clicks:    metaAds.clicks,
      ctr:       `${metaAds.ctr}%`,
      alcance:   metaAds.reach,
    } : null,
  }, null, 2)

  const objetivosBloque = objCtx.length > 0
    ? `\nCUMPLIMIENTO DE OBJETIVOS (mencioná explícitamente qué se cumplió y qué no):\n${objCtx.map(o => `- ${o.metrica}: objetivo ${o.objetivo}, real ${o.real}${o.pct != null ? ` (${o.pct}% de cumplimiento)` : ''}`).join('\n')}\n`
    : ''

  const serviciosBloque = services.length > 0
    ? `\nSERVICIOS CONTRATADOS (enfocá el análisis solo en estas áreas):\n${services.map(s => `- ${s}`).join('\n')}\n`
    : ''

  const briefsBloque = buildBriefsContext(briefs)
  const periodoTxt   = periodLabel || month

  const prompt = `Sos un analista de marketing digital experto en comunicación con clientes.
Redactá un análisis en español para el informe del proyecto "${project?.name}" correspondiente al período: ${periodoTxt}.
${serviciosBloque}${briefsBloque}
DATOS DEL PERÍODO:
${dataCtx}
${objetivosBloque}
INSTRUCCIONES DE TONO (MUY IMPORTANTE):
- El NORTE del análisis son los OBJETIVOS del cliente (y el contexto de sus briefs si están): leé cada resultado a la luz de si acerca o aleja de esos objetivos.
- El informe tiene sesgo POSITIVO: destacá primero los logros y avances
- Si hay objetivos definidos, mencioná explícitamente si se cumplieron o no, con el porcentaje de avance
- Si hay métricas negativas o por debajo del objetivo, mencionálas brevemente y siempre con una propuesta de mejora concreta
- Estilo motivador, profesional y constructivo — como un partner estratégico, no como un auditor
- Si no hay datos de una área, omitila — no menciones ausencias a menos que sea relevante
- Usá números concretos en el resumen y en los highlights
- "highlights" = los 3 LOGROS concretos del período (con números); "nextSteps" = los 3 FOCOS/prioridades accionables para el próximo período (no genéricas)
- El "resumen" DEBE estar dividido en 2-3 párrafos cortos separados por un doble salto de línea real (\\n\\n) según la idea (logros / análisis / mejoras). NUNCA un solo bloque largo de texto corrido.

Respondé SOLO con un JSON con esta estructura exacta:
{
  "resumen": "Párrafo 1: logros del período con números leídos contra los objetivos.\\n\\nPárrafo 2: análisis y contexto.\\n\\nPárrafo 3: oportunidades de mejora con propuestas concretas.",
  "highlights": ["logro 1 concreto con número", "logro 2 concreto con número", "logro 3 concreto con número"],
  "alertas": ["solo si hay algo importante que mejorar, máximo 2, siempre con propuesta de solución concreta"],
  "nextSteps": ["foco/acción concreta 1", "foco 2", "foco 3"]
}`

  const tag = `Proyecto "${project?.name}" (${periodoTxt})`

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error(`[MonthlyReport] ${tag}: ANTHROPIC_API_KEY no configurada — no se puede generar el análisis IA`)
    return emptyAnalysis('Falta configurar la IA en el servidor (ANTHROPIC_API_KEY). Avisá al equipo técnico.')
  }

  // Presupuesto mensual de tokens de IA del workspace. El informe es el flujo más caro:
  // sin este guard un workspace podía regenerarlo en loop sin tope.
  if (!(await hasTokenBudget(workspaceId))) {
    console.warn(`[MonthlyReport] ${tag}: presupuesto de tokens de IA agotado — se omite el análisis`)
    return emptyAnalysis('Se alcanzó el límite mensual de tokens de IA del workspace. Ajustá el límite en SuperAdmin o esperá al próximo mes.')
  }

  try {
    const message = await anthropic.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 2500,
      messages:   [{ role: 'user', content: prompt }],
    })

    logTokens('monthly_report', null, message.usage, workspaceId ?? null)
      .catch(err => console.error('[MonthlyReport] Error al registrar tokens de IA:', err.message))

    const stopReason = message.stop_reason
    const raw        = (message.content?.[0]?.text ?? '').trim()

    if (stopReason === 'max_tokens') {
      console.error(`[MonthlyReport] ${tag}: respuesta IA TRUNCADA por max_tokens (largo recibido: ${raw.length} chars)`)
    }

    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      console.error(`[MonthlyReport] ${tag}: la IA no devolvió JSON. stop_reason=${stopReason}. Raw: ${raw.slice(0, 800)}`)
      return emptyAnalysis(stopReason === 'max_tokens'
        ? 'La IA quedó sin espacio y devolvió una respuesta truncada. Probá regenerar.'
        : 'La IA no devolvió un análisis con el formato esperado. Probá regenerar.')
    }

    let parsed
    try {
      parsed = JSON.parse(jsonMatch[0])
    } catch (parseErr) {
      console.error(`[MonthlyReport] ${tag}: no se pudo parsear el JSON de la IA. stop_reason=${stopReason}. ${parseErr.message}. Raw: ${raw.slice(0, 800)}`)
      return emptyAnalysis(stopReason === 'max_tokens'
        ? 'La respuesta de la IA quedó cortada y no se pudo leer. Probá regenerar.'
        : `No se pudo interpretar la respuesta de la IA (${parseErr.message}). Probá regenerar.`)
    }

    if (!parsed?.resumen || !String(parsed.resumen).trim()) {
      console.error(`[MonthlyReport] ${tag}: la IA devolvió un análisis sin resumen. Parsed: ${JSON.stringify(parsed).slice(0, 400)}`)
      return emptyAnalysis('La IA devolvió un análisis vacío (sin resumen). Probá regenerar.')
    }

    return {
      resumen:    String(parsed.resumen),
      highlights: Array.isArray(parsed.highlights) ? parsed.highlights : [],
      alertas:    Array.isArray(parsed.alertas)    ? parsed.alertas    : [],
      nextSteps:  Array.isArray(parsed.nextSteps)  ? parsed.nextSteps  : [],
    }
  } catch (err) {
    const detail = err.status ? `HTTP ${err.status}` : (err.message || 'error desconocido')
    console.error(`[MonthlyReport] ${tag}: error llamando a la IA — ${detail}`, err.stack || '')
    let msg = `No se pudo generar el análisis con IA (${detail}). Probá regenerar.`
    if (err.status === 429)      msg = 'La IA está saturada o se alcanzó el límite de uso (429). Esperá unos minutos y regenerá.'
    else if (err.status === 401) msg = 'Error de autenticación con la IA (401). Revisá la API key del servidor.'
    else if (err.status === 529) msg = 'El servicio de IA está sobrecargado (529). Reintentá en unos minutos.'
    return emptyAnalysis(msg)
  }
}

// Análisis vacío con motivo de falla (se propaga al front como `analysisError`).
// El `_error` nunca se cachea porque solo se persiste el análisis cuando hay `resumen`.
function emptyAnalysis(error) {
  return { resumen: '', highlights: [], alertas: [], nextSteps: [], _error: error }
}

// ─── Detección de secciones disponibles ───────────────────────────────────────
// Determina, por sección, si hay datos/fuente disponible y el estado de su
// integración (para avisar en el modal de "Generar Informe" si algo está
// desconectado y conviene reconectarlo antes de generar). Solo queries livianas
// a la DB — sin APIs externas ni IA.
//
// Devuelve { sectionKey: { available: bool, integration: 'active'|'expired'|'missing'|null } }
//   - integration null    → la sección no depende de una integración (GEO, performance, competidores, tareas)
//   - integration 'active' → integración conectada y vigente
//   - integration 'expired' → existe la integración pero su token se cayó (hay que reconectar)
//   - integration 'missing' → no hay integración, solo datos históricos guardados
async function getAvailableSections(projectId, workspaceId) {
  const [
    integrations, project, analyticsSnap, pageSpeed, geoAudit, seoSnap,
    keyword, igSnap, tkSnap, ytSnap, liSnap, fbSnap, metaAdsSnap, googleAdsSnap, competitor, objective,
  ] = await Promise.all([
    prisma.projectIntegration.findMany({ where: { projectId }, select: { type: true, status: true } }),
    prisma.project.findUnique({ where: { id: projectId }, select: { websiteUrl: true, reportSections: true } }),
    prisma.analyticsSnapshot.findFirst({ where: { projectId, workspaceId }, select: { id: true } }),
    prisma.pageSpeedResult.findFirst({ where: { projectId, workspaceId }, select: { id: true } }),
    prisma.geoAudit.findFirst({ where: { projectId, workspaceId, status: 'completed' }, select: { id: true } }),
    prisma.searchConsoleSnapshot.findFirst({ where: { projectId, workspaceId }, select: { id: true } }),
    prisma.trackedKeyword.findFirst({ where: { projectId, workspaceId }, select: { id: true } }),
    prisma.instagramSnapshot.findFirst({ where: { projectId, workspaceId }, select: { id: true } }),
    prisma.tikTokSnapshot.findFirst({ where: { projectId, workspaceId }, select: { id: true } }),
    prisma.youTubeSnapshot.findFirst({ where: { projectId, workspaceId }, select: { id: true } }),
    prisma.linkedinSnapshot.findFirst({ where: { projectId, workspaceId }, select: { id: true } }),
    prisma.facebookSnapshot.findFirst({ where: { projectId, workspaceId }, select: { id: true } }),
    prisma.adsSnapshot.findFirst({ where: { projectId, workspaceId, type: 'meta_ads' }, select: { id: true } }),
    prisma.adsSnapshot.findFirst({ where: { projectId, workspaceId, type: 'google_ads' }, select: { id: true } }),
    prisma.competitorAccount.findFirst({ where: { projectId, platform: 'instagram' }, select: { id: true } }),
    prisma.marketingObjective.findFirst({ where: { projectId, workspaceId }, select: { id: true } }),
  ])

  const intgByType = new Map(integrations.map(i => [i.type, i.status]))

  // Arma el objeto de estado de una sección. `type` = tipo de integración del que depende (o null).
  function build(available, type) {
    if (!available) return { available: false, integration: null }
    if (!type)      return { available: true,  integration: null }
    if (!intgByType.has(type)) return { available: true, integration: 'missing' }
    return { available: true, integration: intgByType.get(type) === 'active' ? 'active' : 'expired' }
  }

  const has = (type) => intgByType.has(type)
  const sections = {
    analytics:       build(has('google_analytics')      || !!analyticsSnap, 'google_analytics'),
    performance:     build(!!project?.websiteUrl        || !!pageSpeed,     null),
    geo:             build(!!project?.websiteUrl        || !!geoAudit,      null),
    seo:             build(has('google_search_console') || !!seoSnap,       'google_search_console'),
    keywords:        build(has('google_search_console') || !!keyword,       'google_search_console'),
    instagram:       build(has('instagram')             || !!igSnap,        'instagram'),
    tiktok:          build(has('tiktok')                || !!tkSnap,        'tiktok'),
    youtube:         build(has('google_youtube')        || !!ytSnap,        'google_youtube'),
    linkedin:        build(has('linkedin')              || !!liSnap,        'linkedin'),
    facebook:        build(has('facebook')              || !!fbSnap,        'facebook'),
    metaAds:         build(has('meta_ads')              || !!metaAdsSnap,   'meta_ads'),
    googleAds:       build(has('google_ads')            || !!googleAdsSnap, 'google_ads'),
    competitors:     build(!!competitor, null),
    objectives:      build(!!objective, null),
    tasks:           build(true, null),
  }

  // Config manual por proyecto (rueda "⚙️" en Informes): una sección desmarcada ahí
  // deja de ofrecerse en el modal de generar informe, aunque tenga datos/integración.
  // null = sin restricción (no configurado todavía) → no se toca nada.
  if (project?.reportSections) {
    let enabledKeys = null
    try { enabledKeys = JSON.parse(project.reportSections) } catch { enabledKeys = null }
    if (Array.isArray(enabledKeys)) {
      const enabledSet = new Set(enabledKeys)
      for (const key of Object.keys(sections)) {
        if (!enabledSet.has(key)) sections[key] = { available: false, integration: null }
      }
    }
  }

  return sections
}

module.exports = { aggregateReportData, getAvailableSections, resolveReportPeriod }
