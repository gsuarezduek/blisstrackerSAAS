const prisma = require('../../../lib/prisma')
const { prevMonthStr } = require('../../../lib/monthUtils')
const { cacheImagesInArray } = require('../../socialImageCache.service')
const { getStoriesSummary } = require('../../instagramStories.service')
const { pct } = require('../_shared')

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

/**
 * Instagram (con fallback a snapshot más reciente si no hay del mes ancla).
 * @param {object} ctx — { projectId, workspaceId, instagramSnap, instagramPrev, flow, dataMonth }
 */
async function buildInstagramSection({ projectId, workspaceId, instagramSnap, instagramPrev, flow, dataMonth }) {
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

  return instagram
}

module.exports = { buildInstagramSection, buildCompetitorComparison }
