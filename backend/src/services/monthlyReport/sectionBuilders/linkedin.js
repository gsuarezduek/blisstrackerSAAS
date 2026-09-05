const prisma = require('../../../lib/prisma')
const { prevMonthStr } = require('../../../lib/monthUtils')
const { pct } = require('../_shared')

function parseLi(snap) {
  if (!snap) return null
  return {
    ...snap,
    topPosts:     (() => { try { return JSON.parse(snap.topPosts     ?? '[]') } catch { return [] } })(),
    demographics: (() => { try { return JSON.parse(snap.demographics ?? '{}') } catch { return {} } })(),
  }
}

/**
 * LinkedIn (con fallback a snapshot más reciente si no hay del mes ancla).
 * @param {object} ctx — { projectId, workspaceId, linkedinSnap, linkedinPrev, flow }
 */
async function buildLinkedinSection({ projectId, workspaceId, linkedinSnap, linkedinPrev, flow }) {
  if (linkedinSnap) {
    const s = parseLi(linkedinSnap)
    return {
      followersCount:  s.followersCount,
      engagementRate:  s.engagementRate,
      impressions:     flow ? flow.li.impressions : s.impressions,
      clicks:          flow ? flow.li.clicks      : s.clicks,
      ctr:             flow ? (flow.li.impressions > 0 ? parseFloat((flow.li.clicks / flow.li.impressions * 100).toFixed(2)) : null) : s.ctr,
      totalLikes:      flow ? flow.li.totalLikes    : s.totalLikes,
      totalComments:   flow ? flow.li.totalComments : s.totalComments,
      totalShares:     flow ? flow.li.totalShares   : s.totalShares,
      postsThisMonth:  flow ? flow.li.postsThisMonth : s.postsThisMonth,
      topPosts:        s.topPosts,
      demographics:    s.demographics,
      deltaFollowers:  (!flow && linkedinPrev) ? pct(s.followersCount, linkedinPrev.followersCount) : null,
      deltaEngagement: (!flow && linkedinPrev) ? pct(s.engagementRate ?? 0, linkedinPrev.engagementRate) : null,
      deltaImpressions: (!flow && linkedinPrev) ? pct(s.impressions ?? 0, linkedinPrev.impressions) : null,
    }
  }

  // Fallback 1: snapshot más reciente disponible
  const recentLi = await prisma.linkedinSnapshot.findFirst({
    where:   { projectId, workspaceId },
    orderBy: { month: 'desc' },
    select:  { followersCount: true, engagementRate: true, impressions: true,
               clicks: true, ctr: true, totalLikes: true, totalComments: true,
               totalShares: true, postsThisMonth: true, topPosts: true, demographics: true, month: true },
  })
  if (!recentLi) return null // Ya no hay fallback en vivo acá — ver "check-readiness".

  const prevLi = await prisma.linkedinSnapshot.findFirst({
    where:  { projectId, workspaceId, month: prevMonthStr(recentLi.month) },
    select: { followersCount: true, engagementRate: true, impressions: true },
  })
  const s = parseLi(recentLi)
  return {
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
}

module.exports = { buildLinkedinSection }
