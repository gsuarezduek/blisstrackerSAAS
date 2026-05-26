const prisma    = require('../lib/prisma')
const Anthropic = require('@anthropic-ai/sdk')
const { logTokens } = require('../lib/logTokens')
const { fetchGoogleAdsData }             = require('./googleAds.service')
const { fetchMetaAdsData, getValidFbToken } = require('./metaAds.service')
const { getValidMetaToken }              = require('./metaTokenRefresh.service')
const { fetchInstagramMetrics }          = require('./instagram.service')
const { getValidTikTokToken }            = require('./tiktokTokenRefresh.service')
const { fetchTikTokMetrics }             = require('./tiktok.service')
const { getValidLinkedinToken }          = require('./linkedinTokenRefresh.service')
const { fetchLinkedinMetrics }           = require('./linkedin.service')

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ─── Helpers ──────────────────────────────────────────────────────────────────

function monthBounds(month) {
  const [y, m] = month.split('-').map(Number)
  const pad     = n => String(n).padStart(2, '0')
  const lastDay = new Date(y, m, 0).getDate()
  return { startDate: `${y}-${pad(m)}-01`, endDate: `${y}-${pad(m)}-${pad(lastDay)}` }
}

function prevMonthStr(month) {
  const [y, m] = month.split('-').map(Number)
  const pm = m === 1 ? 12 : m - 1
  const py = m === 1 ? y - 1 : y
  return `${py}-${String(pm).padStart(2, '0')}`
}

