/**
 * marketingSummary.controller.js
 * Endpoints de vista global cross-proyecto (sin proyecto seleccionado).
 * Devuelven el snapshot más reciente de cada proyecto para el workspace.
 */

const prisma = require('../lib/prisma')
const { computeObjectives } = require('../services/marketingObjectives.service')
const { saveMonthSnapshot } = require('../services/analyticsSnapshot.service')
const { todayString } = require('../utils/dates')
const { tzOffsetStr } = require('../lib/timeMetrics')
const { monthBounds, monthLabel, prevMonthStr, rangeLabel } = require('../lib/monthUtils')

/** Etiqueta del informe por su período de datos (espejo de monthlyReport.controller). */
function reportLabel(report) {
  let start, end
  if (report.periodStart && report.periodEnd) {
    start = new Date(report.periodStart).toISOString().slice(0, 10)
    end   = new Date(report.periodEnd).toISOString().slice(0, 10)
  } else {
    ({ startDate: start, endDate: end } = monthBounds(prevMonthStr(report.month)))
  }
  return rangeLabel(start, end)
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

/**
 * GET /api/marketing/summary/performance
 * Resultado de PageSpeed más reciente (mobile) por proyecto, ordenado por score desc.
 */
async function getPerformanceSummary(req, res, next) {
  try {
    const workspaceId = req.workspace.id

    // Mobile primero, luego desktop — tomamos el más reciente por proyecto
    const results = await prisma.pageSpeedResult.findMany({
      where:   { workspaceId, status: 'done' },
      orderBy: [
        { createdAt: 'desc' },
      ],
      include: { project: { select: { id: true, name: true } } },
    })

    // Un registro por proyecto, preferencia: mobile > desktop
    const byProject = new Map()
    for (const r of results) {
      if (!byProject.has(r.projectId)) {
        byProject.set(r.projectId, r)
        continue
      }
      // Si ya hay uno pero el nuevo es mobile y el guardado no, reemplazamos
      const existing = byProject.get(r.projectId)
      if (r.strategy === 'mobile' && existing.strategy !== 'mobile') {
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
 * GET /api/marketing/summary/reports
 * Todos los informes del workspace, del más nuevo al más viejo.
 * Query: ?limit=20&offset=0
 */
async function getReportsSummary(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const limit  = Math.min(parseInt(req.query.limit  ?? '20'), 50)
    const offset = parseInt(req.query.offset ?? '0')

    const [reports, total] = await Promise.all([
      prisma.monthlyReport.findMany({
        where:   { workspaceId },
        orderBy: [{ month: 'desc' }, { createdAt: 'desc' }],
        skip:    offset,
        take:    limit,
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
      prisma.monthlyReport.count({ where: { workspaceId } }),
    ])

    const withLabel = reports.map(r => ({ ...r, periodLabel: reportLabel(r) }))

    res.json({ reports: withLabel, total, limit, offset })
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
  getPerformanceSummary,
  getInstagramSummary,
  getTikTokSummary,
  getYouTubeSummary,
  getLinkedinSummary,
  getFacebookSummary,
  getAdsSummary,
  getReportsSummary,
  getReportsStats,
  getSeoSummary,
}
