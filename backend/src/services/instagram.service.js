const axios = require('axios')

const BASE_IGAAM = 'https://graph.instagram.com/v21.0'
const BASE_FB    = 'https://graph.facebook.com/v21.0'

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
/**
 * @param {string}  igUserId     — Instagram User ID (propertyId en ProjectIntegration)
 * @param {string}  accessToken  — Token desencriptado
 * @param {string}  targetMonth  — 'YYYY-MM' opcional; si null usa el mes actual ART
 * @param {boolean} useFbGraph   — true si el token es de Facebook Graph API (Business Manager)
 */
async function fetchInstagramMetrics(igUserId, accessToken, targetMonth = null, useFbGraph = false) {
  const base = useFbGraph ? BASE_FB    : BASE_IGAAM
  const meId = useFbGraph ? igUserId   : 'me'

  const [profileRes, mediaRes] = await Promise.all([
    axios.get(`${base}/${meId}`, {
      params: {
        fields:       'followers_count,media_count,name,username,profile_picture_url,biography,website',
        access_token: accessToken,
      },
    }),
    axios.get(`${base}/${meId}/media`, {
      params: {
        fields:       'id,like_count,comments_count,timestamp,media_type,media_url,thumbnail_url,permalink,caption',
        limit:        100,
        access_token: accessToken,
      },
    }),
  ])

  const profile = profileRes.data
  const media   = mediaRes.data?.data ?? []

  return computeInstagramMetrics(profile, media, targetMonth)
}

/**
 * Calcula el bloque de métricas a partir de un perfil + media ya normalizados.
 * Compartido entre la API oficial (fetchInstagramMetrics) y el scraping (socialScrape.service).
 * @param {object} profile     — { followers_count, media_count, name, username, profile_picture_url, biography, website }
 * @param {Array}  media       — [{ id, like_count, comments_count, timestamp, media_type, media_url, thumbnail_url, permalink, caption }]
 * @param {string} targetMonth — 'YYYY-MM' opcional; si null usa el mes actual ART
 */
function computeInstagramMetrics(profile, media = [], targetMonth = null) {
  const followersCount = profile.followers_count ?? 0
  const mediaCount     = profile.media_count     ?? 0

  // ── Mes a filtrar (ART) ───────────────────────────────────────────────────
  // Si se pasa targetMonth ("YYYY-MM"), filtramos ese mes. Si no, usamos el mes actual.

  const artNow     = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' }))
  const filterMonth = targetMonth ||
    `${artNow.getFullYear()}-${String(artNow.getMonth() + 1).padStart(2, '0')}`

  // Publicaciones del mes objetivo
  const monthPosts        = media.filter(m => {
    if (!m.timestamp) return false
    const artDate  = new Date(new Date(m.timestamp).toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' }))
    const postMonth = `${artDate.getFullYear()}-${String(artDate.getMonth() + 1).padStart(2, '0')}`
    return postMonth === filterMonth
  })
  const monthWithLikes    = monthPosts.filter(m => m.like_count     != null)
  const monthWithComments = monthPosts.filter(m => m.comments_count != null)
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

  // ── Top publicaciones del mes (ranking unificado) ─────────────────────────
  // Score = likes + comments. Si el post no tiene comments, vale solo los likes.
  // Devuelve hasta 3 (#1, #2, #3) ordenadas. bestPost es el #1 (compatibilidad).

  function postScore(m) {
    return (m.like_count ?? 0) + (m.comments_count ?? 0)
  }

  const topRanked = monthPosts
    .filter(m => m.like_count != null || m.comments_count != null)
    .sort((a, b) => postScore(b) - postScore(a))
    .slice(0, 3)

  function toBestPost(m) {
    return {
      id:            m.id,
      likeCount:     m.like_count        ?? null,
      commentsCount: m.comments_count    ?? null,
      imgSrc:        m.thumbnail_url ?? m.media_url ?? null,
      permalink:     m.permalink         ?? null,
      mediaType:     m.media_type        ?? null,
      caption:       m.caption           ?? null,
      timestamp:     m.timestamp         ?? null,
    }
  }

  const topPosts = topRanked.map(toBestPost)
  const bestPost = topPosts[0] ?? null

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
    topPosts,
    byType,
    bestHour,
    recentMedia,
  }
}

module.exports = { fetchInstagramMetrics, computeInstagramMetrics }
