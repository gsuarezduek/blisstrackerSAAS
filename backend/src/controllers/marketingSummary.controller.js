/**
 * marketingSummary.controller.js
 * Endpoints de vista global cross-proyecto (sin proyecto seleccionado).
 * Devuelven el snapshot más reciente de cada proyecto para el workspace.
 */

const prisma = require('../lib/prisma')
const { computeObjectives } = require('../services/marketingObjectives.service')
const { saveMonthSnapshot } = require('../services/analyticsSnapshot.service')
const { refreshScrapeForIntegration: refreshInstagramScrape } = require('./instagram.controller')
const { refreshScrapeForIntegration: refreshLinkedinScrape }  = require('./linkedin.controller')
const { refreshScrapeForIntegration: refreshFacebookScrape }  = require('./facebook.controller')
const { getValidFbToken, fetchMetaAdsData } = require('../services/metaAds.service')
const { fetchGoogleAdsData }                = require('../services/googleAds.service')
const { todayString } = require('../utils/dates')
const { tzOffsetStr } = require('../lib/timeMetrics')
const { monthBounds, monthLabel, prevMonthStr, rangeLabel, monthsInRange } = require('../lib/monthUtils')

// Rango de fechas real del período de datos del informe (espejo de monthlyReport.controller).
function reportPeriodDates(report) {
  if (report.periodStart && report.periodEnd) {
    return {
      start: new Date(report.periodStart).toISOString().slice(0, 10),
      end:   new Date(report.periodEnd).toISOString().slice(0, 10),
    }
  }
  const { startDate, endDate } = monthBounds(prevMonthStr(report.month))
  return { start: startDate, end: endDate }
}

/** Etiqueta del informe por su período de datos. */
function reportLabel(report) {
  const { start, end } = reportPeriodDates(report)
  return rangeLabel(start, end)
}

// Mes ancla del informe (el más reciente cubierto por el período) — mismo criterio
// que usa aggregateReportData para computar objetivos.
function reportDataMonth(report) {
  const { start, end } = reportPeriodDates(report)
  const months = monthsInRange(start, end)
  return months[months.length - 1]
}

// Filtro Prisma para informes "generados" (no placeholders vacíos), espejo del
// de monthlyReport.controller.js.
const GENERATED_REPORT_WHERE = {
  OR: [
    { enabledSections: { not: null } },
    { dataCache:       { not: null } },
    { analysis:        { not: null } },
  ],
}

function safeParseArr(v) {
  try { return JSON.parse(v) } catch { return [] }
}

function prevMonthStartOf(monthStart) {
  const [y, m] = monthStart.split('-').map(Number)
  const py = m === 1 ? y - 1 : y
  const pm = m === 1 ? 12 : m - 1
  return `${py}-${String(pm).padStart(2, '0')}-01`
}

// Seguidores nuevos en lo que va del mes + fecha del último dato, por proyecto.
// Usa los follower logs diarios cacheados (no re-scrapea).
// El baseline (`first`) es el cierre del mes anterior (último log del mes previo), un valor
// congelado — NO el primer log del mes en curso, que si es el de hoy se pisa en cada visita
// y colapsa "nuevos" a 0. Fallback: primer log del mes si no hay dato del mes anterior.
// followerLogModel: prisma.instagramFollowerLog | prisma.tikTokFollowerLog | prisma.youTubeFollowerLog
async function newFollowersByProject(followerLogModel, workspaceId, monthStart) {
  const prevMonthStart = prevMonthStartOf(monthStart)
  const [inMonth, prevLogs] = await Promise.all([
    followerLogModel.findMany({
      where:   { workspaceId, date: { gte: monthStart } },
      orderBy: { date: 'asc' },
      select:  { projectId: true, date: true, followersCount: true },
    }),
    followerLogModel.findMany({
      where:   { workspaceId, date: { gte: prevMonthStart, lt: monthStart } },
      orderBy: { date: 'asc' },   // asc → el último sobrescribe = cierre del mes anterior
      select:  { projectId: true, followersCount: true },
    }),
  ])
  const prevClose = new Map()
  for (const l of prevLogs) prevClose.set(l.projectId, l.followersCount)

  const byProj = new Map()
  for (const l of inMonth) {
    const e = byProj.get(l.projectId)
    if (!e) byProj.set(l.projectId, { first: l.followersCount, last: l.followersCount, lastDate: l.date })
    else    { e.last = l.followersCount; e.lastDate = l.date }   // logs asc → último sobrescribe
  }
  // Anclar el baseline al cierre del mes anterior cuando exista.
  for (const [pid, e] of byProj) {
    const prev = prevClose.get(pid)
    if (prev != null) e.first = prev
  }
  return byProj
}

