const axios = require('axios')
const { DEFAULT_TZ } = require('../utils/dates')

/**
 * LinkedIn Marketing API service.
 *
 * Endpoints clave (REST API versionada — header LinkedIn-Version requerido):
 *   - /v2/organizationAcls  → orgs donde el user es admin
 *   - /v2/organizations/{id} → metadata (nombre, logo)
 *   - /rest/networkSizes/{urn} → followers count
 *   - /rest/organizationalEntityFollowerStatistics → demographics
 *   - /rest/organizationPageStatistics → page views / visitors
 *   - /rest/organizationalEntityShareStatistics → impresiones / engagement agregado
 *   - /rest/posts → posts (incluye creado por owner=urn:li:organization:{id})
 */

// YYYYMM — LinkedIn soporta cada versión ~12 meses. Configurable por env para
// poder actualizarla sin tocar código si LinkedIn rechaza la versión.
// Verificá la vigente en https://learn.microsoft.com/linkedin/marketing/versioning
const LINKEDIN_API_VERSION = process.env.LINKEDIN_API_VERSION || '202601'
const REST_BASE = 'https://api.linkedin.com/rest'
const V2_BASE   = 'https://api.linkedin.com/v2'

function restHeaders(accessToken) {
  return {
    'Authorization':            `Bearer ${accessToken}`,
    'LinkedIn-Version':         LINKEDIN_API_VERSION,
    'X-Restli-Protocol-Version': '2.0.0',
  }
}

function v2Headers(accessToken) {
  return {
    'Authorization':            `Bearer ${accessToken}`,
    'X-Restli-Protocol-Version': '2.0.0',
  }
}

// Detalle completo de un error de la API de LinkedIn: status + cuerpo de la
// respuesta (donde viene el motivo real del 400/4xx). Para diagnóstico en logs.
function liErrDetail(err) {
  const status = err.response?.status
  const body   = err.response?.data
  const bodyStr = body ? (typeof body === 'string' ? body : JSON.stringify(body)) : (err.message ?? '')
  return `${status ?? '—'} · ${bodyStr}`
}

function monthBounds(month) {
  const [y, m] = month.split('-').map(Number)
  const startMs = Date.UTC(y, m - 1, 1, 0, 0, 0, 0)
  const endMs   = Date.UTC(y, m,     1, 0, 0, 0, 0) - 1
  return { startMs, endMs }
}

// Encoda una URN de organización para usarla como valor de query param.
function encUrn(orgId) { return encodeURIComponent(`urn:li:organization:${orgId}`) }

// GET REST construyendo la query manualmente. La API versionada usa encoding
// Rest.li 2.0: los paréntesis/comas/dos-puntos ESTRUCTURALES de los objetos NO se
// percent-encodean (las URN como valor sí). axios.params encodearía todo y rompe
// el formato → "ILLEGAL_ARGUMENT: Invalid query parameters". Por eso armamos la
// query a mano.
async function restGetRaw(path, queryString, accessToken) {
  return axios.get(`${REST_BASE}/${path}?${queryString}`, { headers: restHeaders(accessToken) })
}

const DAY_MS = 24 * 60 * 60 * 1000

// Parámetro timeIntervals en sintaxis Rest.li 2.0.
// LinkedIn rechaza rangos que terminan en el futuro y, con granularidad MONTH,
// exige que el rango cubra al menos un mes COMPLETO. El mes en curso no cumple
// ninguna de las dos (su fin natural es futuro) → 400 "End time must be greater
// than start time by at least one multiple of the granularity type [MONTH]".
// Solución: si el rango termina en el futuro (= mes en curso, incompleto) caemos
// a granularidad DAY (admite rangos parciales) hasta el último día cerrado
// (00:00 UTC). El llamador suma los buckets, así que el total month-to-date es
// el mismo. Para meses pasados (fin <= ahora) se mantiene MONTH (un solo bucket).
function timeIntervalsParam(startMs, endMs, granularity = 'MONTH') {
  const now = Date.now()
  let g = granularity
  let safeEnd = endMs
  if (endMs > now) {
    if (g === 'MONTH') g = 'DAY'
    safeEnd = Math.floor(now / DAY_MS) * DAY_MS       // último día completo, alineado a 00:00 UTC
    if (safeEnd <= startMs) safeEnd = startMs + DAY_MS // al menos 1 día (los primeros del mes casi no traen datos)
  }
  return `timeIntervals=(timeRange:(start:${startMs},end:${safeEnd}),timeGranularityType:${g})`
}

