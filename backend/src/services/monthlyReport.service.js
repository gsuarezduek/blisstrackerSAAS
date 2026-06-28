const prisma    = require('../lib/prisma')
const Anthropic = require('@anthropic-ai/sdk')
const { logTokens } = require('../lib/logTokens')
const { fetchGoogleAdsData }             = require('./googleAds.service')
const { fetchMetaAdsData, getValidFbToken } = require('./metaAds.service')
const { getValidMetaToken }              = require('./metaTokenRefresh.service')
const { fetchInstagramMetrics }          = require('./instagram.service')
const { getValidTikTokToken }            = require('./tiktokTokenRefresh.service')
const { fetchTikTokMetrics }             = require('./tiktok.service')
const { getValidAccessToken }            = require('./tokenRefresh.service')
const { fetchYouTubeMetrics }            = require('./youtube.service')
const { getValidLinkedinToken }          = require('./linkedinTokenRefresh.service')
const { fetchLinkedinMetrics }           = require('./linkedin.service')
const { getValidFacebookToken }          = require('./metaTokenRefresh.service')
const { fetchFacebookMetrics }           = require('./facebook.service')
const { computeObjectives }              = require('./marketingObjectives.service')
const { cacheImagesInArray }             = require('./socialImageCache.service')
const { monthBounds, prevMonthStr, prevMonthsArr } = require('../lib/monthUtils')

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

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
async function aggregateReportData(projectId, workspaceId, month, cachedAnalysis = null, objectives = {}, cachedData = null, enabledSections = null) {
  // El informe del mes X muestra datos del mes X-1.
  // Ej: "Informe de Mayo 2026" → período de datos: Abril 2026.
  const dataMonth = prevMonthStr(month)

  // Ignorar análisis cacheado sin resumen válido (ej: guardado vacío tras un error de Claude)
  const validCachedAnalysis = cachedAnalysis?.resumen ? cachedAnalysis : null

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
      connectedTypes: cachedData.connectedTypes,
      sections:       cachedData.sections,
      objectives:     objectivesResults,
      analysis:       validCachedAnalysis,
      analysisError:  null,
      _analysisIsNew:  false,
      _dataCacheIsNew: false,
    }
  }

  const prev      = prevMonthStr(dataMonth)   // mes anterior al período (para deltas)
  const last6     = prevMonthsArr(dataMonth, 6)

  // Rango de fechas del período de datos (para tasks)
  const [y, mo] = dataMonth.split('-').map(Number)
  const monthStart = new Date(Date.UTC(y, mo - 1, 1))
  const monthEnd   = new Date(Date.UTC(y, mo, 0, 23, 59, 59, 999))

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

  // ── Google Ads + Meta Ads (fetch async con rango de fechas exacto) ────────────
  const { startDate, endDate } = monthBounds(dataMonth)
  const dateRange = { startDate, endDate }

  const gadsIntegration = integrations.find(i => i.type === 'google_ads')
  const metaIntegration = integrations.find(i => i.type === 'meta_ads')

  const [googleAdsRaw, metaAdsRaw] = await Promise.all([
    wants('googleAds') && gadsIntegration && gadsIntegration.customerId && process.env.GOOGLE_ADS_DEVELOPER_TOKEN
      ? fetchGoogleAdsData(gadsIntegration, 'this_month', dateRange).catch(err => {
          console.warn('[MonthlyReport] Google Ads fetch fallido (ignorado):', err.message)
          return null
        })
      : Promise.resolve(null),
    wants('metaAds') && metaIntegration && metaIntegration.propertyId
      ? getValidFbToken(metaIntegration)
          .then(token => fetchMetaAdsData(metaIntegration.propertyId, token, 'this_month', dateRange))
          .catch(err => {
            console.warn('[MonthlyReport] Meta Ads fetch fallido (ignorado):', err.message)
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
    campaigns:   (googleAdsRaw.campaigns ?? []).slice(0, 5),
  } : null

  const metaAds = metaAdsRaw ? {
    spend:       metaAdsRaw.spend,
    impressions: metaAdsRaw.impressions,
    clicks:      metaAdsRaw.clicks,
    ctr:         metaAdsRaw.ctr,
    reach:       metaAdsRaw.reach,
    campaigns:   (metaAdsRaw.campaigns ?? []).slice(0, 5),
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
    sessions:    analyticsSnap.sessions    ?? 0,
    activeUsers: analyticsSnap.activeUsers ?? 0,
    newUsers:    analyticsSnap.newUsers    ?? 0,
    pageviews:   analyticsSnap.pageviews   ?? 0,
    bounceRate:  analyticsSnap.bounceRate  ?? 0,
    avgDuration: analyticsSnap.avgDuration ?? 0,
    conversions: analyticsSnap.conversions ?? 0,
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
    delta: analyticsPrev ? {
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
      postsCount:      instagramSnap.postsCount,
      topPosts,
      bestPost:        topPosts[0] ?? null,
      reach:           instagramSnap.reach,
      views:           instagramSnap.views,
      totalSaved:      instagramSnap.totalSaved,
      totalShares:     instagramSnap.totalShares,
      avgReach:        instagramSnap.avgReach,
      bestByReach:     bestPostByReach(topPosts),
      deltaFollowers:  instagramPrev ? pct(instagramSnap.followersCount, instagramPrev.followersCount) : null,
      deltaEngagement: instagramPrev ? pct(instagramSnap.engagementRate ?? 0, instagramPrev.engagementRate) : null,
      deltaReach:      instagramPrev?.reach != null && instagramSnap.reach != null ? pct(instagramSnap.reach, instagramPrev.reach) : null,
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
    } else {
      // Fallback 2: datos en vivo de la API
      const igIntegration = integrations.find(i => i.type === 'instagram')
      if (igIntegration && wants('instagram')) {
        try {
          const token      = await getValidMetaToken(igIntegration)
          const useFbGraph = igIntegration.scopes?.startsWith('fb_graph')
          const live       = await fetchInstagramMetrics(igIntegration.propertyId, token, null, useFbGraph)
          // Cacheamos las imágenes (las URLs del CDN vencen y el informe se persiste en dataCache).
          const liveTopPosts = await cacheImagesInArray(live.topPosts ?? [], 'imgSrc', workspaceId)
          instagram = {
            followersCount:  live.followersCount,
            engagementRate:  live.engagementRate,
            avgLikes:        live.avgLikes,
            avgComments:     live.avgComments,
            postsCount:      live.postsThisMonth,
            topPosts:        liveTopPosts,
            bestPost:        liveTopPosts[0] ?? null,
            reach:           live.reachThisMonth ?? null,
            views:           live.viewsThisMonth ?? null,
            totalSaved:      live.totalSaved     ?? null,
            totalShares:     live.totalShares    ?? null,
            avgReach:        live.avgReach        ?? null,
            bestByReach:     bestPostByReach(liveTopPosts),
            deltaFollowers:  null,
            deltaEngagement: null,
            deltaReach:      null,
            _fallbackMonth:  'live',
          }
        } catch (err) {
          console.warn('[MonthlyReport] Instagram live fallback fallido:', err.message)
        }
      }
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
      postsThisMonth:  tiktokSnap.postsThisMonth,
      likesCount:      tiktokSnap.likesCount,
      topVideos,
      bestVideo:       topVideos[0] ?? null,
      deltaFollowers:  tiktokPrev ? pct(tiktokSnap.followersCount, tiktokPrev.followersCount) : null,
      deltaEngagement: tiktokPrev ? pct(tiktokSnap.engagementRate ?? 0, tiktokPrev.engagementRate) : null,
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
    } else {
      // Fallback 2: datos en vivo de la API
      const tkIntegration = integrations.find(i => i.type === 'tiktok')
      if (tkIntegration && wants('tiktok')) {
        try {
          const token = await getValidTikTokToken(tkIntegration)
          const live  = await fetchTikTokMetrics(token, null)
          tiktok = {
            followersCount:  live.followersCount,
            engagementRate:  live.engagementRate,
            avgViews:        live.avgViews,
            avgLikes:        live.avgLikes,
            postsThisMonth:  live.postsThisMonth,
            likesCount:      live.likesCount,
            topVideos:       live.topVideos ?? [],
            bestVideo:       live.bestVideo ?? null,
            deltaFollowers:  null,
            deltaEngagement: null,
            _fallbackMonth:  'live',
          }
        } catch (err) {
          console.warn('[MonthlyReport] TikTok live fallback fallido:', err.message)
        }
      }
    }
  }

  // ── YouTube (con fallback a snapshot más reciente o datos en vivo) ────────────
  function parseYtTopVideos(json) {
    if (!json) return []
    try { const v = JSON.parse(json); return Array.isArray(v) ? v : [] }
    catch { return [] }
  }
  function buildYt(snap, prevSnap, fallbackMonth) {
    const topVideos = parseYtTopVideos(snap.topVideos)
    return {
      subscriberCount:  snap.subscriberCount,
      engagementRate:   snap.engagementRate,
      avgViews:         snap.avgViews,
      monthViews:       snap.monthViews,
      videosThisMonth:  snap.videosThisMonth,
      shortsThisMonth:  snap.shortsThisMonth,
      longsThisMonth:   snap.longsThisMonth,
      topVideos,
      bestVideo:        topVideos[0] ?? null,
      deltaSubscribers: prevSnap ? pct(snap.subscriberCount, prevSnap.subscriberCount) : null,
      deltaViews:       (prevSnap?.viewCountTotal != null && snap.viewCountTotal != null)
                          ? snap.viewCountTotal - prevSnap.viewCountTotal : null,
      ...(fallbackMonth ? { _fallbackMonth: fallbackMonth } : {}),
    }
  }

  let youtube = null
  if (youtubeSnap) {
    youtube = buildYt(youtubeSnap, youtubePrev)
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
    } else {
      // Fallback 2: datos en vivo de la API
      const ytIntegration = integrations.find(i => i.type === 'google_youtube')
      if (ytIntegration && wants('youtube')) {
        try {
          const token = await getValidAccessToken(ytIntegration)
          const live  = await fetchYouTubeMetrics(token, null, ytIntegration.propertyId || null)
          youtube = {
            subscriberCount:  live.subscriberCount,
            engagementRate:   live.engagementRate,
            avgViews:         live.avgViews,
            monthViews:       live.monthViews,
            videosThisMonth:  live.videosThisMonth,
            shortsThisMonth:  live.shortsThisMonth,
            longsThisMonth:   live.longsThisMonth,
            topVideos:        live.topVideos ?? [],
            bestVideo:        live.bestVideo ?? null,
            deltaSubscribers: null,
            deltaViews:       null,
            _fallbackMonth:   'live',
          }
        } catch (err) {
          console.warn('[MonthlyReport] YouTube live fallback fallido:', err.message)
        }
      }
    }
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
      impressions:     s.impressions,
      clicks:          s.clicks,
      ctr:             s.ctr,
      totalLikes:      s.totalLikes,
      totalComments:   s.totalComments,
      totalShares:     s.totalShares,
      postsThisMonth:  s.postsThisMonth,
      topPosts:        s.topPosts,
      demographics:    s.demographics,
      deltaFollowers:  linkedinPrev ? pct(s.followersCount, linkedinPrev.followersCount) : null,
      deltaEngagement: linkedinPrev ? pct(s.engagementRate ?? 0, linkedinPrev.engagementRate) : null,
      deltaImpressions: linkedinPrev ? pct(s.impressions ?? 0, linkedinPrev.impressions) : null,
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
    } else {
      // Fallback 2: datos en vivo
      const liIntegration = integrations.find(i => i.type === 'linkedin' && i.propertyId)
      if (liIntegration && wants('linkedin')) {
        try {
          const token = await getValidLinkedinToken(liIntegration)
          const live  = await fetchLinkedinMetrics(liIntegration.propertyId, token, null)
          linkedin = {
            followersCount:  live.followersCount,
            engagementRate:  live.engagementRate,
            impressions:     live.impressions,
            clicks:          live.clicks,
            ctr:             live.ctr,
            totalLikes:      live.totalLikes,
            totalComments:   live.totalComments,
            totalShares:     live.totalShares,
            postsThisMonth:  live.postsThisMonth,
            topPosts:        live.topPosts,
            demographics:    live.demographics,
            deltaFollowers:  null,
            deltaEngagement: null,
            deltaImpressions: null,
            _fallbackMonth:  'live',
          }
        } catch (err) {
          console.warn('[MonthlyReport] LinkedIn live fallback fallido:', err.message)
        }
      }
    }
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
      totalLikes:      s.totalLikes,
      totalComments:   s.totalComments,
      totalShares:     s.totalShares,
      postsThisMonth:  s.postsThisMonth,
      topPosts:        s.topPosts,
      deltaFollowers:  facebookPrev ? pct(s.followersCount, facebookPrev.followersCount) : null,
      deltaEngagement: facebookPrev ? pct(s.engagementRate ?? 0, facebookPrev.engagementRate) : null,
      deltaReach:      facebookPrev ? pct(s.reach ?? 0, facebookPrev.reach) : null,
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
    } else {
      // Fallback 2: datos en vivo (solo integración oficial/token, no scrape)
      const fbIntegration = integrations.find(i => i.type === 'facebook' && i.propertyId && i.scopes !== 'scrape')
      if (fbIntegration && wants('facebook')) {
        try {
          const token = getValidFacebookToken(fbIntegration)
          const live  = await fetchFacebookMetrics(fbIntegration.propertyId, token, null)
          facebook = {
            followersCount:  live.followersCount,
            fanCount:        live.fanCount,
            engagementRate:  live.engagementRate,
            reach:           live.reach,
            impressions:     live.impressions,
            totalLikes:      live.totalLikes,
            totalComments:   live.totalComments,
            totalShares:     live.totalShares,
            postsThisMonth:  live.postsThisMonth,
            topPosts:        live.topPosts,
            deltaFollowers:  null,
            deltaEngagement: null,
            deltaReach:      null,
            _fallbackMonth:  'live',
          }
        } catch (err) {
          console.warn('[MonthlyReport] Facebook live fallback fallido:', err.message)
        }
      }
    }
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
    clicks:      seoSnap.clicks      ?? 0,
    impressions: seoSnap.impressions ?? 0,
    ctr:         seoSnap.ctr         ?? 0,
    avgPosition: seoSnap.avgPosition  != null ? parseFloat(Number(seoSnap.avgPosition).toFixed(1)) : null,
    topQueries: (() => {
      try { return (JSON.parse(seoSnap.topQueries || '[]')).slice(0, 10) } catch { return [] }
    })(),
    topPages: (() => {
      try { return (JSON.parse(seoSnap.topPages || '[]')).slice(0, 5) } catch { return [] }
    })(),
    delta: seoPrev ? {
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
  const analysis = validCachedAnalysis
    ? validCachedAnalysis
    : await generateAnalysis({ project, month: dataMonth,
        geo: sections.geo, analytics: sections.analytics, instagram: sections.instagram,
        tiktok: sections.tiktok, youtube: sections.youtube, linkedin: sections.linkedin, facebook: sections.facebook, keywords: sections.keywords,
        seo: sections.seo, performance: sections.performance, googleAds: sections.googleAds,
        metaAds: sections.metaAds, competitors: sections.competitors,
        workspaceId, objectives: objectivesResults, services })

  return {
    project: {
      id:         projectId,
      name:       project?.name ?? '',
      websiteUrl: project?.websiteUrl,
      services,
    },
    month,        // mes del informe (ej: "2026-05") — para identificación/navegación
    dataMonth,    // período de los datos (ej: "2026-04") — para mostrar al usuario
    connectedTypes: [...connectedTypes],
    sections,
    objectives: objectivesResults,
    analysis,
    analysisError:  analysis?._error ?? null,
    _analysisIsNew:  !validCachedAnalysis && !!analysis?.resumen,
    // No cachear si estamos usando datos en vivo (cambian a diario)
    _dataCacheIsNew: instagram?._fallbackMonth !== 'live' && tiktok?._fallbackMonth !== 'live' && youtube?._fallbackMonth !== 'live' && linkedin?._fallbackMonth !== 'live' && facebook?._fallbackMonth !== 'live',
  }
}

// ─── Análisis IA ──────────────────────────────────────────────────────────────

async function generateAnalysis({ project, month, geo, analytics, instagram, tiktok, youtube, linkedin, facebook, keywords, seo, performance, googleAds, metaAds, competitors, workspaceId, objectives = [], services = [] }) {
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

  const prompt = `Sos un analista de marketing digital experto en comunicación con clientes.
Redactá un análisis mensual en español para el informe del proyecto "${project?.name}" correspondiente al período ${month}.
${serviciosBloque}
DATOS DEL MES:
${dataCtx}
${objetivosBloque}
INSTRUCCIONES DE TONO (MUY IMPORTANTE):
- El informe tiene sesgo POSITIVO: destacá primero los logros y avances
- Si hay objetivos definidos, mencioná explícitamente si se cumplieron o no, con el porcentaje de avance
- Si hay métricas negativas o por debajo del objetivo, mencionálas brevemente y siempre con una propuesta de mejora concreta
- Estilo motivador, profesional y constructivo — como un partner estratégico, no como un auditor
- Si no hay datos de una área, omitila — no menciones ausencias a menos que sea relevante
- Usá números concretos en el resumen y en los highlights

Respondé SOLO con un JSON con esta estructura exacta:
{
  "resumen": "2-3 párrafos: primero los logros del mes (con números), luego oportunidades de mejora con propuestas concretas",
  "highlights": ["logro 1 concreto con número", "logro 2 concreto con número", "logro 3 concreto con número"],
  "alertas": ["solo si hay algo importante que mejorar, máximo 2, siempre con propuesta de solución concreta"],
  "nextSteps": ["acción concreta 1", "acción concreta 2", "acción concreta 3"]
}`

  const tag = `Proyecto "${project?.name}" (${month})`

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error(`[MonthlyReport] ${tag}: ANTHROPIC_API_KEY no configurada — no se puede generar el análisis IA`)
    return emptyAnalysis('Falta configurar la IA en el servidor (ANTHROPIC_API_KEY). Avisá al equipo técnico.')
  }

  try {
    const message = await anthropic.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 1500,
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
    prisma.project.findUnique({ where: { id: projectId }, select: { websiteUrl: true } }),
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
  return {
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
}

module.exports = { aggregateReportData, getAvailableSections }
