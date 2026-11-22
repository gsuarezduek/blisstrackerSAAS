const axios                = require('axios')
const { getValidAccessToken } = require('./tokenRefresh.service')

// Caché en memoria: 30 min por integración + rango de fechas + opciones
const CACHE     = new Map()
const CACHE_TTL = 30 * 60 * 1000

// El mensaje de Google es lo único que distingue un 403 por API deshabilitada de un
// 403 por falta de permisos sobre la propiedad — se preserva tal cual, junto al status.
function toApiError(err) {
  const googleMsg = err.response?.data?.error?.message ?? err.message
  const e = new Error(googleMsg)
  e.httpStatus = err.response?.status
  return e
}

/**
 * Ejecuta una query a la Search Console API.
 * Doc: https://developers.google.com/webmaster-tools/v1/searchanalytics/query
 */
async function querySearchConsole(accessToken, siteUrl, body) {
  const encoded = encodeURIComponent(siteUrl)
  try {
    const { data } = await axios.post(
      `https://searchconsole.googleapis.com/webmasters/v3/sites/${encoded}/searchAnalytics/query`,
      body,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    )
    return data.rows ?? []
  } catch (err) {
    throw toApiError(err)
  }
}

/**
 * Lista las propiedades a las que la cuenta conectada tiene acceso.
 * Doc: https://developers.google.com/webmaster-tools/v1/sites/list
 *
 * `siteUrl` viene con el id EXACTO que espera la API: una propiedad de Dominio se
 * llama `sc-domain:ejemplo.com` y NO responde al prefijo `https://ejemplo.com/`
 * (son dos propiedades distintas, y pedir la que no es da 403).
 */
async function listSites(accessToken) {
  try {
    const { data } = await axios.get(
      'https://searchconsole.googleapis.com/webmasters/v3/sites',
      { headers: { Authorization: `Bearer ${accessToken}` } },
    )
    return (data.siteEntry ?? []).map(s => ({
      siteUrl:         s.siteUrl,
      permissionLevel: s.permissionLevel ?? null,
    }))
  } catch (err) {
    throw toApiError(err)
  }
}

// Google lista las propiedades cuya verificación se perdió, pero devuelve el MISMO
// 403 al consultarlas: hay que mostrarlas marcadas, no ofrecerlas como solución.
const UNVERIFIED_PERMISSION = 'siteUnverifiedUser'

// Host de una propiedad, sea prefijo de URL o propiedad de Dominio. Sin `www.`, que
// en Search Console son propiedades distintas pero para el humano es el mismo sitio.
function siteHost(siteUrl) {
  if (!siteUrl) return null
  const raw = siteUrl.startsWith('sc-domain:')
    ? siteUrl.slice('sc-domain:'.length)
    : (() => { try { return new URL(siteUrl).hostname } catch { return null } })()
  return raw ? raw.toLowerCase().replace(/^www\./, '') : null
}

/**
 * Ordena las propiedades poniendo adelante la que probablemente busca el usuario y
 * marca `matchesProject` para que la UI la señale.
 *
 * Criterio, en orden: coincide con el sitio del proyecto → verificada → propiedad de
 * Dominio (cubre todos los subdominios, y es la que más veces falta al configurar) →
 * alfabético.
 */
function rankSites(sites, websiteUrl) {
  const projectHost = siteHost(websiteUrl)
  return sites
    .map(s => ({
      ...s,
      isDomainProperty: s.siteUrl.startsWith('sc-domain:'),
      verified:         s.permissionLevel !== UNVERIFIED_PERMISSION,
      matchesProject:   !!projectHost && siteHost(s.siteUrl) === projectHost,
    }))
    .sort((a, b) => (
      Number(b.matchesProject)   - Number(a.matchesProject) ||
      Number(b.verified)         - Number(a.verified) ||
      Number(b.isDomainProperty) - Number(a.isDomainProperty) ||
      a.siteUrl.localeCompare(b.siteUrl)
    ))
}

/**
 * Calcula el período anterior equivalente (misma cantidad de días, inmediatamente antes).
 */
function previousPeriod(startDate, endDate) {
  const s    = new Date(startDate)
  const e    = new Date(endDate)
  const days = Math.round((e - s) / 86400000) + 1
  const prevEnd   = new Date(s.getTime() - 86400000)
  const prevStart = new Date(prevEnd.getTime() - (days - 1) * 86400000)
  return {
    startDate: prevStart.toISOString().slice(0, 10),
    endDate:   prevEnd.toISOString().slice(0, 10),
  }
}

/**
 * Obtiene todos los datos de Search Console para una integración.
 * Devuelve: overview, topQueries, topPages, devices, countries, opportunityPages, topQueriesComparison?
 *
 * @param {object} integration
 * @param {string} siteUrl
 * @param {string} startDate  — YYYY-MM-DD
 * @param {string} endDate    — YYYY-MM-DD
 * @param {object} options    — { device?: string, compare?: boolean }
 */