// Progreso de los objetivos rrss (seguidores / interacción) de una red, por proyecto.
// Solo computa los proyectos que tienen un objetivo de esa red (para no recalcular de más).
async function rrssObjectivesByProject(workspaceId, network, month, projectIds) {
  if (projectIds.length === 0) return new Map()
  const objs = await prisma.marketingObjective.findMany({
    where:  { workspaceId, platform: network, metric: { in: ['seguidores', 'interaccion'] }, projectId: { in: projectIds } },
    select: { projectId: true },
  })
  const projWithObj = [...new Set(objs.map(o => o.projectId))]
  const byProj = new Map()
  await Promise.all(projWithObj.map(async (pid) => {
    const results = await computeObjectives({ projectId: pid, workspaceId, dataMonth: month })
    const pick = (metric) => {
      const r = results.find(x => x.metric === metric && x.detail?.platform === network)
      return r ? { target: r.target, actual: r.actual, pct: r.pct, periodLabel: r.periodLabel } : null
    }
    byProj.set(pid, { seguidores: pick('seguidores'), interaccion: pick('interaccion') })
  }))
  return byProj
}

/**
 * GET /api/marketing/summary/analytics
 * Snapshot de Analytics más reciente por proyecto, ordenado por sesiones desc.
 */
async function getAnalyticsSummary(req, res, next) {
  try {
    const workspaceId = req.workspace.id

    // Para cada proyecto, tomar el snapshot más reciente
    const snapshots = await prisma.analyticsSnapshot.findMany({
      where: { workspaceId },
      orderBy: { month: 'desc' },
      include: { project: { select: { id: true, name: true } } },
    })

    // Estado de la integración GA4 por proyecto: 'active' | 'expired' | 'missing'.
    // Permite pintar en rojo los proyectos cuya integración se desconectó (no refrescable).
    const integrations = await prisma.projectIntegration.findMany({
      where:  { workspaceId, type: 'google_analytics' },
      select: { projectId: true, status: true, propertyId: true, project: { select: { id: true, name: true } } },
    })
    const integrationStatusOf = (projectId) => {
      const ig = integrations.find(i => i.projectId === projectId)
      if (!ig) return 'missing'
      return (ig.status === 'active' && ig.propertyId) ? 'active' : 'expired'
    }

    // Deduplicate: un registro por proyecto (el más reciente, que viene primero por orderBy)
    const seen = new Set()
    const result = []
    for (const s of snapshots) {
      if (seen.has(s.projectId)) continue
      seen.add(s.projectId)
      result.push({
        projectId:         s.projectId,
        projectName:       s.project.name,
        month:             s.month,
        updatedAt:         s.updatedAt,
        sessions:          s.sessions,
        activeUsers:       s.activeUsers,
        newUsers:          s.newUsers,
        pageviews:         s.pageviews,
        bounceRate:        s.bounceRate,
        avgDuration:       s.avgDuration,
        conversions:       s.conversions,
        hasData:           true,
        integrationStatus: integrationStatusOf(s.projectId),
      })
    }

    // Proyectos con GA4 configurado pero todavía sin ningún snapshot: aparecen sin datos
    // (y en rojo si están desconectados) para que la alerta de "no refrescable" sea completa.
    for (const ig of integrations) {
      if (seen.has(ig.projectId)) continue
      seen.add(ig.projectId)
      result.push({
        projectId:         ig.projectId,
        projectName:       ig.project.name,
        month:             null,
        updatedAt:         null,
        sessions:          0,
        activeUsers:       0,
        newUsers:          0,
        pageviews:         0,
        bounceRate:        0,
        avgDuration:       0,
        conversions:       0,
        hasData:           false,
        integrationStatus: integrationStatusOf(ig.projectId),
      })
    }

    result.sort((a, b) => b.sessions - a.sessions)
    res.json(result)
  } catch (err) {
    next(err)
  }
}

/**
 * POST /api/marketing/summary/analytics/refresh
 * Refresca el snapshot del mes en curso de todos los proyectos con GA4 activo.
 * No consume tokens de IA (solo pega a la API de GA4). Secuencial para no saturar la cuota.
 * Devuelve por proyecto: { projectId, projectName, status: 'ok'|'disconnected'|'error', error? }.
 */
async function refreshAnalyticsSummary(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const month = todayString(req.workspace.timezone).slice(0, 7) // "YYYY-MM" del mes en curso

    const integrations = await prisma.projectIntegration.findMany({
      where:  { workspaceId, type: 'google_analytics' },
      select: { projectId: true, status: true, propertyId: true, project: { select: { name: true } } },
    })

    const results = []
    for (const ig of integrations) {
      const base = { projectId: ig.projectId, projectName: ig.project.name }
      if (ig.status !== 'active' || !ig.propertyId) {
        results.push({ ...base, status: 'disconnected' })
        continue
      }
      try {
        const snap = await saveMonthSnapshot(ig.projectId, workspaceId, month)
        results.push({ ...base, status: snap ? 'ok' : 'disconnected' })
      } catch (err) {
        console.error(`[AnalyticsSummary] refresh proyecto ${ig.projectId}:`, err.message)
        results.push({ ...base, status: 'error', error: err.message })
      }
    }

    res.json({
      month,
      refreshed: results.filter(r => r.status === 'ok').length,
      total:     results.length,
      results,
    })
  } catch (err) {
    next(err)
  }
}

