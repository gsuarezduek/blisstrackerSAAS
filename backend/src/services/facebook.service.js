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

// Métricas de página que mapeamos a reach/impressions/pageViews.
// Cada campo lleva una CADENA de candidatos: Meta fue deprecando nombres
// (v21.0 ya rechaza page_impressions / page_impressions_unique con error #100),
// así que probamos en orden y usamos el primero que la Graph API acepte.
// En v21.0 Meta dejó vivas solo las variantes `_organic` (las "a secas" y `_paid`
// devuelven #100). Por eso el candidato primario es la orgánica; las viejas quedan
// como fallback por si alguna página/versión todavía las acepta. Las impresiones/
// alcance resultantes son ORGÁNICOS (lo pago se ve en Meta Ads).
const PAGE_INSIGHT_METRICS = [
  // El alcance a nivel PÁGINA fue deprecado por completo en v21.0 (todas las
  // variantes *_unique dan #100) → se calcula sumando por post (fetchPostsReach).
  { key: 'reach',       candidates: [] },
  { key: 'impressions', candidates: ['page_posts_impressions_organic', 'page_impressions'] },
  { key: 'pageViews',   candidates: ['page_views_total'] },
]
const INSIGHT_PERIOD = 'days_28'
const POST_INSIGHT_PERIOD = 'lifetime'
// Reach por publicación (organic_unique sobrevive a nivel post; unique como fallback).
const POST_REACH_METRICS = ['post_impressions_organic_unique', 'post_impressions_unique']

// Último valor de una serie de insights para una métrica puntual. null si no parsea.
function lastInsightValue(dataRows, metric) {
  const row = (dataRows ?? []).find(r => r.name === metric)
  const val = row?.values?.[row.values.length - 1]?.value
  return typeof val === 'number' ? val : null
}

// Errores transitorios de la Graph API (NO deprecación): conviene reintentar.
function isTransientGraphError(err) {
  const code   = err.response?.data?.error?.code
  const status = err.response?.status
  return code === 1 || code === 2 || code === 4 || code === 17 || code === 341 || (status >= 500)
}

const sleep = ms => new Promise(r => setTimeout(r, ms))

// Pide UNA métrica de insights, con reintentos ante errores transitorios (ej. code 2
// "retry later"). Lanza si la Graph API la rechaza por deprecación/permiso (#100/#200).
async function fetchOneInsight(pageId, pageToken, metric, period = INSIGHT_PERIOD) {
  let lastErr
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const { data } = await axios.get(`${GRAPH_BASE}/${pageId}/insights`, {
        params: { metric, period, access_token: pageToken },
      })
      return lastInsightValue(data?.data, metric)
    } catch (err) {
      lastErr = err
      if (!isTransientGraphError(err) || attempt === 2) throw err
      await sleep(400 * (attempt + 1))
    }
  }
  throw lastErr
}

/**
 * Insights de página (best-effort). Devuelve { reach, impressions, pageViews }.
 *
 * Resiliente a la deprecación de nombres de métricas de Meta: para cada campo
 * recorre su cadena de candidatos y usa el primero que la Graph API acepte (no
 * lanza #100) y que traiga un valor. Cualquier campo sin candidato válido queda
 * en null sin romper los demás.
 */
async function fetchPageInsights(pageId, pageToken) {
  const out = { reach: null, impressions: null, pageViews: null }

  await Promise.all(PAGE_INSIGHT_METRICS.map(async ({ key, candidates }) => {
    for (const metric of candidates) {
      try {
        const v = await fetchOneInsight(pageId, pageToken, metric)
        if (v != null) { out[key] = v; return }
        // métrica válida pero sin dato → seguimos probando candidatos por las dudas
      } catch (err) {
        // nombre inválido/deprecado (#100) → probamos el siguiente candidato
        console.warn(`[Facebook] Insight "${metric}" no disponible:`, err.response?.data?.error?.message || err.message)
      }
    }
  }))
  return out
}

