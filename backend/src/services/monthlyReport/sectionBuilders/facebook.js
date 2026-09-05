const prisma = require('../../../lib/prisma')
const { prevMonthStr } = require('../../../lib/monthUtils')
const { pct } = require('../_shared')

function parseFb(snap) {
  if (!snap) return null
  return {
    ...snap,
    topPosts: (() => { try { return JSON.parse(snap.topPosts ?? '[]') } catch { return [] } })(),
  }
}

/**
 * Facebook (con fallback a snapshot más reciente si no hay del mes ancla).
 * @param {object} ctx — { projectId, workspaceId, facebookSnap, facebookPrev, flow }
 */
async function buildFacebookSection({ projectId, workspaceId, facebookSnap, facebookPrev, flow }) {
  if (facebookSnap) {
    const s = parseFb(facebookSnap)
    return {
      followersCount:  s.followersCount,
      fanCount:        s.fanCount,
      engagementRate:  s.engagementRate,
      reach:           s.reach,
      impressions:     s.impressions,
      totalLikes:      flow ? flow.fb.totalLikes    : s.totalLikes,
      totalComments:   flow ? flow.fb.totalComments : s.totalComments,
      totalShares:     flow ? flow.fb.totalShares   : s.totalShares,
      postsThisMonth:  flow ? flow.fb.postsThisMonth : s.postsThisMonth,
      topPosts:        s.topPosts,
      deltaFollowers:  (!flow && facebookPrev) ? pct(s.followersCount, facebookPrev.followersCount) : null,
      deltaEngagement: (!flow && facebookPrev) ? pct(s.engagementRate ?? 0, facebookPrev.engagementRate) : null,
      deltaReach:      (!flow && facebookPrev) ? pct(s.reach ?? 0, facebookPrev.reach) : null,
    }
  }

  // Fallback 1: snapshot más reciente disponible
  const recentFb = await prisma.facebookSnapshot.findFirst({
    where:   { projectId, workspaceId },
    orderBy: { month: 'desc' },
    select:  { followersCount: true, fanCount: true, engagementRate: true, reach: true,
               impressions: true, totalLikes: true, totalComments: true,
               totalShares: true, postsThisMonth: true, topPosts: true, month: true },
  })
  if (!recentFb) return null // Ya no hay fallback en vivo acá — ver "check-readiness".

  const prevFb = await prisma.facebookSnapshot.findFirst({
    where:  { projectId, workspaceId, month: prevMonthStr(recentFb.month) },
    select: { followersCount: true, engagementRate: true, reach: true },
  })
  const s = parseFb(recentFb)
  return {
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
}

module.exports = { buildFacebookSection }