// Plataformas de RRSS conectables por scraping — cada una expone su propio
// refreshScrapeForIntegration (mismo shape: cooldown 30min, ver *.controller.js).
const RRSS_SCRAPE_PLATFORMS = {
  instagram: refreshInstagramScrape,
  linkedin:  refreshLinkedinScrape,
  facebook:  refreshFacebookScrape,
}

/**
 * POST /api/marketing/summary/rrss/:platform/refresh
 * Refresca (scrape fresco) todos los proyectos del workspace conectados por
 * scraping para la plataforma dada. Respeta el cooldown de 30min de cada
 * integración (las que están en cooldown se reportan como tal, no se fuerzan) —
 * cada scrape es una llamada paga a Apify. Secuencial para no disparar todo junto.
 * Devuelve { refreshed, total, results: [{ projectId, projectName, status: 'ok'|'cooldown'|'error', waitMins?, error? }] }
 */
async function refreshRrssSummary(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const platform = req.params.platform
    const refresh = RRSS_SCRAPE_PLATFORMS[platform]
    if (!refresh) {
      return res.status(400).json({ error: 'Plataforma inválida. Usá instagram, linkedin o facebook.' })
    }

    const integrations = await prisma.projectIntegration.findMany({
      where:  { workspaceId, type: platform, scopes: 'scrape' },
      select: { id: true, projectId: true, propertyId: true, project: { select: { name: true } } },
    })

    const results = []
    for (const ig of integrations) {
      const base = { projectId: ig.projectId, projectName: ig.project.name }
      try {
        const r = await refresh(ig, ig.projectId, workspaceId)
        if (r.status === 'ok')            results.push({ ...base, status: 'ok' })
        else if (r.status === 'cooldown') results.push({ ...base, status: 'cooldown', waitMins: r.waitMins })
        else                              results.push({ ...base, status: 'error', error: r.message })
      } catch (err) {
        console.error(`[RRSSSummary] refresh ${platform} proyecto ${ig.projectId}:`, err.message)
        results.push({ ...base, status: 'error', error: err.message })
      }
    }

    res.json({
      refreshed: results.filter(r => r.status === 'ok').length,
      total:     results.length,
      results,
    })
  } catch (err) {
    next(err)
  }
}

/**
 * GET /api/marketing/summary/performance
 * Resultado de PageSpeed más reciente por proyecto para una estrategia dada, ordenado por score desc.
 * ?strategy=mobile|desktop (default: mobile)
 */
async function getPerformanceSummary(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const strategy = req.query.strategy === 'desktop' ? 'desktop' : 'mobile'

    const results = await prisma.pageSpeedResult.findMany({
      where:   { workspaceId, status: 'done', strategy },
      orderBy: [
        { createdAt: 'desc' },
      ],
      include: { project: { select: { id: true, name: true } } },
    })

    // Un registro por proyecto: el más reciente de la estrategia pedida
    const byProject = new Map()
    for (const r of results) {
      if (!byProject.has(r.projectId)) {
        byProject.set(r.projectId, r)
      }
    }

    const result = Array.from(byProject.values()).map(r => {
      let metrics = {}
      try { metrics = JSON.parse(r.metrics) } catch {}
      return {
        projectId:        r.projectId,
        projectName:      r.project.name,
        strategy:         r.strategy,
        performanceScore: r.performanceScore ?? 0,
        lcp:              metrics.lcp?.displayValue ?? null,
        cls:              metrics.cls?.displayValue ?? null,
        fcp:              metrics.fcp?.displayValue ?? null,
        createdAt:        r.createdAt,
      }
    })

    result.sort((a, b) => b.performanceScore - a.performanceScore)
    res.json(result)
  } catch (err) {
    next(err)
  }
}

/**
 * GET /api/marketing/summary/instagram
 * Snapshot de Instagram más reciente por proyecto, ordenado por followersCount desc.
 */