/**
 * Lista organizaciones donde el usuario autenticado es ADMIN.
 * Devuelve [{ id, name, vanityName, logoUrl }]
 */
async function listAdminOrganizations(accessToken) {
  const res = await axios.get(`${V2_BASE}/organizationalEntityAcls`, {
    params: {
      q:     'roleAssignee',
      role:  'ADMINISTRATOR',
      state: 'APPROVED',
    },
    headers: v2Headers(accessToken),
  })

  const elements = res.data?.elements ?? []
  console.log(`[Linkedin] organizationalEntityAcls: ${elements.length} elemento(s) admin`)

  // El ACL solo trae la URN de la org de forma confiable; la decoración con
  // nombre/logo (organizationalTarget~) suele venir vacía. Resolvemos cada org
  // con fetchOrgInfo (el mismo endpoint /v2/organizations/{id} que SÍ devuelve el
  // nombre cuando se selecciona la página), en paralelo.
  const ids = elements
    .map(el => {
      const rawUrn = typeof el.organizationalTarget === 'string' ? el.organizationalTarget : null
      return rawUrn ? rawUrn.split(':').pop() : null
    })
    .filter(id => id && id !== 'undefined')

  const orgs = await Promise.all(ids.map(id => fetchOrgInfo(id, accessToken)))
  return orgs.filter(o => o.id)
}

/**
 * Obtiene seguidores totales de la organización.
 */
async function fetchFollowersCount(orgId, accessToken) {
  try {
    const urn = encodeURIComponent(`urn:li:organization:${orgId}`)
    const res = await axios.get(`${REST_BASE}/networkSizes/${urn}`, {
      params:  { edgeType: 'CompanyFollowedByMember' },
      headers: restHeaders(accessToken),
    })
    return res.data?.firstDegreeSize ?? null
  } catch (err) {
    console.warn(`[Linkedin] fetchFollowersCount fallback v2:`, liErrDetail(err))
    // Fallback v2 (algunas apps están en API antigua)
    try {
      const urn = encodeURIComponent(`urn:li:organization:${orgId}`)
      const res2 = await axios.get(`${V2_BASE}/networkSizes/${urn}`, {
        params:  { edgeType: 'CompanyFollowedByMember' },
        headers: v2Headers(accessToken),
      })
      return res2.data?.firstDegreeSize ?? null
    } catch { return null }
  }
}

/**
 * Estadísticas agregadas de página (page views, visitors) para un rango.
 */
async function fetchPageStatistics(orgId, accessToken, startMs, endMs) {
  try {
    const query = `q=organization&organization=${encUrn(orgId)}&${timeIntervalsParam(startMs, endMs, 'MONTH')}`
    const res = await restGetRaw('organizationPageStatistics', query, accessToken)
    // Sumamos los buckets (1 si granularidad MONTH; N si LinkedIn devuelve por día).
    const els = res.data?.elements ?? []
    let pageViews = 0, uniqueVisitors = 0, any = false
    for (const el of els) {
      const v = el.totalPageStatistics?.views?.allPageViews ?? {}
      if (v.pageViews != null || v.uniquePageViews != null) any = true
      pageViews      += v.pageViews       ?? 0
      uniqueVisitors += v.uniquePageViews ?? 0
    }
    return { pageViews: any ? pageViews : null, uniqueVisitors: any ? uniqueVisitors : null }
  } catch (err) {
    console.warn(`[Linkedin] fetchPageStatistics:`, liErrDetail(err))
    return { pageViews: null, uniqueVisitors: null }
  }
}

/**
 * Estadísticas agregadas de shares/posts (impresiones, clicks, engagement) para un rango.
 */
