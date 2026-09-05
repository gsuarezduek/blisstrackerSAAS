const prisma = require('../../../lib/prisma')
const { prevMonthStr } = require('../../../lib/monthUtils')
const { pct } = require('../_shared')

function parseYtTopVideos(json) {
  if (!json) return []
  try { const v = JSON.parse(json); return Array.isArray(v) ? v : [] }
  catch { return [] }
}

// `useFlow` = aplicar la suma multi-mes (solo para el snapshot del mes ancla, no en fallbacks)
function buildYt(snap, prevSnap, fallbackMonth, flow, useFlow = false) {
  const topVideos = parseYtTopVideos(snap.topVideos)
  const f = useFlow ? flow : null
  return {
    subscriberCount:  snap.subscriberCount,
    engagementRate:   snap.engagementRate,
    avgViews:         snap.avgViews,
    monthViews:       f ? f.yt.monthViews      : snap.monthViews,
    videosThisMonth:  f ? f.yt.videosThisMonth : snap.videosThisMonth,
    shortsThisMonth:  f ? f.yt.shortsThisMonth : snap.shortsThisMonth,
    longsThisMonth:   f ? f.yt.longsThisMonth  : snap.longsThisMonth,
    topVideos,
    bestVideo:        topVideos[0] ?? null,
    deltaSubscribers: (!f && prevSnap) ? pct(snap.subscriberCount, prevSnap.subscriberCount) : null,
    deltaViews:       (!f && prevSnap?.viewCountTotal != null && snap.viewCountTotal != null)
                        ? snap.viewCountTotal - prevSnap.viewCountTotal : null,
    ...(fallbackMonth ? { _fallbackMonth: fallbackMonth } : {}),
  }
}

/**
 * YouTube (con fallback a snapshot más reciente si no hay del mes ancla).
 * @param {object} ctx — { projectId, workspaceId, youtubeSnap, youtubePrev, flow }
 */
async function buildYouTubeSection({ projectId, workspaceId, youtubeSnap, youtubePrev, flow }) {
  if (youtubeSnap) {
    return buildYt(youtubeSnap, youtubePrev, null, flow, true)
  }

  // Fallback 1: snapshot más reciente disponible (cualquier mes)
  const recentYt = await prisma.youTubeSnapshot.findFirst({
    where:   { projectId, workspaceId },
    orderBy: { month: 'desc' },
    select:  { subscriberCount: true, engagementRate: true, avgViews: true, monthViews: true,
               viewCountTotal: true, videosThisMonth: true, longsThisMonth: true,
               shortsThisMonth: true, topVideos: true, month: true },
  })
  if (!recentYt) return null // Ya no hay fallback en vivo acá — ver "check-readiness".

  const prevYt = await prisma.youTubeSnapshot.findFirst({
    where:  { projectId, workspaceId, month: prevMonthStr(recentYt.month) },
    select: { subscriberCount: true, viewCountTotal: true },
  })
  return buildYt(recentYt, prevYt, recentYt.month, flow, false)
}

module.exports = { buildYouTubeSection }