// Insight de UN post (period lifetime). Reintenta transitorios; lanza en #100/permiso.
async function fetchPostInsight(postId, pageToken, metric) {
  let lastErr
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const { data } = await axios.get(`${GRAPH_BASE}/${postId}/insights`, {
        params: { metric, period: POST_INSIGHT_PERIOD, access_token: pageToken },
      })
      return lastInsightValue(data?.data, metric)
    } catch (err) {
      lastErr = err
      if (!isTransientGraphError(err) || attempt === 2) throw err
      await sleep(400 * (attempt + 1))
    }
  }
  throw lastErr
}

/**
 * Alcance del mes aproximado a nivel POST: suma del alcance orgánico único de cada
 * publicación del mes. Meta deprecó el reach a nivel página en v21.0, así que es lo
 * más cercano disponible. Es una SUMA por post → puede contar dos veces a quien vio
 * varias publicaciones (sobreestima el reach único real). Devuelve null si no hay
 * posts con id o ninguna métrica de post es válida.
 */
async function fetchPostsReach(posts, pageToken) {
  const withId = (posts || []).filter(p => p.id)
  if (!withId.length) return null

  // Descubrir el nombre de métrica válido (una sola vez) con el primer post.
  let metric = null
  for (const cand of POST_REACH_METRICS) {
    try {
      await fetchPostInsight(withId[0].id, pageToken, cand)
      metric = cand
      break
    } catch (err) {
      console.warn(`[Facebook] post insight "${cand}" no disponible:`, err.response?.data?.error?.message || err.message)
    }
  }
  if (!metric) return null

  let sum = 0, got = 0
  await Promise.all(withId.map(async p => {
    try {
      const v = await fetchPostInsight(p.id, pageToken, metric)
      if (typeof v === 'number') { sum += v; got++ }
    } catch { /* best-effort por post */ }
  }))
  return got ? sum : null
}

/**
 * Diagnóstico de insights — NO best-effort, devuelve crudo qué dice la Graph API.
 * Usado por el endpoint de debug para entender por qué reach/impressions quedan null.
 */
