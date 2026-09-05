const prisma = require('../../lib/prisma')
const { computeObjectives } = require('../marketingObjectives.service')
const { prevMonthStr, prevMonthsArr, monthsInRange } = require('../../lib/monthUtils')
const { resolveReportPeriod, buildPeriodMeta } = require('./_shared')
const { buildInstagramSection, buildCompetitorComparison } = require('./sectionBuilders/instagram')
const { buildTikTokSection } = require('./sectionBuilders/tiktok')
const { buildYouTubeSection } = require('./sectionBuilders/youtube')
const { buildLinkedinSection } = require('./sectionBuilders/linkedin')
const { buildFacebookSection } = require('./sectionBuilders/facebook')
const { buildAdsSections } = require('./sectionBuilders/ads')
const {
  buildGeoSection, buildAnalyticsSection, buildEvolutionSection,
  buildPerformanceSection, buildSeoSection, buildKeywordsSection,
} = require('./sectionBuilders/webAndSeo')
const { generateAnalysis } = require('./analysis')

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
  const { googleAds, metaAds } = await buildAdsSections({ wants, warn, integrations, dateRange, workspaceId })

  // ── GEO ──────────────────────────────────────────────────────────────────────
  const geo = buildGeoSection(geoAudit, geoAuditHistory)

  // ── Analytics GA4 ────────────────────────────────────────────────────────────
  const analytics = buildAnalyticsSection(analyticsSnap, analyticsPrev, flow)

  // ── Evolution (últimos 3 meses GA4) ─────────────────────────────────────────
  const evolution = buildEvolutionSection(analyticsEvolution)

  // ── Instagram (con fallback a snapshot más reciente) ──────────────────────────
  const instagram = await buildInstagramSection({ projectId, workspaceId, instagramSnap, instagramPrev, flow, dataMonth })

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

  // ── TikTok (con fallback a snapshot más reciente) ─────────────────────────────
  const tiktok = await buildTikTokSection({ projectId, workspaceId, tiktokSnap, tiktokPrev, flow })

  // ── YouTube (con fallback a snapshot más reciente) ────────────────────────────
  const youtube = await buildYouTubeSection({ projectId, workspaceId, youtubeSnap, youtubePrev, flow })

  // ── LinkedIn (con fallback a snapshot más reciente) ──────────────────────────
  const linkedin = await buildLinkedinSection({ projectId, workspaceId, linkedinSnap, linkedinPrev, flow })

  // ── Facebook (con fallback a snapshot más reciente) ──────────────────────────
  const facebook = await buildFacebookSection({ projectId, workspaceId, facebookSnap, facebookPrev, flow })

  // ── PageSpeed ─────────────────────────────────────────────────────────────────
  const performance = buildPerformanceSection(pageSpeedMobile, pageSpeedDesktop)

  // ── Search Console (SEO) ────────────────────────────────────────────────────
  const seo = buildSeoSection(seoSnap, seoPrev, flow)

  // ── Keywords ──────────────────────────────────────────────────────────────────
  const keywords = buildKeywordsSection(allKeywords, dataMonth, prev)

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

module.exports = { aggregateReportData }
