/**
 * marketingSummary.controller.js
 * Endpoints de vista global cross-proyecto (sin proyecto seleccionado).
 * Devuelven el snapshot más reciente de cada proyecto para el workspace.
 */

const prisma = require('../lib/prisma')

function safeParseArr(v) {
  try { return JSON.parse(v) } catch { return [] }
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
      result.push({
        projectId:      s.projectId,
        projectName:    s.project.name,
        month:          s.month,
        followersCount: s.followersCount,
        engagementRate: s.engagementRate ?? null,
        avgLikes:       s.avgLikes       ?? null,
        avgComments:    s.avgComments    ?? null,
        postsCount:     s.postsCount     ?? null,
      })
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
      result.push({
        projectId:      s.projectId,
        projectName:    s.project.name,
        month:          s.month,
        followersCount: s.followersCount,
        engagementRate: s.engagementRate ?? null,
        avgViews:       s.avgViews       ?? null,
        avgLikes:       s.avgLikes       ?? null,
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
          id:        true,
          month:     true,
          token:     true,
          createdAt: true,
          updatedAt: true,
          project:   { select: { id: true, name: true } },
        },
      }),
      prisma.monthlyReport.count({ where: { workspaceId } }),
    ])

    res.json({ reports, total, limit, offset })
  } catch (err) {
    next(err)
  }
}

module.exports = {
  getAnalyticsSummary,
  getPerformanceSummary,
  getInstagramSummary,
  getTikTokSummary,
  getAdsSummary,
  getReportsSummary,
}