async function fetchShareStatistics(orgId, accessToken, startMs, endMs) {
  try {
    const query = `q=organizationalEntity&organizationalEntity=${encUrn(orgId)}&${timeIntervalsParam(startMs, endMs, 'MONTH')}`
    const res = await restGetRaw('organizationalEntityShareStatistics', query, accessToken)
    const els = res.data?.elements ?? []
    let impressions = 0, clicks = 0, likes = 0, comments = 0, shares = 0, any = false
    for (const el of els) {
      const ts = el.totalShareStatistics ?? {}
      if (Object.keys(ts).length) any = true
      impressions += ts.impressionCount ?? 0
      clicks      += ts.clickCount      ?? 0
      likes       += ts.likeCount       ?? 0
      comments    += ts.commentCount    ?? 0
      shares      += ts.shareCount      ?? 0
    }
    if (!any) return { impressions: null, clicks: null, ctr: null, totalLikes: null, totalComments: null, totalShares: null, engagementRate: null }
    const ctr            = impressions ? parseFloat(((clicks / impressions) * 100).toFixed(2)) : null
    const engagementRate = impressions ? parseFloat(((likes + comments + shares) / impressions * 100).toFixed(2)) : null
    return { impressions, clicks, ctr, totalLikes: likes, totalComments: comments, totalShares: shares, engagementRate }
  } catch (err) {
    console.warn(`[Linkedin] fetchShareStatistics:`, liErrDetail(err))
    return { impressions: null, clicks: null, ctr: null, totalLikes: null, totalComments: null, totalShares: null, engagementRate: null }
  }
}

// ── Traducción de URNs de demographics a nombres legibles ────────────────────
// seniority y function son listas estándar de LinkedIn (chicas y estables) → mapa
// estático. industry y geo son catálogos enormes → se resuelven vía API (cacheado).

const SENIORITY_LABELS = {
  1: 'Sin remunerar', 2: 'Pasantía / Trainee', 3: 'Junior', 4: 'Senior',
  5: 'Manager', 6: 'Director', 7: 'VP', 8: 'CXO', 9: 'Socio/a', 10: 'Dueño/a',
}

const FUNCTION_LABELS = {
  1: 'Contabilidad', 2: 'Administración', 3: 'Arte y Diseño', 4: 'Desarrollo de Negocio',
  5: 'Servicios Sociales', 6: 'Consultoría', 7: 'Educación', 8: 'Ingeniería',
  9: 'Emprendimiento', 10: 'Finanzas', 11: 'Salud', 12: 'Recursos Humanos',
  13: 'IT', 14: 'Legal', 15: 'Marketing', 16: 'Medios y Comunicación',
  17: 'Servicios de Protección', 18: 'Operaciones', 19: 'Gestión de Producto',
  20: 'Gestión de Proyectos', 21: 'Compras', 22: 'Calidad (QA)', 23: 'Bienes Raíces',
  24: 'Investigación', 25: 'Ventas', 26: 'Soporte',
}

// Cache de etiquetas resueltas por API (id → nombre|null). null = "ya intentado,
// sin resultado" (no reintentar). El flag *ApiOk se baja si la API falla una vez,
// para no spamear con llamados que no andan en esta app.
const _labelCache = { industry: new Map(), geo: new Map() }
let _industryApiOk = true
let _geoApiOk = true

function urnId(urn) {
  const n = Number(String(urn ?? '').split(':').pop())
  return Number.isFinite(n) ? n : null
}

function summarizeDemo(arr, urnKey) {
  if (!Array.isArray(arr)) return []
  return arr
    .map(x => ({
      urn:   x[urnKey],
      count: x.followerCounts?.organicFollowerCount ?? x.followerCounts?.paidFollowerCount ?? 0,
    }))
    .filter(x => x.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 8)
}

// Resuelve nombres de industrias por batch (/v2/industries). Query manual por el
// encoding Rest.li del locale/ids (axios.params lo rompería).
async function loadIndustries(ids, accessToken, cache) {
  const q   = `ids=List(${ids.join(',')})&locale=(language:en,country:US)`
  const res = await axios.get(`${V2_BASE}/industries?${q}`, { headers: v2Headers(accessToken) })
  const results = res.data?.results ?? res.data?.elements ?? {}
  for (const [id, obj] of Object.entries(results)) {
    const loc  = obj?.name?.localized ?? obj?.name
    const name = (loc && typeof loc === 'object') ? Object.values(loc)[0] : (typeof loc === 'string' ? loc : null)
    cache.set(Number(id), name ?? null)
  }
  ids.forEach(id => { if (!cache.has(id)) cache.set(id, null) })
}