async function debugPageInsights(pageId, pageToken) {
  const out = { pageId, graphVersion: GRAPH_BASE, period: INSIGHT_PERIOD, tokenInfo: null, combined: null, perMetric: [] }

  // 1) Scopes/validez del token vía debug_token (requiere app token).
  const appId = process.env.META_APP_ID
  const appSecret = process.env.META_APP_SECRET
  if (appId && appSecret) {
    try {
      const { data } = await axios.get(`${GRAPH_BASE}/debug_token`, {
        params: { input_token: pageToken, access_token: `${appId}|${appSecret}` },
      })
      const d = data?.data ?? {}
      out.tokenInfo = {
        type:            d.type ?? null,
        isValid:         d.is_valid ?? null,
        appId:           d.app_id ?? null,
        expiresAt:       d.expires_at ? new Date(d.expires_at * 1000).toISOString() : null,
        scopes:          d.scopes ?? null,
        granularScopes:  d.granular_scopes ?? null,
        hasReadInsights: Array.isArray(d.scopes) ? d.scopes.includes('read_insights') : null,
      }
    } catch (err) {
      out.tokenInfo = { error: err.response?.data?.error?.message || err.message }
    }
  } else {
    out.tokenInfo = { error: 'META_APP_ID/META_APP_SECRET no configurados — no se puede inspeccionar el token.' }
  }

  // 2) Llamada combinada con los candidatos primarios (réplica de la base de producción).
  const primaries = PAGE_INSIGHT_METRICS.map(m => m.candidates[0])
  try {
    const { data } = await axios.get(`${GRAPH_BASE}/${pageId}/insights`, {
      params: { metric: primaries.join(','), period: INSIGHT_PERIOD, access_token: pageToken },
    })
    out.combined = { ok: true, rows: data?.data ?? [] }
  } catch (err) {
    out.combined = {
      ok:      false,
      status:  err.response?.status ?? null,
      error:   err.response?.data?.error?.message || err.message,
      code:    err.response?.data?.error?.code ?? null,
      subcode: err.response?.data?.error?.error_subcode ?? null,
    }
  }

  // 3) Sonda amplia — qué nombres de métrica acepta esta página en v21.0.
  //    Con fallback de período: algunas métricas no soportan days_28.
  const PROBE_METRICS = [
    // impresiones (orgánica es la que sobrevive en v21.0)
    'page_posts_impressions_organic', 'page_posts_impressions', 'page_impressions',
    // alcance / unique (candidatos)
    'page_posts_impressions_organic_unique', 'page_posts_served_impressions_organic_unique',
    'page_impressions_organic_unique_v2', 'page_posts_impressions_unique', 'page_impressions_unique',
    // visitas / engagement / seguidores (contexto)
    'page_views_total', 'page_total_actions', 'page_post_engagements',
    'page_daily_follows_unique', 'page_follows', 'page_fans',
  ]
  const PROBE_PERIODS = ['days_28', 'week', 'day']
  for (const metric of PROBE_METRICS) {
    const entry = { metric }
    for (const period of PROBE_PERIODS) {
      try {
        entry.value  = await fetchOneInsight(pageId, pageToken, metric, period)
        entry.ok     = true
        entry.period = period
        delete entry.error
        delete entry.code
        break
      } catch (err) {
        entry.ok    = false
        entry.error = err.response?.data?.error?.message || err.message
        entry.code  = err.response?.data?.error?.code ?? null
        // nombre inválido (#100 "valid insights metric") → no tiene sentido otro período
        if (entry.code === 100 && /valid insights metric/i.test(entry.error || '')) break
      }
    }
    out.perMetric.push(entry)
  }

  // 4) Sonda a nivel POST — el reach de página está deprecado; lo aproximamos por post.
  try {
    const { data } = await axios.get(`${GRAPH_BASE}/${pageId}/published_posts`, {
      params: { fields: 'id,created_time', limit: 1, access_token: pageToken },
    })
    const post = data?.data?.[0]
    out.postProbe = { postId: post?.id ?? null, metrics: [] }
    if (post?.id) {
      const POST_PROBE = ['post_impressions_organic_unique', 'post_impressions_unique', 'post_impressions_organic', 'post_impressions']
      for (const metric of POST_PROBE) {
        const e = { metric }
        try {
          const { data: pd } = await axios.get(`${GRAPH_BASE}/${post.id}/insights`, {
            params: { metric, period: POST_INSIGHT_PERIOD, access_token: pageToken },
          })
          e.ok = true
          e.value = lastInsightValue(pd?.data, metric)
        } catch (err) {
          e.ok = false
          e.error = err.response?.data?.error?.message || err.message
          e.code  = err.response?.data?.error?.code ?? null
        }
        out.postProbe.metrics.push(e)
      }
    }
  } catch (err) {
    out.postProbe = { error: err.response?.data?.error?.message || err.message }
  }

  return out
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

  // Reach a nivel página está deprecado en v21.0 → lo aproximamos sumando por post.
  if (insights.reach == null) {
    try { insights.reach = await fetchPostsReach(inMonth, pageToken) }
    catch (err) { console.warn('[Facebook] Reach por post falló:', err.response?.data?.error?.message || err.message) }
  }

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
 * Refresco liviano del perfil de la página: una sola llamada a la Graph API
 * (followers + page likes + nombre), sin posts ni insights. Rápida (~0,5s).
 * La usa la carga normal para mantener frescos seguidores/nombre/log diario
 * mientras el resto de las métricas se sirven del snapshot cacheado.
 */
async function fetchFacebookProfile(pageId, pageToken) {
  const { data } = await axios.get(`${GRAPH_BASE}/${pageId}`, {
    params:  { fields: 'followers_count,fan_count,name', access_token: pageToken },
    timeout: 8000,
  })
  return {
    id:             String(data?.id ?? pageId),
    name:           data?.name ?? null,
    followersCount: data?.followers_count ?? data?.fan_count ?? null,
    fanCount:       data?.fan_count ?? null,
  }
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

module.exports = { fetchFacebookMetrics, fetchFacebookProfile, computeFacebookMetrics, computeFacebookScrapeMetrics, debugPageInsights }
