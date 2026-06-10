/**
 * marketingSummary.controller.js
 * Endpoints de vista global cross-proyecto (sin proyecto seleccionado).
 * Devuelven el snapshot más reciente de cada proyecto para el workspace.
 */

const prisma = require('../lib/prisma')
const { computeObjectives } = require('../services/marketingObjectives.service')
const { todayString } = require('../utils/dates')

function safeParseArr(v) {
  try { return JSON.parse(v) } catch { return [] }
}

// Seguidores nuevos en lo que va del mes + fecha del último dato, por proyecto.
// Usa los follower logs diarios cacheados (no re-scrapea).
// followerLogModel: prisma.instagramFollowerLog | prisma.tikTokFollowerLog
async function newFollowersByProject(followerLogModel, workspaceId, monthStart) {
  const logs = await followerLogModel.findMany({
    where:   { workspaceId, date: { gte: monthStart } },
    orderBy: { date: 'asc' },
    select:  { projectId: true, date: true, followersCount: true },
  })
  const byProj = new Map()
  for (const l of logs) {
    const e = byProj.get(l.projectId)
    if (!e) byProj.set(l.projectId, { first: l.followersCount, last: l.followersCount, lastDate: l.date })
    else    { e.last = l.followersCount; e.lastDate = l.date }   // logs asc → último sobrescribe
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

    // Deduplicate: un registro por proyecto (el más reciente, que viene primero por orderBy)
    const seen = new Set()
    const result = []
    for (const s of snapshots) {
      if (seen.has(s.projectId)) continue
      seen.add(s.projectId)
      result.push({
        projectId:   s.projectId,
        projectName: s.project.name,
        month:       s.month,
        sessions:    s.sessions,
        activeUsers: s.activeUsers,
        newUsers:    s.newUsers,
        pageviews:   s.pageviews,
        bounceRate:  s.bounceRate,
        avgDuration: s.avgDuration,
        conversions: s.conversions,
      })
    }

    result.sort((a, b) => b.sessions - a.sessions)
    res.json(result)
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
          project:     { select: { id: true, name: true } },
          generatedBy: { select: { id: true, name: true } },
        },
      }),
      prisma.monthlyReport.count({ where: { workspaceId } }),
    ])

    res.json({ reports, total, limit, offset })
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

module.exports = {
  getAnalyticsSummary,
  getPerformanceSummary,
  getInstagramSummary,
  getTikTokSummary,
  getLinkedinSummary,
  getAdsSummary,
  getReportsSummary,
  getSeoSummary,
}