// Resuelve nombres de países/regiones por batch (/rest/geo).
async function loadGeos(ids, accessToken, cache) {
  const res = await restGetRaw('geo', `ids=List(${ids.join(',')})`, accessToken)
  const results = res.data?.results ?? {}
  for (const [id, obj] of Object.entries(results)) {
    const loc  = obj?.defaultLocalizedName?.value ?? obj?.name?.localized
    const name = typeof loc === 'string' ? loc : (loc && typeof loc === 'object' ? Object.values(loc)[0] : null)
    cache.set(Number(id), name ?? null)
  }
  ids.forEach(id => { if (!cache.has(id)) cache.set(id, null) })
}

// Adjunta x.label a cada item de un demographic resuelto por API (industry|geo).
async function attachApiLabels(items, kind, accessToken) {
  if (!items.length) return
  const cache   = _labelCache[kind]
  const missing = [...new Set(items.map(x => urnId(x.urn)).filter(id => id != null && !cache.has(id)))]
  if (missing.length && ((kind === 'industry' && _industryApiOk) || (kind === 'geo' && _geoApiOk))) {
    try {
      if (kind === 'industry') await loadIndustries(missing, accessToken, cache)
      else                     await loadGeos(missing, accessToken, cache)
    } catch (err) {
      console.warn(`[Linkedin] resolución de etiquetas ${kind} falló (se muestran los códigos):`, liErrDetail(err))
      if (kind === 'industry') _industryApiOk = false
      else                     _geoApiOk = false
    }
  }
  items.forEach(x => { x.label = cache.get(urnId(x.urn)) ?? null })
}

/**
 * Demographics agregados de followers (industry, seniority, function, region),
 * con etiquetas legibles (x.label) además de la URN cruda (x.urn).
 */
async function fetchFollowerDemographics(orgId, accessToken) {
  try {
    const query = `q=organizationalEntity&organizationalEntity=${encUrn(orgId)}`
    const res = await restGetRaw('organizationalEntityFollowerStatistics', query, accessToken)
    const el = res.data?.elements?.[0] ?? {}

    const industry  = summarizeDemo(el.followerCountsByIndustry,   'industry')
    const seniority = summarizeDemo(el.followerCountsBySeniority,  'seniority')
    const func      = summarizeDemo(el.followerCountsByFunction,   'function')
    const region    = summarizeDemo(el.followerCountsByGeoCountry, 'geo')

    // Etiquetas: seniority/function por mapa estático; industry/region vía API.
    seniority.forEach(x => { x.label = SENIORITY_LABELS[urnId(x.urn)] ?? null })
    func.forEach(x      => { x.label = FUNCTION_LABELS[urnId(x.urn)]  ?? null })
    await Promise.all([
      attachApiLabels(industry, 'industry', accessToken),
      attachApiLabels(region,   'geo',      accessToken),
    ])

    return { industry, seniority, function: func, region }
  } catch (err) {
    console.warn(`[Linkedin] fetchFollowerDemographics:`, liErrDetail(err))
    return { industry: [], seniority: [], function: [], region: [] }
  }
}

/**
 * Lista los últimos posts de la organización con métricas individuales.
 * Filtra por mes target si se provee.
 */