function prevMonthsArr(month, count) {
  const months = []
  let cur = month
  for (let i = 0; i < count; i++) {
    months.unshift(cur)
    cur = prevMonthStr(cur)
  }
  return months
}

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
async function aggregateReportData(projectId, workspaceId, month, cachedAnalysis = null, objectives = {}, cachedData = null) {
  // El informe del mes X muestra datos del mes X-1.
  // Ej: "Informe de Mayo 2026" → período de datos: Abril 2026.
  const dataMonth = prevMonthStr(month)

  // Ignorar análisis cacheado sin resumen válido (ej: guardado vacío tras un error de Claude)
  const validCachedAnalysis = cachedAnalysis?.resumen ? cachedAnalysis : null

  // Caché completo disponible: retornar sin queries ni llamadas a APIs externas
  if (cachedData && validCachedAnalysis) {
    return {
      project:        cachedData.project,
      month,
      dataMonth:      cachedData.dataMonth,
      connectedTypes: cachedData.connectedTypes,
      sections:       cachedData.sections,
      analysis:       validCachedAnalysis,
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
    linkedinSnap,
    linkedinPrev,
    pageSpeedMobile,
    pageSpeedDesktop,
    allKeywords,
    completedTasks,
    integrations,
    cannibalSnap,
    seoSnap,
    seoPrev,
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
                 avgComments: true, postsCount: true, mediaCount: true, topPosts: true },
    }),
    prisma.instagramSnapshot.findFirst({
      where:   { projectId, workspaceId, month: prev },
      select:  { followersCount: true, engagementRate: true },
    }),

    // TikTok snapshots
    prisma.tikTokSnapshot.findFirst({
      where:   { projectId, workspaceId, month: dataMonth },
      select:  { followersCount: true, engagementRate: true, avgViews: true,
                 avgLikes: true, postsThisMonth: true, likesCount: true },
    }),
    prisma.tikTokSnapshot.findFirst({
      where:   { projectId, workspaceId, month: prev },
      select:  { followersCount: true, engagementRate: true },
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

    // Canibalización — reporte completado más reciente
    prisma.cannibalReport.findFirst({
      where:   { projectId, workspaceId, status: 'completed' },
      orderBy: { createdAt: 'desc' },
      select:  { totalConflicts: true, criticalCount: true, warningCount: true,
                 lowCount: true, trafficAtRisk: true, dateRange: true, createdAt: true },
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
  ])

  // ── Integrations map ─────────────────────────────────────────────────────────
  const connectedTypes = new Set(integrations.map(i => i.type))

  // ── Google Ads + Meta Ads (fetch async con rango de fechas exacto) ────────────
  const { startDate, endDate } = monthBounds(dataMonth)
  const dateRange = { startDate, endDate }

  const gadsIntegration = integrations.find(i => i.type === 'google_ads')
  const metaIntegration = integrations.find(i => i.type === 'meta_ads')

  const [googleAdsRaw, metaAdsRaw] = await Promise.all([
    gadsIntegration && gadsIntegration.customerId && process.env.GOOGLE_ADS_DEVELOPER_TOKEN
      ? fetchGoogleAdsData(gadsIntegration, 'this_month', dateRange).catch(err => {
          console.warn('[MonthlyReport] Google Ads fetch fallido (ignorado):', err.message)
          return null
        })
      : Promise.resolve(null),
    metaIntegration && metaIntegration.propertyId
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

  // ── Canibalización ───────────────────────────────────────────────────────────
  const cannibalization = cannibalSnap ? {
    totalConflicts: cannibalSnap.totalConflicts ?? 0,
    criticalCount:  cannibalSnap.criticalCount  ?? 0,
    warningCount:   cannibalSnap.warningCount   ?? 0,
    lowCount:       cannibalSnap.lowCount       ?? 0,
    trafficAtRisk:  cannibalSnap.trafficAtRisk  ?? 0,
    dateRange:      cannibalSnap.dateRange,
    date:           cannibalSnap.createdAt,
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

  let instagram = null
  if (instagramSnap) {
    const topPosts = parseIgTopPosts(instagramSnap.topPosts)
    instagram = {
      followersCount:  instagramSnap.followersCount,
      engagementRate:  instagramSnap.engagementRate,
      avgLikes:        instagramSnap.avgLikes,
      avgComments:     instagramSnap.avgComments,
      postsCount:      instagramSnap.postsCount,
      topPosts,
      bestPost:        topPosts[0] ?? null,
      deltaFollowers:  instagramPrev ? pct(instagramSnap.followersCount, instagramPrev.followersCount) : null,
      deltaEngagement: instagramPrev ? pct(instagramSnap.engagementRate ?? 0, instagramPrev.engagementRate) : null,
    }
  } else {
    // Fallback 1: snapshot más reciente disponible (cualquier mes)
    const recentIg = await prisma.instagramSnapshot.findFirst({
      where:   { projectId, workspaceId },
      orderBy: { month: 'desc' },
      select:  { followersCount: true, engagementRate: true, avgLikes: true,
                 avgComments: true, postsCount: true, mediaCount: true, topPosts: true, month: true },
    })
    if (recentIg) {
      const prevIg = await prisma.instagramSnapshot.findFirst({
        where:  { projectId, workspaceId, month: prevMonthStr(recentIg.month) },
        select: { followersCount: true, engagementRate: true },
      })
      const topPosts = parseIgTopPosts(recentIg.topPosts)
      instagram = {
        followersCount:  recentIg.followersCount,
        engagementRate:  recentIg.engagementRate,
        avgLikes:        recentIg.avgLikes,
        avgComments:     recentIg.avgComments,
        postsCount:      recentIg.postsCount,
        topPosts,
        bestPost:        topPosts[0] ?? null,
        deltaFollowers:  prevIg ? pct(recentIg.followersCount, prevIg.followersCount) : null,
        deltaEngagement: prevIg ? pct(recentIg.engagementRate ?? 0, prevIg.engagementRate) : null,
        _fallbackMonth:  recentIg.month,
      }
    } else {
      // Fallback 2: datos en vivo de la API
      const igIntegration = integrations.find(i => i.type === 'instagram')
      if (igIntegration) {
        try {
          const token      = await getValidMetaToken(igIntegration)
          const useFbGraph = igIntegration.scopes?.startsWith('fb_graph')
          const live       = await fetchInstagramMetrics(igIntegration.propertyId, token, null, useFbGraph)
          instagram = {
            followersCount:  live.followersCount,
            engagementRate:  live.engagementRate,
            avgLikes:        live.avgLikes,
            avgComments:     live.avgComments,
            postsCount:      live.postsThisMonth,
            topPosts:        live.topPosts ?? [],
            bestPost:        live.bestPost ?? null,
            deltaFollowers:  null,
            deltaEngagement: null,
            _fallbackMonth:  'live',
          }
        } catch (err) {
          console.warn('[MonthlyReport] Instagram live fallback fallido:', err.message)
        }
      }
    }
  }

  // ── TikTok (con fallback a snapshot más reciente o datos en vivo) ─────────────
  let tiktok = null
  if (tiktokSnap) {
    tiktok = {
      followersCount:  tiktokSnap.followersCount,
      engagementRate:  tiktokSnap.engagementRate,
      avgViews:        tiktokSnap.avgViews,
      avgLikes:        tiktokSnap.avgLikes,
      postsThisMonth:  tiktokSnap.postsThisMonth,
      likesCount:      tiktokSnap.likesCount,
      deltaFollowers:  tiktokPrev ? pct(tiktokSnap.followersCount, tiktokPrev.followersCount) : null,
      deltaEngagement: tiktokPrev ? pct(tiktokSnap.engagementRate ?? 0, tiktokPrev.engagementRate) : null,
    }
  } else {
    // Fallback 1: snapshot más reciente disponible (cualquier mes)
    const recentTk = await prisma.tikTokSnapshot.findFirst({
      where:   { projectId, workspaceId },
      orderBy: { month: 'desc' },
      select:  { followersCount: true, engagementRate: true, avgViews: true,
                 avgLikes: true, postsThisMonth: true, likesCount: true, month: true },
    })
    if (recentTk) {
      const prevTk = await prisma.tikTokSnapshot.findFirst({
        where:  { projectId, workspaceId, month: prevMonthStr(recentTk.month) },
        select: { followersCount: true, engagementRate: true },
      })
      tiktok = {
        followersCount:  recentTk.followersCount,
        engagementRate:  recentTk.engagementRate,
        avgViews:        recentTk.avgViews,
        avgLikes:        recentTk.avgLikes,
        postsThisMonth:  recentTk.postsThisMonth,
        likesCount:      recentTk.likesCount,
        deltaFollowers:  prevTk ? pct(recentTk.followersCount, prevTk.followersCount) : null,
        deltaEngagement: prevTk ? pct(recentTk.engagementRate ?? 0, prevTk.engagementRate) : null,
        _fallbackMonth:  recentTk.month,
      }
    } else {
      // Fallback 2: datos en vivo de la API
      const tkIntegration = integrations.find(i => i.type === 'tiktok')
      if (tkIntegration) {
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
      if (liIntegration) {
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

  // ── Análisis IA ──────────────────────────────────────────────────────────────
  // Si ya existe un análisis cacheado con resumen válido, no se regenera
  const analysis = validCachedAnalysis
    ? validCachedAnalysis
    : await generateAnalysis({ project, month: dataMonth, geo, analytics, instagram, tiktok, linkedin, keywords, seo, performance, googleAds, metaAds, workspaceId, objectives, services })

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
    sections: { geo, analytics, evolution, instagram, tiktok, linkedin, seo, keywords, googleAds, metaAds, cannibalization, performance, tasks },
    analysis,
    _analysisIsNew:  !validCachedAnalysis && !!analysis?.resumen,
    // No cachear si estamos usando datos en vivo (cambian a diario)
    _dataCacheIsNew: instagram?._fallbackMonth !== 'live' && tiktok?._fallbackMonth !== 'live' && linkedin?._fallbackMonth !== 'live',
  }
}

// ─── Análisis IA ──────────────────────────────────────────────────────────────

async function generateAnalysis({ project, month, geo, analytics, instagram, tiktok, linkedin, keywords, seo, performance, googleAds, metaAds, workspaceId, objectives = {}, services = [] }) {
  // Calcular cumplimiento de objetivos si existen
  const objCtx = []
  if (objectives.sessions != null && analytics)
    objCtx.push({ metrica: 'Sesiones', objetivo: objectives.sessions, real: analytics.sessions, pct: Math.round((analytics.sessions / objectives.sessions) * 100) })
  if (objectives.newUsers != null && analytics)
    objCtx.push({ metrica: 'Usuarios nuevos', objetivo: objectives.newUsers, real: analytics.newUsers, pct: Math.round((analytics.newUsers / objectives.newUsers) * 100) })
  if (objectives.conversions != null && analytics)
    objCtx.push({ metrica: 'Conversiones', objetivo: objectives.conversions, real: analytics.conversions, pct: Math.round((analytics.conversions / objectives.conversions) * 100) })
  if (objectives.followersIg != null && instagram)
    objCtx.push({ metrica: 'Seguidores Instagram', objetivo: objectives.followersIg, real: instagram.followersCount, pct: Math.round((instagram.followersCount / objectives.followersIg) * 100) })
  if (objectives.followersTk != null && tiktok)
    objCtx.push({ metrica: 'Seguidores TikTok', objetivo: objectives.followersTk, real: tiktok.followersCount, pct: Math.round((tiktok.followersCount / objectives.followersTk) * 100) })
  if (objectives.followersLi != null && linkedin)
    objCtx.push({ metrica: 'Seguidores LinkedIn', objetivo: objectives.followersLi, real: linkedin.followersCount, pct: Math.round((linkedin.followersCount / objectives.followersLi) * 100) })

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
    tiktok: tiktok ? {
      seguidores:      tiktok.followersCount,
      deltaSeguidores: tiktok.deltaFollowers,
      engagement:      tiktok.engagementRate != null ? `${tiktok.engagementRate.toFixed(2)}%` : null,
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
    ? `\nCUMPLIMIENTO DE OBJETIVOS DEL MES (mencioná explícitamente qué se cumplió y qué no):\n${objCtx.map(o => `- ${o.metrica}: objetivo ${o.objetivo}, real ${o.real} (${o.pct}% de cumplimiento)`).join('\n')}\n`
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

  try {
    const message = await anthropic.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 800,
      messages:   [{ role: 'user', content: prompt }],
    })

    logTokens('monthly_report', null, message.usage, workspaceId ?? null)
      .catch(err => console.error('[MonthlyReport] Error al registrar tokens de IA:', err.message))

    const raw       = message.content[0].text.trim()
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (jsonMatch) return JSON.parse(jsonMatch[0])
  } catch (err) {
    console.error('[MonthlyReport] Error generando análisis IA:', err.message)
  }

  return {
    resumen:    '',
    highlights: [],
    alertas:    [],
    nextSteps:  [],
  }
}

module.exports = { aggregateReportData }