async function fetchSearchConsoleData(integration, siteUrl, startDate, endDate, options = {}) {
  const { device, compare } = options
  const cacheKey = `gsc:${integration.id}:${siteUrl}:${startDate}:${endDate}:${device ?? ''}:${compare ? '1' : '0'}`
  const cached   = CACHE.get(cacheKey)
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data

  const accessToken = await getValidAccessToken(integration)

  // Filtro de dispositivo opcional
  const deviceFilter = device ? {
    dimensionFilterGroups: [{ filters: [{ dimension: 'device', operator: 'equals', expression: device }] }],
  } : {}

  const base = { startDate, endDate, type: 'web', ...deviceFilter }

  // Queries paralelas base + oportunidades (top 25 páginas por impresiones)
  const [overviewRows, queriesRows, pagesRows, devicesRows, countriesRows, oppPagesRows] = await Promise.all([
    querySearchConsole(accessToken, siteUrl, { ...base }),
    querySearchConsole(accessToken, siteUrl, { ...base, dimensions: ['query'],   rowLimit: 10 }),
    querySearchConsole(accessToken, siteUrl, { ...base, dimensions: ['page'],    rowLimit: 10 }),
    querySearchConsole(accessToken, siteUrl, { ...base, dimensions: ['device'] }),
    querySearchConsole(accessToken, siteUrl, { ...base, dimensions: ['country'], rowLimit: 5 }),
    querySearchConsole(accessToken, siteUrl, { ...base, dimensions: ['page'],    rowLimit: 25 }),
  ])

  // Período anterior para comparación (solo si se solicitó)
  let prevQueriesRows = null
  if (compare) {
    const prev     = previousPeriod(startDate, endDate)
    const baseP    = { ...prev, type: 'web', ...deviceFilter }
    prevQueriesRows = await querySearchConsole(accessToken, siteUrl, {
      ...baseP, dimensions: ['query'], rowLimit: 10,
    }).catch(() => [])
  }

  // ── Parsear resultados ──────────────────────────────────────────────────────

  const totals  = overviewRows[0] ?? {}
  const overview = {
    clicks:      totals.clicks      ?? 0,
    impressions: totals.impressions ?? 0,
    ctr:         totals.ctr         ?? 0,
    position:    totals.position    ?? 0,
  }

  const topQueries = queriesRows.map(r => ({
    query:       r.keys[0],
    clicks:      r.clicks,
    impressions: r.impressions,
    ctr:         r.ctr,
    position:    r.position,
  }))

  const topPages = pagesRows.map(r => ({
    page:        r.keys[0],
    clicks:      r.clicks,
    impressions: r.impressions,
    ctr:         r.ctr,
    position:    r.position,
  }))

  const devices = devicesRows.map(r => ({
    device:      r.keys[0],
    clicks:      r.clicks,
    impressions: r.impressions,
  }))

  const countries = countriesRows.map(r => ({
    country:     r.keys[0],
    clicks:      r.clicks,
    impressions: r.impressions,
  }))

  // Páginas con alto potencial: impresiones altas pero CTR bajo (<5%)
  const opportunityPages = oppPagesRows
    .map(r => ({
      page:        r.keys[0],
      impressions: r.impressions,
      clicks:      r.clicks,
      ctr:         r.ctr,
      position:    r.position,
    }))
    .filter(p => p.impressions > 50 && p.ctr < 0.05)
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 10)

  // Comparación de queries con período anterior
  let topQueriesComparison = null
  if (prevQueriesRows) {
    const prevMap = {}
    for (const r of prevQueriesRows) prevMap[r.keys[0]] = r
    topQueriesComparison = topQueries.map(q => {
      const prev = prevMap[q.query]
      return {
        query:         q.query,
        // positivo = posición cayó (número mayor = peor ranking)
        positionDelta: prev != null ? parseFloat((q.position - prev.position).toFixed(2)) : null,
        clicksDelta:   prev != null ? Math.round(q.clicks - prev.clicks)                  : null,
      }
    })
  }

  const data = {
    overview, topQueries, topPages, devices, countries,
    opportunityPages,
    topQueriesComparison,
    siteUrl, startDate, endDate,
  }

  CACHE.set(cacheKey, { ts: Date.now(), data })
  return data
}

/**
 * Obtiene las páginas que rankean para una query específica.
 */
async function fetchQueryPages(accessToken, siteUrl, query, startDate, endDate) {
  const rows = await querySearchConsole(accessToken, siteUrl, {
    startDate, endDate,
    type: 'web',
    dimensions: ['query', 'page'],
    dimensionFilterGroups: [{ filters: [{ dimension: 'query', operator: 'equals', expression: query }] }],
    rowLimit: 5,
  })
  return rows.map(r => ({
    page:        r.keys[1],
    clicks:      r.clicks,
    impressions: r.impressions,
    ctr:         r.ctr,
    position:    r.position,
  }))
}

/**
 * Limpia la caché de una integración (llamar tras desconectar).
 */
function clearCache(integrationId) {
  for (const key of CACHE.keys()) {
    if (key.startsWith(`gsc:${integrationId}:`)) CACHE.delete(key)
  }
}

module.exports = { fetchSearchConsoleData, clearCache, querySearchConsole, fetchQueryPages, listSites, rankSites, siteHost }