async function getInstagramSummary(req, res, next) {
  try {
    const workspaceId = req.workspace.id

    const currentMonth = todayString().slice(0, 7)
    const monthStart   = `${currentMonth}-01`

    const snapshots = await prisma.instagramSnapshot.findMany({
      where:   { workspaceId },
      orderBy: { month: 'desc' },
      include: { project: { select: { id: true, name: true } } },
    })

    const seen = new Set()
    const result = []
    for (const s of snapshots) {
      if (seen.has(s.projectId)) continue
      seen.add(s.projectId)
      // Interacciones del snapshot: (likes + comentarios) promedio × posts del mes.
      const interactions = s.postsCount != null && (s.avgLikes != null || s.avgComments != null)
        ? Math.round(((s.avgLikes ?? 0) + (s.avgComments ?? 0)) * s.postsCount)
        : null
      result.push({
        projectId:      s.projectId,
        projectName:    s.project.name,
        month:          s.month,
        followersCount: s.followersCount,
        engagementRate: s.engagementRate ?? null,
        avgLikes:       s.avgLikes       ?? null,
        avgComments:    s.avgComments    ?? null,
        postsCount:     s.postsCount     ?? null,
        interactions,
        newFollowers:   null,
        lastDataDate:   `${s.month}-01`,
        objectives:     { seguidores: null, interaccion: null },
      })
    }

    const projectIds = result.map(r => r.projectId)
    const [newFollowersMap, objMap] = await Promise.all([
      newFollowersByProject(prisma.instagramFollowerLog, workspaceId, monthStart),
      rrssObjectivesByProject(workspaceId, 'instagram', currentMonth, projectIds),
    ])
    for (const r of result) {
      const nf = newFollowersMap.get(r.projectId)
      if (nf) { r.newFollowers = nf.last - nf.first; r.lastDataDate = nf.lastDate }
      const obj = objMap.get(r.projectId)
      if (obj) r.objectives = obj
    }

    result.sort((a, b) => b.followersCount - a.followersCount)
    res.json(result)
  } catch (err) {
    next(err)
  }
}

/**
 * GET /api/marketing/summary/tiktok
 * Snapshot de TikTok más reciente por proyecto, ordenado por followersCount desc.
 */
async function getTikTokSummary(req, res, next) {
  try {
    const workspaceId = req.workspace.id

    const currentMonth = todayString().slice(0, 7)
    const monthStart   = `${currentMonth}-01`

    const snapshots = await prisma.tikTokSnapshot.findMany({
      where:   { workspaceId },
      orderBy: { month: 'desc' },
      include: { project: { select: { id: true, name: true } } },
    })

    const seen = new Set()
    const result = []
    for (const s of snapshots) {
      if (seen.has(s.projectId)) continue
      seen.add(s.projectId)
      // Interacciones del snapshot: (likes + comentarios + compartidos) promedio × videos del mes.
      const interactions = s.postsThisMonth != null && (s.avgLikes != null || s.avgComments != null || s.avgShares != null)
        ? Math.round(((s.avgLikes ?? 0) + (s.avgComments ?? 0) + (s.avgShares ?? 0)) * s.postsThisMonth)
        : null
      result.push({
        projectId:      s.projectId,
        projectName:    s.project.name,
        month:          s.month,
        followersCount: s.followersCount,
        engagementRate: s.engagementRate ?? null,
        avgViews:       s.avgViews       ?? null,
        avgLikes:       s.avgLikes       ?? null,
        postsThisMonth: s.postsThisMonth ?? null,
        interactions,
        newFollowers:   null,
        lastDataDate:   `${s.month}-01`,
        objectives:     { seguidores: null, interaccion: null },
      })
    }

    const projectIds = result.map(r => r.projectId)
    const [newFollowersMap, objMap] = await Promise.all([
      newFollowersByProject(prisma.tikTokFollowerLog, workspaceId, monthStart),
      rrssObjectivesByProject(workspaceId, 'tiktok', currentMonth, projectIds),
    ])
    for (const r of result) {
      const nf = newFollowersMap.get(r.projectId)
      if (nf) { r.newFollowers = nf.last - nf.first; r.lastDataDate = nf.lastDate }
      const obj = objMap.get(r.projectId)
      if (obj) r.objectives = obj
    }

    result.sort((a, b) => b.followersCount - a.followersCount)
    res.json(result)
  } catch (err) {
    next(err)
  }
}

/**
 * GET /api/marketing/summary/youtube
 * Snapshot de YouTube más reciente por proyecto, ordenado por suscriptores desc.
 */
async function getYouTubeSummary(req, res, next) {
  try {
    const workspaceId = req.workspace.id

    const currentMonth = todayString().slice(0, 7)
    const monthStart   = `${currentMonth}-01`

    const snapshots = await prisma.youTubeSnapshot.findMany({
      where:   { workspaceId },
      orderBy: { month: 'desc' },
      include: { project: { select: { id: true, name: true } } },
    })

    const seen = new Set()
    const result = []
    for (const s of snapshots) {
      if (seen.has(s.projectId)) continue
      seen.add(s.projectId)
      result.push({
        projectId:       s.projectId,
        projectName:     s.project.name,
        month:           s.month,
        followersCount:  s.subscriberCount,
        engagementRate:  s.engagementRate  ?? null,
        avgViews:        s.avgViews        ?? null,
        videosThisMonth: s.videosThisMonth ?? null,
        monthViews:      s.monthViews      ?? null,
        newFollowers:    null,
        lastDataDate:    `${s.month}-01`,
      })
    }

    const newFollowersMap = await newFollowersByProject(prisma.youTubeFollowerLog, workspaceId, monthStart)
    for (const r of result) {
      const nf = newFollowersMap.get(r.projectId)
      if (nf) { r.newFollowers = nf.last - nf.first; r.lastDataDate = nf.lastDate }
    }

    result.sort((a, b) => b.followersCount - a.followersCount)
    res.json(result)
  } catch (err) {
    next(err)
  }
}

