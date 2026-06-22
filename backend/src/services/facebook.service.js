const axios = require('axios')

/**
 * Facebook Pages service.
 *
 * Métricas de una Página de Facebook vía Graph API (graph.facebook.com/v21.0),
 * mismo cliente de Meta que Instagram/Meta Ads (META_APP_ID/META_APP_SECRET).
 *
 * Requiere un Page Access Token (se obtiene de /me/accounts o derivado de un
 * System User Token vía /{pageId}?fields=access_token). propertyId = Page ID.
 *
 * Insights de página (/{pageId}/insights) requieren el permiso `read_insights`:
 * son best-effort —si el permiso no está aprobado (App Review pendiente), las
 * métricas básicas (followers, likes/comments/shares de posts, engagement) se
 * devuelven igual y reach/impresiones/pageViews quedan en null.
 *
 * Devuelve el MISMO shape que computeFacebookScrapeMetrics para compartir vistas,
 * snapshots e informes con el modo scraping.
 */

const GRAPH_BASE = 'https://graph.facebook.com/v21.0'

/**
 * Mes calendario (ART) de un timestamp (ISO string o ms epoch). null si no parsea.
 */
function monthOfTimestamp(ts) {
  if (ts == null) return null
  const d = new Date(new Date(ts).toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' }))
  if (isNaN(d.getTime())) return null
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/**
 * Recorre todas las páginas de un edge de la Graph API siguiendo `paging.next`.
 * El cursor `next` ya trae embebidos access_token/fields/after. Tope de seguridad.
 */
async function fetchAllGraphPages(url, params, cap = 50) {
  const out = []
  let nextUrl = url
  let nextParams = params
  for (let page = 0; nextUrl && page < cap; page++) {
    const { data } = await axios.get(nextUrl, nextParams ? { params: nextParams } : undefined)
    if (Array.isArray(data?.data)) out.push(...data.data)
    nextUrl = data?.paging?.next || null
    nextParams = null
  }
  return out
}

// Suma del conteo de un edge resumido (.summary(true) → summary.total_count).
function summaryCount(edge) {
  if (!edge) return 0
  if (typeof edge.summary?.total_count === 'number') return edge.summary.total_count
  if (Array.isArray(edge.data)) return edge.data.length
  return 0
}

/**
 * Normaliza un post crudo de la Graph API al shape interno de un top post.
 */
function normalizeGraphPost(p) {
  const likes    = summaryCount(p.likes)
  const comments = summaryCount(p.comments)
  const shares   = p.shares?.count ?? 0
  // `reactions` (todas las reacciones) es más representativo que solo `likes`
  // cuando está disponible; si no, usamos likes.
  const reactions = summaryCount(p.reactions)
  const likeLike  = reactions || likes
  return {
    id:          p.id ?? null,
    text:        (p.message ?? '').slice(0, 280),
    likes:       likeLike,
    comments,
    shares,
    reach:       null,
    imgSrc:      p.full_picture ?? null,
    permalink:   p.permalink_url ?? null,
    publishedAt: p.created_time ?? null,
    engagement:  likeLike + comments + shares,
  }
}

/**
 * Insights de página (best-effort). Devuelve { reach, impressions, pageViews }.
 * Cualquier campo no disponible queda en null.
 */
async function fetchPageInsights(pageId, pageToken) {
  try {
    const { data } = await axios.get(`${GRAPH_BASE}/${pageId}/insights`, {
      params: {
        metric:       'page_impressions_unique,page_impressions,page_views_total',
        period:       'days_28',
        access_token: pageToken,
      },
    })
    const byName = {}
    for (const row of data?.data ?? []) {
      const val = row.values?.[row.values.length - 1]?.value
      byName[row.name] = typeof val === 'number' ? val : null
    }
    return {
      reach:       byName.page_impressions_unique ?? null,
      impressions: byName.page_impressions        ?? null,
      pageViews:   byName.page_views_total         ?? null,
    }
  } catch (err) {
    console.warn('[Facebook] Insights no disponibles:', err.response?.data?.error?.message || err.message)
    return { reach: null, impressions: null, pageViews: null }
  }
}

/**
 * Punto de entrada — agrega métricas de una Página para un mes (API oficial).
 * @param {string} pageId    — Page ID (propertyId en ProjectIntegration)
 * @param {string} pageToken — Page Access Token desencriptado
 * @param {string|null} targetMonth — 'YYYY-MM'; null = mes actual ART
 */
async function fetchFacebookMetrics(pageId, pageToken, targetMonth = null) {
  const artNow      = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' }))
  const filterMonth = targetMonth ||
    `${artNow.getFullYear()}-${String(artNow.getMonth() + 1).padStart(2, '0')}`

  // Perfil de la página (followers + page likes)
  const profileRes = await axios.get(`${GRAPH_BASE}/${pageId}`, {
    params: { fields: 'followers_count,fan_count,name', access_token: pageToken },
  })
  const profile = profileRes.data ?? {}

  // Posts del mes (paginado). reactions/likes/comments con summary; shares con count.
  let posts = []
  try {
    posts = await fetchAllGraphPages(`${GRAPH_BASE}/${pageId}/published_posts`, {
      fields:       'message,created_time,permalink_url,full_picture,shares,reactions.summary(true),likes.summary(true),comments.summary(true)',
      limit:        50,
      access_token: pageToken,
    }, 6)
  } catch (err) {
    // Algunas páginas/permites no exponen published_posts → caer a /posts (público)
    try {
      posts = await fetchAllGraphPages(`${GRAPH_BASE}/${pageId}/posts`, {
        fields:       'message,created_time,permalink_url,full_picture,shares,reactions.summary(true),likes.summary(true),comments.summary(true)',
        limit:        50,
        access_token: pageToken,
      }, 6)
    } catch (err2) {
      console.warn('[Facebook] No se pudieron traer posts:', err2.response?.data?.error?.message || err2.message)
    }
  }

  const normalized = posts.map(normalizeGraphPost)
  const inMonth    = normalized.filter(p => p.publishedAt && monthOfTimestamp(p.publishedAt) === filterMonth)
  const insights   = await fetchPageInsights(pageId, pageToken)

  return computeFacebookMetrics(
    {
      id:              String(profile.id ?? pageId),
      name:            profile.name ?? null,
      followers_count: profile.followers_count ?? profile.fan_count ?? 0,
      fan_count:       profile.fan_count ?? null,
    },
    inMonth,
    { ...insights, scraped: false },
  )
}

/**
 * Calcula el bloque de métricas a partir de un perfil + posts del mes ya
 * normalizados. Compartido por la API oficial (con insights) y el scraping (sin).
 * @param {object} profile — { id, name, followers_count, fan_count }
 * @param {Array}  inMonthPosts — posts del mes target (shape normalizeGraphPost)
 * @param {object} extra — { reach, impressions, pageViews, scraped }
 */
function computeFacebookMetrics(profile, inMonthPosts = [], extra = {}) {
  const followersCount = profile?.followers_count ?? 0
  const fanCount       = profile?.fan_count ?? null
  const inMonth        = Array.isArray(inMonthPosts) ? inMonthPosts : []
  const postsThisMonth = inMonth.length

  const sum = (field) => inMonth.reduce((acc, p) => acc + (p[field] ?? 0), 0)
  const totalLikes    = postsThisMonth ? sum('likes')    : null
  const totalComments = postsThisMonth ? sum('comments') : null
  const totalShares   = postsThisMonth ? sum('shares')   : null

  // Engagement rate "por seguidores": engagement promedio por post / seguidores.
  const totalEngagement = (totalLikes ?? 0) + (totalComments ?? 0) + (totalShares ?? 0)
  const engagementRate = followersCount && postsThisMonth
    ? parseFloat(((totalEngagement / postsThisMonth) / followersCount * 100).toFixed(2))
    : null

  const topPosts = inMonth
    .map(p => ({
      id:          p.id ?? p.permalink ?? null,
      text:        (p.text ?? '').slice(0, 280),
      likes:       p.likes ?? null,
      comments:    p.comments ?? null,
      shares:      p.shares ?? null,
      reach:       p.reach ?? null,
      engagement:  (p.likes ?? 0) + (p.comments ?? 0) + (p.shares ?? 0),
      publishedAt: p.publishedAt ?? null,
      permalink:   p.permalink ?? null,
      imgSrc:      p.imgSrc ?? null,
    }))
    .sort((a, b) => (b.engagement ?? 0) - (a.engagement ?? 0))
    .slice(0, 5)

  return {
    page: { id: profile?.id ?? null, name: profile?.name ?? null },
    followersCount,
    fanCount,
    reach:          extra.reach       ?? null,
    impressions:    extra.impressions ?? null,
    pageViews:      extra.pageViews   ?? null,
    engagementRate,
    totalLikes,
    totalComments,
    totalShares,
    postsThisMonth,
    topPosts,
  }
}

/**
 * Calcula métricas mensuales de una Página a partir de datos PÚBLICOS (scraping).
 * Mismo shape que fetchFacebookMetrics; reach/impressions/pageViews quedan en null.
 * @param {object} profile — { id, followers_count, fan_count, name }
 * @param {Array}  posts   — [{ id, text, likes, comments, shares, timestamp, url, imgSrc }]
 * @param {string|null} targetMonth — 'YYYY-MM' para filtrar al mes; null = todos
 */
function computeFacebookScrapeMetrics(profile, posts, targetMonth = null) {
  const all = Array.isArray(posts) ? posts : []
  const inMonth = (targetMonth
    ? all.filter(p => p.timestamp && monthOfTimestamp(p.timestamp) === targetMonth)
    : all
  ).map(p => ({
    id:          p.id ?? p.url ?? null,
    text:        p.text ?? '',
    likes:       p.likes ?? 0,
    comments:    p.comments ?? 0,
    shares:      p.shares ?? 0,
    reach:       null,
    permalink:   p.url ?? null,
    imgSrc:      p.imgSrc ?? null,
    publishedAt: p.timestamp ?? null,
  }))

  return computeFacebookMetrics(
    {
      id:              profile?.id ?? null,
      name:            profile?.name ?? null,
      followers_count: profile?.followers_count ?? 0,
      fan_count:       profile?.fan_count ?? null,
    },
    inMonth,
    { scraped: true },
  )
}

module.exports = { fetchFacebookMetrics, computeFacebookMetrics, computeFacebookScrapeMetrics }
