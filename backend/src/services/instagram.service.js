const axios = require('axios')

// Instagram Business Login usa graph.instagram.com (no graph.facebook.com)
const BASE = 'https://graph.instagram.com'

const TYPE_LABEL = {
  IMAGE:          'Imagen',
  VIDEO:          'Video',
  CAROUSEL_ALBUM: 'Carrusel',
}

/**
 * Obtiene métricas de Instagram para un IG Business/Creator Account.
 * Usa graph.instagram.com — flujo Instagram Business Login.
 *
 * @param {string} igUserId    — Instagram User ID (almacenado en integration.propertyId)
 * @param {string} accessToken — Long-lived Instagram token
 * @returns {Promise<object>}
 */
async function fetchInstagramMetrics(igUserId, accessToken) {
  const [profileRes, mediaRes] = await Promise.all([
    axios.get(`${BASE}/me`, {
      params: {
        fields:       'followers_count,media_count,name,username,profile_picture_url,biography,website',
        access_token: accessToken,
      },
    }),
    axios.get(`${BASE}/me/media`, {
      params: {
        fields:       'id,like_count,comments_count,timestamp,media_type,media_url,thumbnail_url,permalink,caption',
        limit:        100,
        access_token: accessToken,
      },
    }),
  ])

  const profile = profileRes.data
  const media   = mediaRes.data?.data ?? []

  const followersCount = profile.followers_count ?? 0
  const mediaCount     = profile.media_count     ?? 0

  // ── Mes actual en horario ART ─────────────────────────────────────────────

  const artNow     = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' }))
  const monthStart = new Date(artNow.getFullYear(), artNow.getMonth(), 1)

  // Publicaciones del mes actual
  const monthPosts        = media.filter(m => m.timestamp && new Date(m.timestamp) >= monthStart)
  const monthWithLikes    = monthPosts.filter(m => m.like_count     != null)
  const monthWithComments = monthPosts.filter(m => m.comments_count != null)
  const monthWithBoth     = monthPosts.filter(m => m.like_count != null && m.comments_count != null)
  const postsThisMonth    = monthPosts.length

  // ── Promedios del mes ─────────────────────────────────────────────────────

  const avgLikes = monthWithLikes.length > 0
    ? parseFloat((monthWithLikes.reduce((s, m) => s + m.like_count, 0) / monthWithLikes.length).toFixed(1))
    : null

  const avgComments = monthWithComments.length > 0
    ? parseFloat((monthWithComments.reduce((s, m) => s + m.comments_count, 0) / monthWithComments.length).toFixed(1))
    : null

  // Engagement rate = (avg_likes + avg_comments) / followers * 100
  const engagementRate = followersCount > 0 && avgLikes != null
    ? parseFloat((((avgLikes ?? 0) + (avgComments ?? 0)) / followersCount * 100).toFixed(2))
    : null

  // ── Mejor publicación del mes ─────────────────────────────────────────────

  const bestPostRaw = monthWithLikes.length > 0
    ? monthWithLikes.reduce((best, m) => m.like_count > best.like_count ? m : best)
    : null

  const bestPost = bestPostRaw ? {
    id:            bestPostRaw.id,
    likeCount:     bestPostRaw.like_count,
    commentsCount: bestPostRaw.comments_count ?? null,
    imgSrc:        bestPostRaw.thumbnail_url ?? bestPostRaw.media_url ?? null,
    permalink:     bestPostRaw.permalink ?? null,
    mediaType:     bestPostRaw.media_type ?? null,
    caption:       bestPostRaw.caption   ?? null,
  } : null

  // ── Breakdown por tipo de contenido (del mes) ─────────────────────────────

  const typeMap = {}
  for (const m of monthWithLikes) {
    const type = m.media_type ?? 'IMAGE'
    if (!typeMap[type]) typeMap[type] = { likes: 0, count: 0 }
    typeMap[type].likes += m.like_count
    typeMap[type].count++
  }
  const byType = Object.entries(typeMap)
    .map(([type, { likes, count }]) => ({
      type,
      label:    TYPE_LABEL[type] ?? type,
      avgLikes: parseFloat((likes / count).toFixed(1)),
      count,
    }))
    .sort((a, b) => b.avgLikes - a.avgLikes)

  // ── Mejor horario (ventanas de 3h en horario ART) ─────────────────────────
  // Usa todos los posts disponibles (hasta 100) para mayor representatividad

  const allWithLikes = media.filter(m => m.like_count != null)
  const hourBuckets = {}
  for (const m of allWithLikes) {
    if (!m.timestamp) continue
    const local = new Date(new Date(m.timestamp).toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' }))
    const bucket = Math.floor(local.getHours() / 3) * 3  // 0, 3, 6, 9, 12, 15, 18, 21
    if (!hourBuckets[bucket]) hourBuckets[bucket] = { likes: 0, count: 0 }
    hourBuckets[bucket].likes += m.like_count
    hourBuckets[bucket].count++
  }
  const bestHour = Object.entries(hourBuckets)
    .map(([h, { likes, count }]) => ({ hour: Number(h), avgLikes: parseFloat((likes / count).toFixed(1)), count }))
    .sort((a, b) => b.avgLikes - a.avgLikes)[0] ?? null

  // ── TOP del mes ────────────────────────────────────────────────────────────

  function toPostCard(m) {
    if (!m) return null
    return {
      id:            m.id,
      mediaType:     m.media_type        ?? 'IMAGE',
      imgSrc:        m.thumbnail_url ?? m.media_url ?? null,
      permalink:     m.permalink         ?? null,
      likeCount:     m.like_count        ?? null,
      commentsCount: m.comments_count    ?? null,
      timestamp:     m.timestamp         ?? null,
      caption:       m.caption           ?? null,
    }
  }

  const topLikes      = monthWithLikes.length    > 0 ? toPostCard(monthWithLikes.reduce((b, m)    => m.like_count > b.like_count ? m : b))        : null
  const topComments   = monthWithComments.length > 0 ? toPostCard(monthWithComments.reduce((b, m) => m.comments_count > b.comments_count ? m : b)) : null
  const topEngagement = monthWithBoth.length     > 0 ? toPostCard(monthWithBoth.reduce((b, m)     => (m.like_count + m.comments_count) > (b.like_count + b.comments_count) ? m : b)) : null

  const topOfMonth = { topLikes, topComments, topEngagement, postsThisMonth }

  // ── Últimas 9 publicaciones para la grilla ────────────────────────────────

  const recentMedia = media.slice(0, 9).map(m => ({
    id:            m.id,
    mediaType:     m.media_type  ?? 'IMAGE',
    imgSrc:        m.thumbnail_url ?? m.media_url ?? null,
    permalink:     m.permalink   ?? null,
    likeCount:     m.like_count  ?? null,
    commentsCount: m.comments_count ?? null,
    timestamp:     m.timestamp   ?? null,
    caption:       m.caption     ?? null,
  }))

  return {
    followersCount,
    mediaCount,
    name:          profile.name                ?? null,
    username:      profile.username            ?? null,
    profilePicUrl: profile.profile_picture_url ?? null,
    biography:     profile.biography           ?? null,
    website:       profile.website             ?? null,
    avgLikes,
    avgComments,
    engagementRate,
    postsThisMonth,
    bestPost,
    byType,
    bestHour,
    topOfMonth,
    recentMedia,
  }
}

module.exports = { fetchInstagramMetrics }
