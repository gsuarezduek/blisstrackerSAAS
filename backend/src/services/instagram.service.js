const axios = require('axios')
const { DEFAULT_TZ } = require('../utils/dates')

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
 * @param {object}  opts         — { collabScraper } scraper opcional que devuelve el
 *   media crudo del grid público (`(username) => Promise<Array>`) para sumar las
 *   publicaciones en colaboración que la Graph API NO expone en `/me/media`.
 */
// Trae el perfil + la media cruda de la Graph API (sin computar). Extraído para
// reutilizarlo en el diagnóstico del merge de collabs.
async function fetchInstagramRawMedia(igUserId, accessToken, useFbGraph = false) {
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

  return { base, meId, profile: profileRes.data, media: mediaRes.data?.data ?? [] }
}

async function fetchInstagramMetrics(igUserId, accessToken, targetMonth = null, useFbGraph = false, opts = {}) {
  const { base, meId, profile, media: rawMedia } = await fetchInstagramRawMedia(igUserId, accessToken, useFbGraph)
  let media = rawMedia

  // Insights (requiere instagram_business_manage_insights). Best-effort: si falla
  // —permiso no aprobado, cuenta chica, cambio de versión de API— las métricas
  // básicas (likes/comments/engagement) se devuelven igual y los campos de
  // alcance/guardados/compartidos quedan en null.
  // Se piden ANTES de fusionar collabs: los insights solo aplican a los posts
  // propios (la API oficial); los collabs scrapeados quedan sin insights (null).
  let insights = null
  try {
    insights = await fetchInstagramInsights(base, meId, accessToken, profile, media, targetMonth)
  } catch (err) {
    console.warn('[Instagram] Insights no disponibles:', err.response?.data?.error?.message || err.message)
  }

  // Merge de collabs: el grid público incluye las publicaciones en colaboración que
  // `/me/media` no devuelve al co-autor. Sumamos las que falten (dedup por id/permalink,
  // prioridad a la data oficial) y reordenamos por fecha desc. Best-effort: nunca rompe.
  if (typeof opts.collabScraper === 'function' && profile.username) {
    try {
      const scraped = await opts.collabScraper(profile.username)
      if (Array.isArray(scraped) && scraped.length > 0) {
        media = mergeInstagramMedia(media, scraped)
      }
    } catch (err) {
      console.warn('[Instagram] Scrape de collabs falló, sigo con la media oficial:', err.message)
    }
  }

  return computeInstagramMetrics(profile, media, targetMonth, insights)
}