/**
 * GET /api/marketing/summary/linkedin
 * Snapshot de LinkedIn más reciente por proyecto, ordenado por followersCount desc.
 */
async function getLinkedinSummary(req, res, next) {
  try {
    const workspaceId = req.workspace.id

    const snapshots = await prisma.linkedinSnapshot.findMany({
      where:   { workspaceId },
      orderBy: { month: 'desc' },
      include: { project: { select: { id: true, name: true } } },
    })

    const seen = new Set()
    const result = []
    for (const s of snapshots) {
      if (seen.has(s.projectId)) continue
      seen.add(s.projectId)
      result.push({
        projectId:      s.projectId,
        projectName:    s.project.name,
        month:          s.month,
        followersCount: s.followersCount,
        engagementRate: s.engagementRate ?? null,
        impressions:    s.impressions    ?? null,
        clicks:         s.clicks         ?? null,
        postsThisMonth: s.postsThisMonth ?? null,
      })
    }

    result.sort((a, b) => b.followersCount - a.followersCount)
    res.json(result)
  } catch (err) {
    next(err)
  }
}

/**
 * GET /api/marketing/summary/ads
 * Snapshot de Ads más reciente por proyecto y tipo, ordenado por spend desc.
 * Query: ?type=meta_ads|google_ads
 */
async function getAdsSummary(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const { type }    = req.query

    if (!['meta_ads', 'google_ads'].includes(type)) {
      return res.status(400).json({ error: 'Parámetro type requerido: meta_ads | google_ads' })
    }

    const snapshots = await prisma.adsSnapshot.findMany({
      where:   { workspaceId, type },
      orderBy: { month: 'desc' },
      include: { project: { select: { id: true, name: true } } },
    })

    const seen = new Set()
    const result = []
    for (const s of snapshots) {
      if (seen.has(s.projectId)) continue
      seen.add(s.projectId)
      result.push({
        projectId:      s.projectId,
        projectName:    s.project.name,
        month:          s.month,
        spend:          s.spend,
        impressions:    s.impressions,
        clicks:         s.clicks,
        ctr:            s.ctr,
        reach:          s.reach          ?? null,
        cpm:            s.cpm            ?? null,
        cpc:            s.cpc            ?? null,
        conversions:    s.conversions    ?? null,
        avgCpc:         s.avgCpc         ?? null,
        campaignsCount: s.campaignsCount,
        currency:       s.currency,
        topCampaigns:   safeParseArr(s.topCampaigns),
      })
    }

    result.sort((a, b) => b.spend - a.spend)
    res.json(result)
  } catch (err) {
    next(err)
  }
}

/**
 * GET /api/marketing/summary/ads-live
 * Gasto del mes EN CURSO por proyecto, en vivo (sin snapshot cacheado). A diferencia
 * de /summary/ads (que muestra el último snapshot cerrado, guardado por el cron del
 * día 1° — típicamente el mes anterior), este endpoint pega en vivo a la API de
 * Meta/Google Ads en cada carga, igual que ya hace la pestaña de un proyecto
 * individual. Secuencial para no saturar la cuota. No persiste nada (el mes en
 * curso cambia día a día; guardarlo como AdsSnapshot mezclaría datos parciales
 * con el snapshot final que arma el cron al cierre del mes).
 * Query: ?type=meta_ads|google_ads
 * Devuelve { month, results: [{ projectId, projectName, status: 'ok'|'disconnected'|'error', ... }] }
 */
