/**
 * rrssSummary.controller.js
 * Vistas globales cross-proyecto de RRSS (Instagram/TikTok/YouTube/LinkedIn/Facebook).
 */

const prisma = require('../../lib/prisma')
const { computeObjectives } = require('../../services/marketingObjectives.service')
const { refreshScrapeForIntegration: refreshInstagramScrape } = require('../instagram.controller')
const { refreshScrapeForIntegration: refreshLinkedinScrape }  = require('../linkedin.controller')
const { refreshScrapeForIntegration: refreshFacebookScrape }  = require('../facebook.controller')
const { todayString } = require('../../utils/dates')

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
 * GET /api/marketing/summary/instagram
 * Snapshot de Instagram más reciente por proyecto, ordenado por followersCount desc.
 */
async function getInstagramSummary(req, res, next) {
  try {
    const workspaceId = req.workspace.id

    const currentMonth = todayString().slice(0, 7)
    const monthStart   = `${currentMonth}-01`

    const snapshots = await prisma.instagramSnapshot.findMany({
      where:   { workspaceId, project: { active: true } },
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
      where:   { workspaceId, project: { active: true } },
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
      where:   { workspaceId, project: { active: true } },
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
      where:   { workspaceId, project: { active: true } },
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
 * GET /api/marketing/summary/facebook
 * Snapshot de Facebook más reciente por proyecto, ordenado por followersCount desc.
 */
async function getFacebookSummary(req, res, next) {
  try {
    const workspaceId = req.workspace.id

    const snapshots = await prisma.facebookSnapshot.findMany({
      where:   { workspaceId, project: { active: true } },
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
      where:  { workspaceId, type: platform, scopes: 'scrape', project: { active: true } },
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

module.exports = {
  getInstagramSummary, getTikTokSummary, getYouTubeSummary, getLinkedinSummary, getFacebookSummary,
  refreshRrssSummary,
}
