const axios                  = require('axios')
const { getValidAccessToken } = require('./tokenRefresh.service')

const GADS_BASE = 'https://googleads.googleapis.com/v18'

const GAQL_DATE_CLAUSE = {
  today:      'TODAY',
  yesterday:  'YESTERDAY',
  last_7d:    'LAST_7_DAYS',
  last_30d:   'LAST_30_DAYS',
  this_month: 'THIS_MONTH',
  last_month: 'LAST_MONTH',
  last_90d:   'LAST_90_DAYS',
}

const CHANNEL_LABEL = {
  SEARCH:          'Búsqueda',
  DISPLAY:         'Display',
  VIDEO:           'Video',
  SHOPPING:        'Shopping',
  PERFORMANCE_MAX: 'Performance Max',
  MULTI_CHANNEL:   'Universal App',
  SMART:           'Smart',
  LOCAL:           'Local',
  DISCOVERY:       'Discovery',
}

/** Elimina guiones del Customer ID — la API espera solo dígitos */
function normalizeCustomerId(id) {
  return String(id).replace(/-/g, '').trim()
}

/**
 * Obtiene métricas de campañas de Google Ads.
 *
 * @param {object} integration  — registro ProjectIntegration { customerId, accessToken, refreshToken, expiresAt }
 * @param {string} datePreset   — clave de GAQL_DATE_CLAUSE
 * @returns {Promise<object>}
 */
async function fetchGoogleAdsData(integration, datePreset = 'this_month') {
  const accessToken = await getValidAccessToken(integration)
  const customerId  = normalizeCustomerId(integration.customerId)
  const dateClause  = GAQL_DATE_CLAUSE[datePreset] ?? 'THIS_MONTH'
  const devToken    = process.env.GOOGLE_ADS_DEVELOPER_TOKEN

  const query = `
    SELECT
      campaign.id,
      campaign.name,
      campaign.status,
      campaign.advertising_channel_type,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.ctr,
      metrics.conversions,
      metrics.average_cpc
    FROM campaign
    WHERE segments.date DURING ${dateClause}
      AND campaign.status != 'REMOVED'
    ORDER BY metrics.cost_micros DESC
    LIMIT 50
  `

  const { data } = await axios.post(
    `${GADS_BASE}/customers/${customerId}/googleAds:search`,
    { query },
    {
      headers: {
        'Authorization':     `Bearer ${accessToken}`,
        'developer-token':   devToken,
        'login-customer-id': customerId,
        'Content-Type':      'application/json',
      },
    },
  )

  const rows = data.results ?? []

  const campaigns = rows
    .map(row => ({
      id:           row.campaign?.id,
      name:         row.campaign?.name,
      status:       row.campaign?.status,
      channelType:  row.campaign?.advertisingChannelType,
      channelLabel: CHANNEL_LABEL[row.campaign?.advertisingChannelType] ?? row.campaign?.advertisingChannelType,
      impressions:  parseInt(row.metrics?.impressions   ?? 0, 10),
      clicks:       parseInt(row.metrics?.clicks        ?? 0, 10),
      // cost_micros: unidades de moneda × 10^6 → dividir por 1.000.000
      cost:         (parseInt(row.metrics?.costMicros   ?? 0, 10)) / 1_000_000,
      // ctr: ratio decimal (0.05 = 5%) → multiplicar × 100
      ctr:          parseFloat((parseFloat(row.metrics?.ctr ?? 0) * 100).toFixed(2)),
      conversions:  parseFloat(row.metrics?.conversions ?? 0),
      avgCpc:       (parseInt(row.metrics?.averageCpc   ?? 0, 10)) / 1_000_000,
    }))
    .filter(c => c.cost > 0 || c.status === 'ENABLED')

  // Totales de cuenta
  const totalCost        = campaigns.reduce((s, c) => s + c.cost,        0)
  const totalImpressions = campaigns.reduce((s, c) => s + c.impressions, 0)
  const totalClicks      = campaigns.reduce((s, c) => s + c.clicks,      0)
  const totalConversions = campaigns.reduce((s, c) => s + c.conversions, 0)
  const avgCtr = totalImpressions > 0
    ? parseFloat(((totalClicks / totalImpressions) * 100).toFixed(2))
    : 0
  const avgCpc = totalClicks > 0
    ? parseFloat((totalCost / totalClicks).toFixed(4))
    : 0

  return {
    cost:        parseFloat(totalCost.toFixed(2)),
    impressions: totalImpressions,
    clicks:      totalClicks,
    conversions: parseFloat(totalConversions.toFixed(1)),
    ctr:         avgCtr,
    avgCpc:      parseFloat(avgCpc.toFixed(2)),
    campaigns,
    datePreset,
  }
}

module.exports = { fetchGoogleAdsData }