async function getAdsSummaryLive(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const { type }     = req.query
    const tz           = req.workspace.timezone || 'America/Argentina/Buenos_Aires'

    if (!['meta_ads', 'google_ads'].includes(type)) {
      return res.status(400).json({ error: 'Parámetro type requerido: meta_ads | google_ads' })
    }

    // Sin `select`: getValidFbToken/fetchGoogleAdsData necesitan el registro completo
    // (accessToken, refreshToken, expiresAt, id) para refrescar el token si hace falta.
    const integrations = await prisma.projectIntegration.findMany({
      where:   { workspaceId, type },
      include: { project: { select: { name: true } } },
    })

    const results = []
    for (const ig of integrations) {
      const base = { projectId: ig.projectId, projectName: ig.project.name }
      const connected = type === 'meta_ads'
        ? (ig.status === 'active' && !!ig.propertyId)
        : (ig.status === 'active' && !!ig.customerId)
      if (!connected) {
        results.push({ ...base, status: 'disconnected' })
        continue
      }

      try {
        let row
        if (type === 'meta_ads') {
          const token = await getValidFbToken(ig)
          const data  = await fetchMetaAdsData(ig.propertyId, token, 'this_month')
          row = {
            spend: data.spend, impressions: data.impressions, clicks: data.clicks, ctr: data.ctr,
            reach: data.reach ?? null, cpm: data.cpm ?? null, cpc: data.cpc ?? null,
            conversions: null, avgCpc: null, campaignsCount: (data.campaigns ?? []).length,
          }
        } else {
          if (!process.env.GOOGLE_ADS_DEVELOPER_TOKEN) throw new Error('GOOGLE_ADS_DEVELOPER_TOKEN no configurado')
          const data = await fetchGoogleAdsData(ig, 'this_month')
          row = {
            spend: data.cost, impressions: data.impressions, clicks: data.clicks, ctr: data.ctr,
            reach: null, cpm: null, cpc: data.avgCpc ?? null,
            conversions: data.conversions ?? null, avgCpc: data.avgCpc ?? null, campaignsCount: (data.campaigns ?? []).length,
          }
        }
        results.push({ ...base, status: 'ok', ...row })
      } catch (err) {
        console.error(`[AdsSummaryLive] ${type} proyecto ${ig.projectId}:`, err.message)
        results.push({ ...base, status: 'error', error: err.message })
      }
    }

    const ok   = results.filter(r => r.status === 'ok').sort((a, b) => b.spend - a.spend)
    const rest = results.filter(r => r.status !== 'ok')

    res.json({ month: todayString(tz).slice(0, 7), results: [...ok, ...rest] })
  } catch (err) {
    next(err)
  }
}

/**
 * GET /api/marketing/summary/reports
 * TODOS los informes del workspace de un mes puntual (por defecto, el mes en curso —
 * el slot que se ve al navegar mes a mes en la vista de un proyecto), sin paginar.
 * Cada informe incluye su % de cumplimiento de objetivos (ok / evaluables, mismo
 * criterio que el auto-metric "objetivos_cumplidos" del Scorecard EOS) y el detalle
 * de sus objetivos, para el desplegable de la lista. `generators` = quiénes generaron
 * algún informe de ese mes (para el filtro por persona) — siempre sobre el mes
 * completo, sin importar los filtros de búsqueda/persona aplicados a `reports`.
 * Query: ?month=YYYY-MM&search=texto&generatedById=N&sort=date_desc|pct_desc|pct_asc
 */
async function getReportsSummary(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const tz     = req.workspace.timezone || 'America/Argentina/Buenos_Aires'
    const month  = /^\d{4}-\d{2}$/.test(req.query.month || '') ? req.query.month : todayString(tz).slice(0, 7)
    const search = (req.query.search || '').trim()
    const generatedById = /^\d+$/.test(req.query.generatedById || '') ? parseInt(req.query.generatedById) : null
    const sort   = ['pct_desc', 'pct_asc'].includes(req.query.sort) ? req.query.sort : 'date_desc'

    const baseWhere = { workspaceId, month, ...GENERATED_REPORT_WHERE }
    const where = {
      ...baseWhere,
      ...(search        ? { project: { name: { contains: search, mode: 'insensitive' } } } : {}),
      ...(generatedById  ? { generatedById } : {}),
    }

    const [reports, generatorRows] = await Promise.all([
      prisma.monthlyReport.findMany({
        where,
        orderBy: [{ month: 'desc' }, { createdAt: 'desc' }],
        take:    300, // límite de seguridad — no hay paginación, se listan todos los del mes
        select: {
          id:          true,
          month:       true,
          token:       true,
          createdAt:   true,
          updatedAt:   true,
          periodStart: true,
          periodEnd:   true,
          project:     { select: { id: true, name: true } },
          generatedBy: { select: { id: true, name: true } },
        },
      }),
      prisma.monthlyReport.findMany({
        where:  baseWhere,
        select: { generatedBy: { select: { id: true, name: true } } },
      }),
    ])

    const genMap = new Map()
    for (const r of generatorRows) if (r.generatedBy) genMap.set(r.generatedBy.id, r.generatedBy.name)
    const generators = [...genMap.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))

    const withExtras = await Promise.all(reports.map(async (r) => {
      let objectives = []
      try {
        objectives = await computeObjectives({ projectId: r.project.id, workspaceId, dataMonth: reportDataMonth(r) })
      } catch (err) {
        console.error(`[ReportsSummary] objetivos informe ${r.id}:`, err.message)
      }
      const evaluable = objectives.filter(o => ['ok', 'partial', 'fail'].includes(o.status))
      const objectivesPct = evaluable.length
        ? Math.round(evaluable.filter(o => o.status === 'ok').length / evaluable.length * 100)
        : null
      return { ...r, periodLabel: reportLabel(r), objectivesPct, objectives }
    }))

    // Orden por % de cumplimiento: los sin objetivos/sin datos quedan siempre al
    // final (no hay un valor real que ordenar). "date_desc" conserva el orden de la DB.
    if (sort === 'pct_desc' || sort === 'pct_asc') {
      const withPct    = withExtras.filter(r => r.objectivesPct != null)
      const withoutPct = withExtras.filter(r => r.objectivesPct == null)
      withPct.sort((a, b) => sort === 'pct_desc' ? b.objectivesPct - a.objectivesPct : a.objectivesPct - b.objectivesPct)
      withExtras.length = 0
      withExtras.push(...withPct, ...withoutPct)
    }

    res.json({ reports: withExtras, total: withExtras.length, month, generators })
  } catch (err) {
    next(err)
  }
}