async function fetchTopPosts(orgId, accessToken, targetMonth = null) {
  try {
    const postsQuery = `q=author&author=${encUrn(orgId)}&count=20`
    const postsRes = await restGetRaw('posts', postsQuery, accessToken)

    const posts = postsRes.data?.elements ?? []
    if (posts.length === 0) return { topPosts: [], postsThisMonth: 0 }

    // Filtrar por mes
    let filtered = posts
    if (targetMonth) {
      const { startMs, endMs } = monthBounds(targetMonth)
      filtered = posts.filter(p => {
        const t = p.createdAt ?? p.firstPublishedAt ?? p.lastModifiedAt
        return t && t >= startMs && t <= endMs
      })
    }

    const postsThisMonth = filtered.length
    if (filtered.length === 0) return { topPosts: [], postsThisMonth }

    // Stats por share (batch — máximo 20 URNs). `shares=List(urn1,urn2)` en
    // sintaxis Rest.li 2.0: el List(...) va crudo, cada URN percent-encodeada.
    const shareUrns = filtered.map(p => p.id).filter(Boolean).slice(0, 20)
    let statsByUrn = {}
    if (shareUrns.length > 0) {
      try {
        const sharesParam = `List(${shareUrns.map(u => encodeURIComponent(u)).join(',')})`
        const statsQuery = `q=organizationalEntity&organizationalEntity=${encUrn(orgId)}&shares=${sharesParam}`
        const statsRes = await restGetRaw('organizationalEntityShareStatistics', statsQuery, accessToken)
        for (const el of (statsRes.data?.elements ?? [])) {
          if (el.share) {
            const ts = el.totalShareStatistics ?? {}
            statsByUrn[el.share] = {
              likes:       ts.likeCount       ?? 0,
              comments:    ts.commentCount    ?? 0,
              shares:      ts.shareCount      ?? 0,
              impressions: ts.impressionCount ?? 0,
              clicks:      ts.clickCount      ?? 0,
            }
          }
        }
      } catch (err) {
        console.warn(`[Linkedin] fetchTopPosts stats batch:`, liErrDetail(err))
      }
    }

    const enriched = filtered.map(p => {
      const stats   = statsByUrn[p.id] ?? {}
      const engagement = (stats.likes ?? 0) + (stats.comments ?? 0) + (stats.shares ?? 0)
      const idPart = p.id?.split(':').pop() ?? null
      return {
        id:           p.id,
        urn:          p.id,
        text:         (p.commentary ?? p.specificContent?.['com.linkedin.ugc.ShareContent']?.shareCommentary?.text ?? '').slice(0, 280),
        likes:        stats.likes        ?? null,
        comments:     stats.comments     ?? null,
        shares:       stats.shares       ?? null,
        impressions:  stats.impressions  ?? null,
        clicks:       stats.clicks       ?? null,
        engagement,
        publishedAt:  p.createdAt        ?? p.firstPublishedAt ?? null,
        url:          idPart ? `https://www.linkedin.com/feed/update/${encodeURIComponent(p.id)}/` : null,
      }
    })

    enriched.sort((a, b) => (b.engagement ?? 0) - (a.engagement ?? 0))
    return { topPosts: enriched.slice(0, 5), postsThisMonth }
  } catch (err) {
    console.warn(`[Linkedin] fetchTopPosts:`, liErrDetail(err))
    return { topPosts: [], postsThisMonth: 0 }
  }
}

/**
 * Obtiene metadata de la organización (nombre, logo, vanity url).
 */
async function fetchOrgInfo(orgId, accessToken) {
  try {
    const res = await axios.get(`${V2_BASE}/organizations/${orgId}`, {
      params:  { projection: '(id,localizedName,vanityName,logoV2(original~:playableStreams))' },
      headers: v2Headers(accessToken),
    })
    const org = res.data ?? {}
    const logoElems = org.logoV2?.original?.['~']?.elements ?? []
    const logoUrl   = logoElems[0]?.identifiers?.[0]?.identifier ?? null
    return {
      id:         String(org.id ?? orgId),
      name:       org.localizedName ?? null,
      vanityName: org.vanityName    ?? null,
      logoUrl,
    }
  } catch (err) {
    console.warn(`[Linkedin] fetchOrgInfo:`, liErrDetail(err))
    return { id: orgId, name: null, vanityName: null, logoUrl: null }
  }
}

/**
 * Punto de entrada — agrega todas las métricas de una organización para un mes.
 * Si no se pasa targetMonth, usa el mes actual (ART).
 */
async function fetchLinkedinMetrics(orgId, accessToken, targetMonth = null) {
  const artNow      = new Date(new Date().toLocaleString('en-US', { timeZone: DEFAULT_TZ }))
  const filterMonth = targetMonth ||
    `${artNow.getFullYear()}-${String(artNow.getMonth() + 1).padStart(2, '0')}`
  const { startMs, endMs } = monthBounds(filterMonth)

  const [orgInfo, followersCount, pageStats, shareStats, demographics, posts] = await Promise.all([
    fetchOrgInfo(orgId, accessToken),
    fetchFollowersCount(orgId, accessToken),
    fetchPageStatistics(orgId, accessToken, startMs, endMs),
    fetchShareStatistics(orgId, accessToken, startMs, endMs),
    fetchFollowerDemographics(orgId, accessToken),
    fetchTopPosts(orgId, accessToken, filterMonth),
  ])

  return {
    org:            orgInfo,
    followersCount,
    pageViews:      pageStats.pageViews,
    uniqueVisitors: pageStats.uniqueVisitors,
    impressions:    shareStats.impressions,
    clicks:         shareStats.clicks,
    ctr:            shareStats.ctr,
    totalLikes:     shareStats.totalLikes,
    totalComments:  shareStats.totalComments,
    totalShares:    shareStats.totalShares,
    engagementRate: shareStats.engagementRate,
    postsThisMonth: posts.postsThisMonth,
    topPosts:       posts.topPosts,
    demographics,
  }
}

