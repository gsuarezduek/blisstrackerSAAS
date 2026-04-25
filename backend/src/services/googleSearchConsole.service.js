const axios                = require('axios')
const { getValidAccessToken } = require('./tokenRefresh.service')

// Caché en memoria: 30 min por integración + rango de fechas
const CACHE     = new Map()
const CACHE_TTL = 30 * 60 * 1000

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
    const googleMsg = err.response?.data?.error?.message ?? err.message
    const e = new Error(googleMsg)
    e.httpStatus = err.response?.status
    throw e
  }
}

/**
 * Obtiene todos los datos de Search Console para una integración.
 * Devuelve: overview, topQueries, topPages, devices, countries.
 */
async function fetchSearchConsoleData(integration, siteUrl, startDate, endDate) {
  const cacheKey = `gsc:${integration.id}:${siteUrl}:${startDate}:${endDate}`
  const cached   = CACHE.get(cacheKey)
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data

  const accessToken = await getValidAccessToken(integration)

  const base = { startDate, endDate, type: 'web' }

  const [overviewRows, queriesRows, pagesRows, devicesRows, countriesRows] = await Promise.all([
    // Totales (sin dimensión)
    querySearchConsole(accessToken, siteUrl, { ...base }),
    // Top 10 queries
    querySearchConsole(accessToken, siteUrl, { ...base, dimensions: ['query'],   rowLimit: 10 }),
    // Top 10 páginas
    querySearchConsole(accessToken, siteUrl, { ...base, dimensions: ['page'],    rowLimit: 10 }),
    // Dispositivos
    querySearchConsole(accessToken, siteUrl, { ...base, dimensions: ['device'] }),
    // Top 5 países
    querySearchConsole(accessToken, siteUrl, { ...base, dimensions: ['country'], rowLimit: 5 }),
  ])

  // Totales del período
  const totals = overviewRows[0] ?? {}
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

  const data = { overview, topQueries, topPages, devices, countries, siteUrl, startDate, endDate }

  CACHE.set(cacheKey, { ts: Date.now(), data })
  return data
}

/**
 * Limpia la caché de una integración (llamar tras desconectar).
 */
function clearCache(integrationId) {
  for (const key of CACHE.keys()) {
    if (key.startsWith(`gsc:${integrationId}:`)) CACHE.delete(key)
  }
}

module.exports = { fetchSearchConsoleData, clearCache, querySearchConsole }