/**
 * GET /api/marketing/summary/reports-stats
 * Tarjetas resumen de la vista global de Informes (mes calendario en curso,
 * en la timezone del workspace). "Generado" = createdAt del informe, consistente
 * con la etiqueta "Generado: {createdAt}" de la lista.
 *   - reportsThisMonth  : informes generados este mes
 *   - feedbackThisMonth : calificaciones (ReportFeedback) recibidas este mes
 *   - ratePct           : % de los informes de este mes que recibieron ≥1 calificación
 *   - generators        : quiénes generaron esos informes (con conteo)
 */
async function getReportsStats(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const tz     = req.workspace.timezone || 'America/Argentina/Buenos_Aires'
    const month  = todayString(tz).slice(0, 7)
    const { startDate, endDate } = monthBounds(month)
    const offset = tzOffsetStr(tz)

    // Rango [inicio de mes, fin de mes 23:59:59.999] en la TZ del workspace.
    const gte = new Date(`${startDate}T00:00:00.000${offset}`)
    const lte = new Date(`${endDate}T23:59:59.999${offset}`)

    const [reports, feedbackThisMonth, ratingAgg] = await Promise.all([
      prisma.monthlyReport.findMany({
        where:  { workspaceId, ...GENERATED_REPORT_WHERE, createdAt: { gte, lte } },
        select: { id: true, generatedBy: { select: { id: true, name: true } } },
      }),
      prisma.reportFeedback.count({ where: { workspaceId, createdAt: { gte, lte } } }),
      prisma.reportFeedback.aggregate({
        where: { workspaceId, createdAt: { gte, lte } },
        _avg:  { rating: true },
      }),
    ])

    const reportIds = reports.map(r => r.id)

    // Informes de este mes que recibieron al menos una calificación (en cualquier momento).
    const ratedGroups = reportIds.length
      ? await prisma.reportFeedback.groupBy({
          by:    ['reportId'],
          where: { workspaceId, reportId: { in: reportIds } },
        })
      : []
    const ratedReports = ratedGroups.length
    const ratePct = reports.length ? Math.round((ratedReports / reports.length) * 100) : 0

    // Quiénes generaron los informes de este mes (con conteo, desc).
    const byGen = new Map()
    for (const r of reports) {
      if (!r.generatedBy) continue
      const cur = byGen.get(r.generatedBy.id) || { id: r.generatedBy.id, name: r.generatedBy.name, count: 0 }
      cur.count++
      byGen.set(r.generatedBy.id, cur)
    }
    const generators = [...byGen.values()].sort((a, b) => b.count - a.count)

    res.json({
      month,
      monthLabel:        monthLabel(month),
      reportsThisMonth:  reports.length,
      feedbackThisMonth,
      ratedReports,
      ratePct,
      avgRating:         ratingAgg._avg.rating ? Number(ratingAgg._avg.rating.toFixed(1)) : null,
      generators,
    })
  } catch (err) {
    next(err)
  }
}

/**
 * GET /api/marketing/summary/objectives-live
 * Vista "en vivo" de cumplimiento de objetivos, cross-proyecto. A diferencia
 * de /summary/reports (que lista informes YA generados), este endpoint no
 * depende de que exista un MonthlyReport: recalcula los objetivos en vivo
 * (computeObjectives) para el mes elegido, así se puede ver el avance del mes
 * en curso ANTES de que salga el informe mensual (que recién se genera al mes
 * siguiente, con datos cerrados).
 * Navegable a meses anteriores, pero solo a los que ya tienen al menos un
 * informe generado en el workspace (para no mostrar meses sin ningún dato).
 * Query: ?month=YYYY-MM (default: mes calendario en curso)
 */
