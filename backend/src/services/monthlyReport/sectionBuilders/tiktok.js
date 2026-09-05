const prisma = require('../../../lib/prisma')
const { prevMonthStr } = require('../../../lib/monthUtils')
const { pct } = require('../_shared')

function parseTkTopVideos(json) {
  if (!json) return []
  try { const v = JSON.parse(json); return Array.isArray(v) ? v : [] }
  catch { return [] }
}

/**
 * TikTok (con fallback a snapshot más reciente si no hay del mes ancla).
 * @param {object} ctx — { projectId, workspaceId, tiktokSnap, tiktokPrev, flow }
 */
async function buildTikTokSection({ projectId, workspaceId, tiktokSnap, tiktokPrev, flow }) {
  if (tiktokSnap) {
    const topVideos = parseTkTopVideos(tiktokSnap.topVideos)
    return {
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
  }

  // Fallback 1: snapshot más reciente disponible (cualquier mes)
  const recentTk = await prisma.tikTokSnapshot.findFirst({
    where:   { projectId, workspaceId },
    orderBy: { month: 'desc' },
    select:  { followersCount: true, engagementRate: true, avgViews: true,
               avgLikes: true, postsThisMonth: true, likesCount: true, topVideos: true, month: true },
  })
  if (!recentTk) return null // Ya no hay fallback en vivo acá — ver "check-readiness".

  const prevTk = await prisma.tikTokSnapshot.findFirst({
    where:  { projectId, workspaceId, month: prevMonthStr(recentTk.month) },
    select: { followersCount: true, engagementRate: true },
  })
  const topVideos = parseTkTopVideos(recentTk.topVideos)
  return {
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

module.exports = { buildTikTokSection }