// Fusiona la media oficial con la scrapeada del grid (collabs), deduplicando por el
// SHORTCODE del permalink (única clave común: la API oficial trae `id` numérico y el
// scrape trae el shortcode como `id`, así que keyear por `id` NO deduplicaría y
// duplicaría cada post). Solo si no hay permalink cae al id. Prioriza la data oficial
// (más rica: insights, media_url estable). Reordena por timestamp descendente.
function shortCodeOf(m) {
  const mt = typeof m.permalink === 'string' ? m.permalink.match(/\/(?:p|reel|tv|reels)\/([^/?#]+)/i) : null
  if (mt) return `sc:${mt[1]}`
  if (m.id) return `id:${m.id}`
  return null
}
function mergeInstagramMedia(official = [], scraped = []) {
  const byKey = new Map()
  for (const m of scraped)  { const k = shortCodeOf(m); if (k) byKey.set(k, m) }
  for (const m of official) { const k = shortCodeOf(m); if (k) byKey.set(k, m) }  // oficial pisa
  const noKey = [...official, ...scraped].filter(m => !shortCodeOf(m))
  return [...byKey.values(), ...noKey].sort((a, b) => {
    const ta = a.timestamp ? new Date(a.timestamp).getTime() : 0
    const tb = b.timestamp ? new Date(b.timestamp).getTime() : 0
    return tb - ta
  })
}

// ── Insights de Instagram ─────────────────────────────────────────────────────
// Devuelve { accountReach, accountViews, mediaInsights } donde mediaInsights es
// un Map(mediaId → { reach, saved, shares, views }). Solo trae insights de las
// publicaciones del mes objetivo (acota el costo de llamadas por-media).

function monthRangeEpoch(filterMonth) {
  const [y, m] = filterMonth.split('-').map(Number)
  const start = Math.floor(Date.UTC(y, m - 1, 1, 3, 0, 0) / 1000)            // 1° del mes 00:00 ART (UTC-3)
  const artNow = new Date(new Date().toLocaleString('en-US', { timeZone: DEFAULT_TZ }))
  const isCurrent = `${artNow.getFullYear()}-${String(artNow.getMonth() + 1).padStart(2, '0')}` === filterMonth
  // Fin: ahora si es el mes en curso; si no, 1° del mes siguiente. La API limita el
  // rango de reach a 30 días, así que para meses largos lo recortamos a 30.
  const naturalEnd = isCurrent
    ? Math.floor(Date.now() / 1000)
    : Math.floor(Date.UTC(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 1, 3, 0, 0) / 1000)
  const cappedEnd = Math.min(naturalEnd, start + 30 * 24 * 60 * 60)
  return { since: start, until: cappedEnd }
}

async function fetchInstagramInsights(base, meId, accessToken, profile, media, targetMonth) {
  const artNow = new Date(new Date().toLocaleString('en-US', { timeZone: DEFAULT_TZ }))
  const filterMonth = targetMonth || `${artNow.getFullYear()}-${String(artNow.getMonth() + 1).padStart(2, '0')}`

  // Publicaciones del mes objetivo (mismo criterio que computeInstagramMetrics).
  const monthPosts = media.filter(m => {
    if (!m.timestamp) return false
    const d = new Date(new Date(m.timestamp).toLocaleString('en-US', { timeZone: DEFAULT_TZ }))
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` === filterMonth
  })

  // ── Insights a nivel cuenta (alcance + vistas del mes) ──
  const { since, until } = monthRangeEpoch(filterMonth)
  let accountReach = null
  let accountViews = null
  try {
    const res = await axios.get(`${base}/${meId}/insights`, {
      params: { metric: 'reach,views', metric_type: 'total_value', period: 'day', since, until, access_token: accessToken },
    })
    for (const row of res.data?.data ?? []) {
      const total = row.total_value?.value ?? null
      if (row.name === 'reach') accountReach = total
      if (row.name === 'views') accountViews = total
    }
  } catch (err) {
    // 'views' no existe en versiones viejas de la API → reintentamos solo reach.
    try {
      const res = await axios.get(`${base}/${meId}/insights`, {
        params: { metric: 'reach', metric_type: 'total_value', period: 'day', since, until, access_token: accessToken },
      })
      accountReach = res.data?.data?.[0]?.total_value?.value ?? null
    } catch { /* sin insights de cuenta */ }
  }

  // ── Insights por publicación (reach/saved/shares/views) ──
  // Concurrencia acotada para no saturar la API.
  const mediaInsights = new Map()
  async function oneMedia(m) {
    try {
      const res = await axios.get(`${base}/${m.id}/insights`, {
        params: { metric: 'reach,saved,shares,views', access_token: accessToken },
      })
      const vals = {}
      for (const row of res.data?.data ?? []) {
        vals[row.name] = row.values?.[0]?.value ?? row.total_value?.value ?? null
      }
      mediaInsights.set(m.id, {
        reach:  vals.reach  ?? null,
        saved:  vals.saved  ?? null,
        shares: vals.shares ?? null,
        views:  vals.views  ?? null,
      })
    } catch { /* este post no expone insights (p.ej. muy viejo) — se omite */ }
  }
  const CONCURRENCY = 5
  for (let i = 0; i < monthPosts.length; i += CONCURRENCY) {
    await Promise.all(monthPosts.slice(i, i + CONCURRENCY).map(oneMedia))
  }

  return { accountReach, accountViews, mediaInsights }
}

/**
 * Calcula el bloque de métricas a partir de un perfil + media ya normalizados.
 * Compartido entre la API oficial (fetchInstagramMetrics) y el scraping (socialScrape.service).
 * @param {object} profile     — { followers_count, media_count, name, username, profile_picture_url, biography, website }
 * @param {Array}  media       — [{ id, like_count, comments_count, timestamp, media_type, media_url, thumbnail_url, permalink, caption }]
 * @param {string} targetMonth — 'YYYY-MM' opcional; si null usa el mes actual ART
 */
function computeInstagramMetrics(profile, media = [], targetMonth = null, insights = null) {
  const followersCount = profile.followers_count ?? 0
  const mediaCount     = profile.media_count     ?? 0
  const mediaInsights  = insights?.mediaInsights ?? null
  const getInsight     = id => (mediaInsights ? mediaInsights.get(id) : null) || {}

  // ── Mes a filtrar (ART) ───────────────────────────────────────────────────
  // Si se pasa targetMonth ("YYYY-MM"), filtramos ese mes. Si no, usamos el mes actual.

  const artNow     = new Date(new Date().toLocaleString('en-US', { timeZone: DEFAULT_TZ }))
  const filterMonth = targetMonth ||
    `${artNow.getFullYear()}-${String(artNow.getMonth() + 1).padStart(2, '0')}`

  // Publicaciones del mes objetivo
  const monthPosts        = media.filter(m => {
    if (!m.timestamp) return false
    const artDate  = new Date(new Date(m.timestamp).toLocaleString('en-US', { timeZone: DEFAULT_TZ }))
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
    const ins = getInsight(m.id)
    return {
      id:            m.id,
      likeCount:     m.like_count        ?? null,
      commentsCount: m.comments_count    ?? null,
      reach:         ins.reach           ?? null,
      saved:         ins.saved           ?? null,
      shares:        ins.shares          ?? null,
      views:         ins.views           ?? null,
      imgSrc:        m.thumbnail_url ?? m.media_url ?? null,
      permalink:     m.permalink         ?? null,
      mediaType:     m.media_type        ?? null,
      caption:       m.caption           ?? null,
      timestamp:     m.timestamp         ?? null,
    }
  }

  const topPosts = topRanked.map(toBestPost)
  const bestPost = topPosts[0] ?? null

  // ── Métricas de Insights del mes (alcance/guardados/compartidos) ──────────────
  // Best-effort: null si no hubo insights (sin permiso, cuenta chica, scraping).
  let reachThisMonth = null, viewsThisMonth = null
  let totalSaved = null, totalShares = null, avgReach = null, bestByReach = null
  if (mediaInsights) {
    reachThisMonth = insights.accountReach ?? null
    viewsThisMonth = insights.accountViews ?? null

    const monthInsights = monthPosts.map(m => ({ m, ins: getInsight(m.id) }))
    const savedVals  = monthInsights.map(x => x.ins.saved ).filter(v => v != null)
    const sharesVals = monthInsights.map(x => x.ins.shares).filter(v => v != null)
    const reachVals  = monthInsights.map(x => x.ins.reach ).filter(v => v != null)
    totalSaved  = savedVals.length  ? savedVals.reduce((s, v) => s + v, 0)  : null
    totalShares = sharesVals.length ? sharesVals.reduce((s, v) => s + v, 0) : null
    avgReach    = reachVals.length  ? parseFloat((reachVals.reduce((s, v) => s + v, 0) / reachVals.length).toFixed(0)) : null

    // Fallback de alcance del mes: si la cuenta no expuso el agregado, sumamos el de
    // los posts (sobrecuenta levemente, pero es mejor que no mostrar nada).
    if (reachThisMonth == null && reachVals.length) reachThisMonth = reachVals.reduce((s, v) => s + v, 0)

    const withReach = monthPosts.filter(m => getInsight(m.id).reach != null)
    if (withReach.length) {
      const top = withReach.sort((a, b) => (getInsight(b.id).reach ?? 0) - (getInsight(a.id).reach ?? 0))[0]
      bestByReach = toBestPost(top)
    }
  }

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
    const local = new Date(new Date(m.timestamp).toLocaleString('en-US', { timeZone: DEFAULT_TZ }))
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
    // Insights (instagram_business_manage_insights) — null si no disponibles
    reachThisMonth,
    viewsThisMonth,
    totalSaved,
    totalShares,
    avgReach,
    bestByReach,
  }
}

module.exports = { fetchInstagramMetrics, computeInstagramMetrics }