async function getLiveObjectivesSummary(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const tz = req.workspace.timezone || 'America/Argentina/Buenos_Aires'
    const currentMonth = todayString(tz).slice(0, 7)

    // Meses navegables: el mes en curso (siempre) + los meses de datos de
    // informes ya generados en el workspace (mismo criterio que reportDataMonth).
    const reportRows = await prisma.monthlyReport.findMany({
      where:  { workspaceId, ...GENERATED_REPORT_WHERE },
      select: { month: true, periodStart: true, periodEnd: true },
    })
    const monthsSet = new Set([currentMonth])
    for (const r of reportRows) monthsSet.add(reportDataMonth(r))

    const month = /^\d{4}-\d{2}$/.test(req.query.month || '') && monthsSet.has(req.query.month)
      ? req.query.month
      : currentMonth

    const availableMonths = [...monthsSet]
      .sort((a, b) => b.localeCompare(a))
      .map(m => ({ month: m, label: monthLabel(m), isCurrent: m === currentMonth }))

    // Solo proyectos activos con al menos un objetivo configurado.
    const projects = await prisma.project.findMany({
      where:   { workspaceId, active: true, marketingObjectives: { some: {} } },
      select:  { id: true, name: true },
      orderBy: { name: 'asc' },
    })

    const results = await Promise.all(projects.map(async (p) => {
      let objectives = []
      try {
        objectives = await computeObjectives({ projectId: p.id, workspaceId, dataMonth: month })
      } catch (err) {
        console.error(`[LiveObjectives] proyecto ${p.id}:`, err.message)
      }
      const evaluable = objectives.filter(o => ['ok', 'partial', 'fail'].includes(o.status))
      const objectivesPct = evaluable.length
        ? Math.round(evaluable.filter(o => o.status === 'ok').length / evaluable.length * 100)
        : null
      return { projectId: p.id, projectName: p.name, objectivesPct, objectives }
    }))

    // % desc; sin datos al final
    results.sort((a, b) => (b.objectivesPct ?? -1) - (a.objectivesPct ?? -1))

    res.json({
      month,
      monthLabel: monthLabel(month),
      isCurrent: month === currentMonth,
      availableMonths,
      projects: results,
    })
  } catch (err) {
    next(err)
  }
}

/**
 * GET /api/marketing/summary/seo
 * Todos los sitios web del workspace (proyectos con websiteUrl) ordenados por
 * Domain Rating de mayor a menor. Los que aún no tienen DR van al final.
 */
async function getSeoSummary(req, res, next) {
  try {
    const workspaceId = req.workspace.id

    const projects = await prisma.project.findMany({
      where:  { workspaceId, active: true, websiteUrl: { not: null } },
      select: { id: true, name: true, websiteUrl: true, domainRating: true, domainRatingAt: true },
    })

    const result = projects.map(p => ({
      projectId:      p.id,
      projectName:    p.name,
      websiteUrl:     p.websiteUrl,
      domainRating:   p.domainRating,
      domainRatingAt: p.domainRatingAt,
    }))

    // DR desc; null al final
    result.sort((a, b) => (b.domainRating ?? -1) - (a.domainRating ?? -1))
    res.json(result)
  } catch (err) {
    next(err)
  }
}

/**
 * GET /api/marketing/summary/facebook
 * Snapshot de Facebook más reciente por proyecto, ordenado por followersCount desc.
 */
async function getFacebookSummary(req, res, next) {
  try {
    const workspaceId = req.workspace.id

    const snapshots = await prisma.facebookSnapshot.findMany({
      where:   { workspaceId },
      orderBy: { month: 'desc' },
      include: { project: { select: { id: true, name: true } } },
    })

    const seen = new Set()
    const result = []
    for (const s of snapshots) {
      if (seen.has(s.projectId)) continue
      seen.add(s.projectId)
      result.push({
        projectId:      s.projectId,
        projectName:    s.project.name,
        month:          s.month,
        followersCount: s.followersCount,
        engagementRate: s.engagementRate ?? null,
        reach:          s.reach          ?? null,
        impressions:    s.impressions    ?? null,
        postsThisMonth: s.postsThisMonth ?? null,
      })
    }

    result.sort((a, b) => b.followersCount - a.followersCount)
    res.json(result)
  } catch (err) {
    next(err)
  }
}

module.exports = {
  getAnalyticsSummary,
  refreshAnalyticsSummary,
  refreshRrssSummary,
  getPerformanceSummary,
  getInstagramSummary,
  getTikTokSummary,
  getYouTubeSummary,
  getLinkedinSummary,
  getFacebookSummary,
  getAdsSummary,
  getAdsSummaryLive,
  getReportsSummary,
  getReportsStats,
  getLiveObjectivesSummary,
  getSeoSummary,
}