/**
 * Mes calendario (ART) de un timestamp (ISO string o ms epoch). null si no parsea.
 */
function monthOfTimestamp(ts) {
  if (ts == null) return null
  const d = new Date(new Date(ts).toLocaleString('en-US', { timeZone: DEFAULT_TZ }))
  if (isNaN(d.getTime())) return null
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/**
 * Calcula métricas mensuales de una Company Page de LinkedIn a partir de datos
 * PÚBLICOS (scraping). Devuelve el MISMO shape que fetchLinkedinMetrics, dejando
 * en null lo que el scraping no puede ver: impresiones, clicks, CTR, page views,
 * visitantes únicos y demographics (eso solo lo da la API oficial al admin).
 *
 * @param {object} profile — { id, followers_count, name, vanityName, logo_url }
 * @param {Array}  posts   — [{ id, urn, text, likes, comments, shares, timestamp, url, imgSrc }]
 * @param {string|null} targetMonth — "YYYY-MM" para filtrar al mes; null = todos
 */
function computeLinkedinScrapeMetrics(profile, posts, targetMonth = null) {
  const followersCount = profile?.followers_count ?? 0
  const all = Array.isArray(posts) ? posts : []

  const inMonth = targetMonth
    ? all.filter(p => p.timestamp && monthOfTimestamp(p.timestamp) === targetMonth)
    : all
  const postsThisMonth = inMonth.length

  const sum = (field) => inMonth.reduce((acc, p) => acc + (p[field] ?? 0), 0)
  const totalLikes    = postsThisMonth ? sum('likes')    : null
  const totalComments = postsThisMonth ? sum('comments') : null
  const totalShares   = postsThisMonth ? sum('shares')   : null

  // Engagement rate "por seguidores": engagement promedio por post / seguidores.
  // El scraping no tiene impresiones, así que esta es la base estándar para orgánico.
  const totalEngagement = (totalLikes ?? 0) + (totalComments ?? 0) + (totalShares ?? 0)
  const engagementRate = followersCount && postsThisMonth
    ? parseFloat(((totalEngagement / postsThisMonth) / followersCount * 100).toFixed(2))
    : null

  const topPosts = inMonth
    .map(p => {
      const engagement = (p.likes ?? 0) + (p.comments ?? 0) + (p.shares ?? 0)
      return {
        id:          p.id ?? p.url ?? null,
        urn:         p.urn ?? null,
        text:        (p.text ?? '').slice(0, 280),
        likes:       p.likes ?? null,
        comments:    p.comments ?? null,
        shares:      p.shares ?? null,
        impressions: null,
        clicks:      null,
        engagement,
        publishedAt: p.timestamp ?? null,
        url:         p.url ?? null,
        imgSrc:      p.imgSrc ?? null,
      }
    })
    .sort((a, b) => (b.engagement ?? 0) - (a.engagement ?? 0))
    .slice(0, 5)

  return {
    org: {
      id:         profile?.id ?? null,
      name:       profile?.name ?? null,
      vanityName: profile?.vanityName ?? null,
      logoUrl:    profile?.logo_url ?? null,
    },
    followersCount,
    pageViews:      null,
    uniqueVisitors: null,
    impressions:    null,
    clicks:         null,
    ctr:            null,
    totalLikes,
    totalComments,
    totalShares,
    engagementRate,
    postsThisMonth,
    topPosts,
    demographics: { industry: [], seniority: [], function: [], region: [] },
  }
}

module.exports = {
  fetchLinkedinMetrics,
  listAdminOrganizations,
  fetchOrgInfo,
  computeLinkedinScrapeMetrics,
}
