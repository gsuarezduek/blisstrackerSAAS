const { BetaAnalyticsDataClient } = require('@google-analytics/data')
const { OAuth2Client }            = require('google-auth-library')
const { getValidAccessToken }     = require('./tokenRefresh.service')

// Caché simple en memoria: clave → { data, fetchedAt }
const CACHE     = new Map()
const CACHE_TTL = 30 * 60 * 1000 // 30 minutos

/**
 * Fetches overview + top pages + canales de tráfico desde GA4.
 *
 * @param {object} integration — registro de ProjectIntegration
 * @param {string} dateRange   — '7daysAgo' | '30daysAgo' | '90daysAgo'
 * @returns {Promise<object>}
 */
async function fetchGA4Report(integration, dateRange = '30daysAgo') {
  const cacheKey = `ga4:${integration.id}:${dateRange}`
  const cached   = CACHE.get(cacheKey)
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
    return cached.data
  }

  const accessToken = await getValidAccessToken(integration)

  // Construir OAuth2Client con el access token válido
  const oauth2Client = new OAuth2Client()
  oauth2Client.setCredentials({ access_token: accessToken })

  const analyticsClient = new BetaAnalyticsDataClient({ authClient: oauth2Client })

  const property = integration.propertyId // e.g. "properties/123456789"
  if (!property) throw new Error('propertyId no configurado para esta integración')

  const [overviewRes, topPagesRes, channelsRes, devicesRes, conversionsRes] = await Promise.all([
    analyticsClient.runReport({
      property,
      dateRanges: [{ startDate: dateRange, endDate: 'today' }],
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
      dateRanges: [{ startDate: dateRange, endDate: 'today' }],
      dimensions: [{ name: 'pagePath' }, { name: 'pageTitle' }],
      metrics:    [{ name: 'screenPageViews' }, { name: 'sessions' }],
      orderBys:   [{ metric: { metricName: 'screenPageViews' }, desc: true }],
      limit:      10,
    }),
    analyticsClient.runReport({
      property,
      dateRanges: [{ startDate: dateRange, endDate: 'today' }],
      dimensions: [{ name: 'sessionDefaultChannelGroup' }],
      metrics:    [{ name: 'sessions' }, { name: 'activeUsers' }],
      orderBys:   [{ metric: { metricName: 'sessions' }, desc: true }],
    }),
    analyticsClient.runReport({
      property,
      dateRanges: [{ startDate: dateRange, endDate: 'today' }],
      dimensions: [{ name: 'deviceCategory' }],
      metrics:    [{ name: 'sessions' }, { name: 'activeUsers' }],
      orderBys:   [{ metric: { metricName: 'sessions' }, desc: true }],
    }),
    // Desglose de conversiones (key events) por nombre de evento
    analyticsClient.runReport({
      property,
      dateRanges: [{ startDate: dateRange, endDate: 'today' }],
      dimensions: [{ name: 'eventName' }],
      metrics:    [{ name: 'conversions' }, { name: 'sessionKeyEventRate' }],
      orderBys:   [{ metric: { metricName: 'conversions' }, desc: true }],
      metricFilter: {
        filter: {
          fieldName: 'conversions',
          numericFilter: {
            operation: 'GREATER_THAN',
            value: { int64Value: '0' },
          },
        },
      },
    }).catch(() => ({ rows: [] })), // algunos properties no tienen este metric — ignorar error
  ])

  const result = {
    overview:     parseOverview(overviewRes[0]),
    topPages:     parseTopPages(topPagesRes[0]),
    channels:     parseChannels(channelsRes[0]),
    devices:      parseChannels(devicesRes[0]),
    conversions:  parseConversions(conversionsRes),
    propertyId:   property,
    dateRange,
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
  // response puede ser el objeto de la API o { rows: [] } si falló
  const rows = response?.rows ?? response?.[0]?.rows ?? []
  const events = rows.map(row => ({
    eventName:       row.dimensionValues?.[0]?.value ?? '',
    conversions:     parseInt(row.metricValues?.[0]?.value, 10) || 0,
    conversionRate:  parseFloat(row.metricValues?.[1]?.value) || 0,
  })).filter(e => e.eventName && e.conversions > 0)

  return {
    total:          events.reduce((s, e) => s + e.conversions, 0),
    events,
    hasConversions: events.length > 0,
  }
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
