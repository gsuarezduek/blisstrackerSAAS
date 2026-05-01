const axios = require('axios')

const TIKTOK_BASE = 'https://open.tiktokapis.com/v2'

/**
 * Obtiene métricas de TikTok para una cuenta Business/Creator.
 * Filtra videos por mes actual (ART) para calcular KPIs del mes.
 *
 * @param {string} accessToken — TikTok access token válido
 * @returns {Promise<object>}
 */
async function fetchTikTokMetrics(accessToken) {
  // ── Perfil básico (user.info.basic — display_name, avatar_url) ──────────
  const profileRes = await axios.get(`${TIKTOK_BASE}/user/info/`, {
    params: { fields: 'display_name,avatar_url' },
    headers: { 'Authorization': `Bearer ${accessToken}` },
  })

  // ── Perfil extendido (user.info.profile — bio, username, is_verified) ────
  let profileExt = {}
  try {
    const extRes = await axios.get(`${TIKTOK_BASE}/user/info/`, {
      params: { fields: 'bio_description,is_verified,username' },
      headers: { 'Authorization': `Bearer ${accessToken}` },
    })
    profileExt = extRes.data?.data?.user ?? {}
  } catch (err) {
    console.warn('[TikTok] user.info.profile no disponible:', err.response?.status ?? err.message)
  }

  // ── Stats de cuenta (user.info.stats — follower/likes/video counts) ──────
  let statsUser = {}
  try {
    const statsRes = await axios.get(`${TIKTOK_BASE}/user/info/`, {
      params: { fields: 'follower_count,following_count,likes_count,video_count' },
      headers: { 'Authorization': `Bearer ${accessToken}` },
    })
    statsUser = statsRes.data?.data?.user ?? {}
  } catch (err) {
    console.warn('[TikTok] user.info.stats no disponible:', err.response?.status ?? err.message)
  }

  // ── Videos (video.list) ───────────────────────────────────────────────────
  const videosRes = await axios.post(
    `${TIKTOK_BASE}/video/list/`,
    { max_count: 20 },
    {
      params: { fields: 'id,title,create_time,cover_image_url,share_url,view_count,like_count,comment_count,share_count,duration' },
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    },
  )

  const user   = profileRes.data?.data?.user ?? {}
  const videos = videosRes.data?.data?.videos ?? []

  const followersCount = statsUser.follower_count  ?? null
  const followingCount = statsUser.following_count ?? null
  const likesCount     = statsUser.likes_count     ?? null
  const videoCount     = statsUser.video_count     ?? null

  // ── Mes actual en horario ART ─────────────────────────────────────────────
  const artNow     = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' }))
  const monthStart = new Date(artNow.getFullYear(), artNow.getMonth(), 1)

  // Videos del mes (create_time es Unix timestamp en segundos)
  const monthVideos = videos.filter(v => v.create_time && new Date(v.create_time * 1000) >= monthStart)
  const postsThisMonth = monthVideos.length

  // ── Promedios del mes ─────────────────────────────────────────────────────

  function avgField(arr, key) {
    const valid = arr.filter(v => v[key] != null)
    return valid.length > 0
      ? parseFloat((valid.reduce((s, v) => s + v[key], 0) / valid.length).toFixed(1))
      : null
  }

  const avgViews    = avgField(monthVideos, 'view_count')
  const avgLikes    = avgField(monthVideos, 'like_count')
  const avgComments = avgField(monthVideos, 'comment_count')
  const avgShares   = avgField(monthVideos, 'share_count')

  // Engagement rate TikTok = (likes + comments + shares) / views * 100 (por video, promediado)
  const monthWithViews = monthVideos.filter(v => (v.view_count ?? 0) > 0)
  const engagementRate = monthWithViews.length > 0
    ? parseFloat((
        monthWithViews.reduce((s, v) => {
          const eng  = (v.like_count ?? 0) + (v.comment_count ?? 0) + (v.share_count ?? 0)
          return s + (eng / v.view_count * 100)
        }, 0) / monthWithViews.length
      ).toFixed(2))
    : null

  // ── TOP del mes ────────────────────────────────────────────────────────────

  function toVideoCard(v) {
    if (!v) return null
    return {
      id:           v.id,
      title:        v.title        ?? null,
      coverUrl:     v.cover_image_url ?? null,
      shareUrl:     v.share_url    ?? null,
      viewCount:    v.view_count   ?? null,
      likeCount:    v.like_count   ?? null,
      commentCount: v.comment_count ?? null,
      shareCount:   v.share_count  ?? null,
      duration:     v.duration     ?? null,
      createTime:   v.create_time ? new Date(v.create_time * 1000).toISOString() : null,
    }
  }

  const withViews    = monthVideos.filter(v => v.view_count    != null)
  const withLikes    = monthVideos.filter(v => v.like_count    != null)
  const withShares   = monthVideos.filter(v => v.share_count   != null)

  const topViews  = withViews.length  > 0 ? toVideoCard(withViews.reduce((b, v)  => v.view_count  > b.view_count  ? v : b)) : null
  const topLikes  = withLikes.length  > 0 ? toVideoCard(withLikes.reduce((b, v)  => v.like_count  > b.like_count  ? v : b)) : null
  const topShares = withShares.length > 0 ? toVideoCard(withShares.reduce((b, v) => v.share_count > b.share_count ? v : b)) : null

  const topOfMonth = { topViews, topLikes, topShares, postsThisMonth }

  // ── Últimos 9 videos para grilla ──────────────────────────────────────────
  const recentVideos = videos.slice(0, 9).map(toVideoCard)

  return {
    displayName:    user.display_name           ?? null,
    bioDescription: profileExt.bio_description  ?? null,
    avatarUrl:      user.avatar_url             ?? null,
    isVerified:     profileExt.is_verified      ?? false,
    username:       profileExt.username         ?? null,
    followersCount,
    followingCount,
    likesCount,
    videoCount,
    avgViews,
    avgLikes,
    avgComments,
    avgShares,
    engagementRate,
    postsThisMonth,
    topOfMonth,
    recentVideos,
  }
}

module.exports = { fetchTikTokMetrics }
