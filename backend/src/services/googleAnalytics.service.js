const { BetaAnalyticsDataClient } = require('@google-analytics/data')
const { OAuth2Client }            = require('google-auth-library')
const { getValidAccessToken }     = require('./tokenRefresh.service')

// Caché simple en memoria: clave → { data, fetchedAt }
const CACHE     = new Map()
const CACHE_TTL = 30 * 60 * 1000 // 30 minutos

/**
 * Calcula el período anterior equivalente.
 * Soporta formato 'YYYY-MM-DD' y 'NdaysAgo'.
 */
function computePreviousPeriod(startDate, endDate) {
  const daysAgoMatch = startDate.match(/^(\d+)daysAgo$/)
  if (daysAgoMatch) {
    const n = parseInt(daysAgoMatch[1])
    return { startDate: `${n * 2}daysAgo`, endDate: `${n + 1}daysAgo` }
  }
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
 * Calcula delta porcentual entre dos valores.
 */
function pctDelta(curr, prev) {
  if (!prev || prev === 0) return null
  return parseFloat(((curr - prev) / prev * 100).toFixed(1))
}

/**
 * Fetches overview + top pages + canales de tráfico desde GA4.
 *
 * @param {object} integration  — registro de ProjectIntegration
 * @param {string} startDate    — 'NdaysAgo' | 'YYYY-MM-DD'
 * @param {string} endDate      — 'today' | 'YYYY-MM-DD'
 * @param {object} options      — { comparePrevious?: boolean }
 * @returns {Promise<object>}
 */
async function fetchGA4Report(integration, startDate = '30daysAgo', endDate = 'today', options = {}) {
  const { comparePrevious } = options
  const cacheKey = `ga4:${integration.id}:${startDate}:${endDate}:${comparePrevious ? '1' : '0'}`
  const cached   = CACHE.get(cacheKey)
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
    return cached.data
  }

  const accessToken = await getValidAccessToken(integration)

  // Construir OAuth2Client con el access token válido
  const oauth2Client = new OAuth2Client()
  oauth2Client.setCredentials({ access_token: accessToken })

  const analyticsClient = new BetaAnalyticsDataClient({ authClient: oauth2Client })

  // Normalizar: aceptar "349398319" o "properties/349398319"
  const raw = integration.propertyId
  if (!raw) throw new Error('propertyId no configurado para esta integración')
  const property = raw.startsWith('properties/') ? raw : `properties/${raw}`

  const [overviewRes, topPagesRes, channelsRes, devicesRes, conversionsRes, sourcesRes] = await Promise.all([
    analyticsClient.runReport({
      property,
      dateRanges: [{ startDate, endDate }],
      metrics: [
        { name: 'sessions' },
        { name: 'activeUsers' },
        { name: 'newUsers' },
        { name: 'screenPageViews' },
        { name: 'bounceRate' },
        { name: 'averageSessionDuration' },
      ],
    }),
    analyticsClient.runReport({
      property,
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: 'pagePath' }, { name: 'pageTitle' }],
      metrics:    [{ name: 'screenPageViews' }, { name: 'sessions' }],
      orderBys:   [{ metric: { metricName: 'screenPageViews' }, desc: true }],
      limit:      10,
    }),
    analyticsClient.runReport({
      property,
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: 'sessionDefaultChannelGroup' }],
      metrics:    [{ name: 'sessions' }, { name: 'activeUsers' }],
      orderBys:   [{ metric: { metricName: 'sessions' }, desc: true }],
    }),
    analyticsClient.runReport({
      property,
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: 'deviceCategory' }],
      metrics:    [{ name: 'sessions' }, { name: 'activeUsers' }],
      orderBys:   [{ metric: { metricName: 'sessions' }, desc: true }],
    }),
    // Desglose de conversiones (key events) por nombre de evento
    // Nota: no usamos sessionKeyEventRate porque no todos los properties lo soportan
    analyticsClient.runReport({
      property,
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: 'eventName' }],
      metrics:    [{ name: 'conversions' }],
      orderBys:   [{ metric: { metricName: 'conversions' }, desc: true }],
    }).catch(err => {
      console.warn('[GA4] conversions query failed (ignorado):', err.message)
      return [{ rows: [] }]
    }),
    // Fuentes de tráfico detalladas (source + medium)
    analyticsClient.runReport({
      property,
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: 'sessionSource' }, { name: 'sessionMedium' }],
      metrics:    [{ name: 'sessions' }, { name: 'activeUsers' }],
      orderBys:   [{ metric: { metricName: 'sessions' }, desc: true }],
      limit:      10,
    }).catch(err => {
      console.warn('[GA4] trafficSources query failed (ignorado):', err.message)
      return [{ rows: [] }]
    }),
  ])

  const overview = parseOverview(overviewRes[0])

  let comparison = null
  if (comparePrevious) {
    const prev = computePreviousPeriod(startDate, endDate)
    const [prevOverviewRes, prevChannelsRes] = await Promise.all([
      analyticsClient.runReport({
        property,
        dateRanges: [{ startDate: prev.startDate, endDate: prev.endDate }],
        metrics: [
          { name: 'sessions' },
          { name: 'activeUsers' },
          { name: 'newUsers' },
          { name: 'screenPageViews' },
          { name: 'bounceRate' },
          { name: 'averageSessionDuration' },
        ],
      }),
      analyticsClient.runReport({
        property,
        dateRanges: [{ startDate: prev.startDate, endDate: prev.endDate }],
        dimensions: [{ name: 'sessionDefaultChannelGroup' }],
        metrics:    [{ name: 'sessions' }, { name: 'activeUsers' }],
        orderBys:   [{ metric: { metricName: 'sessions' }, desc: true }],
      }),
    ])
    const prevOverview = parseOverview(prevOverviewRes[0])
    comparison = {
      sessionsDelta:             pctDelta(overview.sessions,             prevOverview.sessions),
      activeUsersDelta:          pctDelta(overview.activeUsers,          prevOverview.activeUsers),
      newUsersDelta:             pctDelta(overview.newUsers,             prevOverview.newUsers),
      screenPageViewsDelta:      pctDelta(overview.screenPageViews,      prevOverview.screenPageViews),
      bounceRateDelta:           pctDelta(overview.bounceRate,           prevOverview.bounceRate),
      averageSessionDurationDelta: pctDelta(overview.averageSessionDuration, prevOverview.averageSessionDuration),
      prevOverview,
      prevChannels: parseChannels(prevChannelsRes[0]),
      prevStartDate: prev.startDate,
      prevEndDate:   prev.endDate,
    }
  }

  const totalSessions = overview.sessions || 1
  const result = {
    overview,
    topPages:     parseTopPages(topPagesRes[0]),
    channels:     parseChannels(channelsRes[0]),
    devices:      parseChannels(devicesRes[0]),
    conversions:  parseConversions(conversionsRes),
    trafficSources: parseTrafficSources(sourcesRes, totalSessions),
    comparison,
    propertyId:   property,
    startDate,
    endDate,
    fetchedAt:    new Date().toISOString(),
  }

  CACHE.set(cacheKey, { data: result, fetchedAt: Date.now() })
  return result
}

