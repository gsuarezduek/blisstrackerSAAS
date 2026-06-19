const axios = require('axios')

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

function monthBounds(month) {
  const [y, m] = month.split('-').map(Number)
  const startMs = Date.UTC(y, m - 1, 1, 0, 0, 0, 0)
  const endMs   = Date.UTC(y, m,     1, 0, 0, 0, 0) - 1
  return { startMs, endMs }
}

/**
 * Lista organizaciones donde el usuario autenticado es ADMIN.
 * Devuelve [{ id, name, vanityName, logoUrl }]
 */
async function listAdminOrganizations(accessToken) {
  const res = await axios.get(`${V2_BASE}/organizationalEntityAcls`, {
    params: {
      q:          'roleAssignee',
      role:       'ADMINISTRATOR',
      state:      'APPROVED',
      projection: '(elements*(organizationalTarget~(id,localizedName,vanityName,logoV2(original~:playableStreams))))',
    },
    headers: v2Headers(accessToken),
  })

  const elements = res.data?.elements ?? []
  return elements.map(el => {
    const org = el['organizationalTarget~'] ?? {}
    const logoElems = org.logoV2?.original?.['~']?.elements ?? []
    const logoUrl   = logoElems[0]?.identifiers?.[0]?.identifier ?? null
    return {
      id:         String(org.id),
      name:       org.localizedName ?? null,
      vanityName: org.vanityName    ?? null,
      logoUrl,
    }
  }).filter(o => o.id && o.id !== 'undefined')
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
    console.warn(`[Linkedin] fetchFollowersCount fallback v2:`, err.response?.status ?? err.message)
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
    const res = await axios.get(`${REST_BASE}/organizationPageStatistics`, {
      params: {
        q:                  'organization',
        organization:       `urn:li:organization:${orgId}`,
        'timeIntervals.timeGranularityType': 'MONTH',
        'timeIntervals.timeRange.start':     startMs,
        'timeIntervals.timeRange.end':       endMs,
      },
      headers: restHeaders(accessToken),
    })
    const totals = res.data?.elements?.[0]?.totalPageStatistics?.views ?? {}
    return {
      pageViews:      totals.allPageViews?.pageViews        ?? null,
      uniqueVisitors: totals.allPageViews?.uniquePageViews  ?? null,
    }
  } catch (err) {
    console.warn(`[Linkedin] fetchPageStatistics:`, err.response?.status ?? err.message)
    return { pageViews: null, uniqueVisitors: null }
  }
}

/**
 * Estadísticas agregadas de shares/posts (impresiones, clicks, engagement) para un rango.
 */
async function fetchShareStatistics(orgId, accessToken, startMs, endMs) {
  try {
    const res = await axios.get(`${REST_BASE}/organizationalEntityShareStatistics`, {
      params: {
        q:                                    'organizationalEntity',
        organizationalEntity:                 `urn:li:organization:${orgId}`,
        'timeIntervals.timeGranularityType':  'MONTH',
        'timeIntervals.timeRange.start':      startMs,
        'timeIntervals.timeRange.end':        endMs,
      },
      headers: restHeaders(accessToken),
    })
    const ts = res.data?.elements?.[0]?.totalShareStatistics ?? {}
    const impressions = ts.impressionCount ?? null
    const clicks      = ts.clickCount      ?? null
    const likes       = ts.likeCount       ?? null
    const comments    = ts.commentCount    ?? null
    const shares      = ts.shareCount      ?? null
    const ctr   = impressions && clicks != null    ? parseFloat(((clicks / impressions) * 100).toFixed(2)) : null
    const engagementRate = impressions && (likes != null || comments != null || shares != null)
      ? parseFloat((((likes ?? 0) + (comments ?? 0) + (shares ?? 0)) / impressions * 100).toFixed(2))
      : null
    return { impressions, clicks, ctr, totalLikes: likes, totalComments: comments, totalShares: shares, engagementRate }
  } catch (err) {
    console.warn(`[Linkedin] fetchShareStatistics:`, err.response?.status ?? err.message)
    return { impressions: null, clicks: null, ctr: null, totalLikes: null, totalComments: null, totalShares: null, engagementRate: null }
  }
}

/**
 * Demographics agregados de followers (industry, seniority, function, region).
 */
async function fetchFollowerDemographics(orgId, accessToken) {
  try {
    const res = await axios.get(`${REST_BASE}/organizationalEntityFollowerStatistics`, {
      params: {
        q:                    'organizationalEntity',
        organizationalEntity: `urn:li:organization:${orgId}`,
      },
      headers: restHeaders(accessToken),
    })
    const el = res.data?.elements?.[0] ?? {}

    function summarize(arr, urnKey) {
      if (!Array.isArray(arr)) return []
      return arr
        .map(x => ({
          urn:    x[urnKey],
          count:  x.followerCounts?.organicFollowerCount ?? x.followerCounts?.paidFollowerCount ?? 0,
        }))
        .filter(x => x.count > 0)
        .sort((a, b) => b.count - a.count)
        .slice(0, 8)
    }

    return {
      industry:  summarize(el.followerCountsByIndustry,        'industry'),
      seniority: summarize(el.followerCountsBySeniority,       'seniority'),
      function:  summarize(el.followerCountsByFunction,        'function'),
      region:    summarize(el.followerCountsByGeoCountry,      'geo'),
    }
  } catch (err) {
    console.warn(`[Linkedin] fetchFollowerDemographics:`, err.response?.status ?? err.message)
    return { industry: [], seniority: [], function: [], region: [] }
  }
}

/**
 * Lista los últimos posts de la organización con métricas individuales.
 * Filtra por mes target si se provee.
 */
async function fetchTopPosts(orgId, accessToken, targetMonth = null) {
  try {
    const author = `urn:li:organization:${orgId}`
    const postsRes = await axios.get(`${REST_BASE}/posts`, {
      params: { q: 'author', author, count: 50, sortBy: 'LAST_MODIFIED' },
      headers: restHeaders(accessToken),
    })

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

    // Stats por share (batch — máximo 50 URNs)
    const shareUrns = filtered.map(p => p.id).filter(Boolean).slice(0, 50)
    let statsByUrn = {}
    if (shareUrns.length > 0) {
      try {
        const statsRes = await axios.get(`${REST_BASE}/organizationalEntityShareStatistics`, {
          params: {
            q:                                   'organizationalEntity',
            organizationalEntity:                `urn:li:organization:${orgId}`,
            shares:                              `List(${shareUrns.map(u => encodeURIComponent(u)).join(',')})`,
          },
          headers: restHeaders(accessToken),
        })
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
        console.warn(`[Linkedin] fetchTopPosts stats batch:`, err.response?.status ?? err.message)
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
    console.warn(`[Linkedin] fetchTopPosts:`, err.response?.status ?? err.message)
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
    console.warn(`[Linkedin] fetchOrgInfo:`, err.response?.status ?? err.message)
    return { id: orgId, name: null, vanityName: null, logoUrl: null }
  }
}

/**
 * Punto de entrada — agrega todas las métricas de una organización para un mes.
 * Si no se pasa targetMonth, usa el mes actual (ART).
 */
async function fetchLinkedinMetrics(orgId, accessToken, targetMonth = null) {
  const artNow      = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' }))
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
  const d = new Date(new Date(ts).toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' }))
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