function parseOverview(response) {
  const row = response.rows?.[0]
  if (!row) return {}
  const names = response.metricHeaders.map(h => h.name)
  return Object.fromEntries(
    names.map((name, i) => [name, parseFloat(row.metricValues[i].value) || 0])
  )
}

function parseTopPages(response) {
  return (response.rows ?? []).map(row => ({
    path:      row.dimensionValues[0].value,
    title:     row.dimensionValues[1].value,
    pageviews: parseInt(row.metricValues[0].value, 10) || 0,
    sessions:  parseInt(row.metricValues[1].value, 10) || 0,
  }))
}

function parseChannels(response) {
  return (response.rows ?? []).map(row => ({
    channel:  row.dimensionValues[0].value,
    sessions: parseInt(row.metricValues[0].value, 10) || 0,
    users:    parseInt(row.metricValues[1].value, 10) || 0,
  }))
}

function parseConversions(response) {
  // La API devuelve [report, metadata, status]; el catch devuelve [{ rows: [] }]
  const rows = response?.[0]?.rows ?? []
  const events = rows
    .map(row => ({
      eventName:   row.dimensionValues?.[0]?.value ?? '',
      conversions: parseInt(row.metricValues?.[0]?.value, 10) || 0,
    }))
    .filter(e => e.eventName && e.conversions > 0)

  return {
    total:          events.reduce((s, e) => s + e.conversions, 0),
    events,
    hasConversions: events.length > 0,
  }
}

function parseTrafficSources(response, totalSessions) {
  // La API devuelve [report, metadata, status]; el catch devuelve [{ rows: [] }]
  const rows = response?.[0]?.rows ?? []
  return rows.map(row => ({
    source:   row.dimensionValues[0].value,
    medium:   row.dimensionValues[1].value,
    sessions: parseInt(row.metricValues[0].value, 10) || 0,
    users:    parseInt(row.metricValues[1].value, 10) || 0,
    pct:      parseFloat(((parseInt(row.metricValues[0].value, 10) / totalSessions) * 100).toFixed(1)),
  }))
}

/**
 * Invalida la caché de un proyecto/período específico (útil tras reconectar).
 */
function invalidateCache(integrationId) {
  for (const key of CACHE.keys()) {
    if (key.startsWith(`ga4:${integrationId}:`)) CACHE.delete(key)
  }
}

module.exports = { fetchGA4Report, invalidateCache }
