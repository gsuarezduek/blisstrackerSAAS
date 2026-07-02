const axios                  = require('axios')
const { getValidAccessToken } = require('./tokenRefresh.service')

// Google Ads API pasó a releases mensuales en 2026; cada versión mayor se sunsetea
// a los ~meses. Si la API responde UNSUPPORTED_VERSION, subir esta versión (ver release notes).
const GADS_BASE = 'https://googleads.googleapis.com/v23'

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
/**
 * @param {object} integration
 * @param {string} datePreset   — clave de GAQL_DATE_CLAUSE (ignorado si se pasa dateRange)
 * @param {{ startDate: string, endDate: string }|null} dateRange — rango específico YYYY-MM-DD
 */
async function fetchGoogleAdsData(integration, datePreset = 'this_month', dateRange = null) {
  const accessToken = await getValidAccessToken(integration)
  const customerId  = normalizeCustomerId(integration.customerId)
  const dateClause  = dateRange
    ? `BETWEEN '${dateRange.startDate}' AND '${dateRange.endDate}'`
    : (GAQL_DATE_CLAUSE[datePreset] ?? 'THIS_MONTH')
  const devToken    = process.env.GOOGLE_ADS_DEVELOPER_TOKEN

  const query = `
    SELECT
      customer.descriptive_name,
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
    WHERE segments.date ${dateRange ? dateClause : `DURING ${dateClause}`}
      AND campaign.status != 'REMOVED'
    ORDER BY metrics.cost_micros DESC
    LIMIT 50
  `

  const headers = {
    'Authorization':     `Bearer ${accessToken}`,
    'developer-token':   devToken,
    // Si la cuenta es cliente de un MCC, login-customer-id debe ser el ID del manager.
    // Se guarda en integration.propertyId; si no está, se usa el propio customerId (cuenta directa).
    'login-customer-id': integration.propertyId
      ? normalizeCustomerId(integration.propertyId)
      : customerId,
    'Content-Type':      'application/json',
  }
  const searchUrl = `${GADS_BASE}/customers/${customerId}/googleAds:search`

  // Query de anuncios individuales (best-effort; si falla seguimos sin topAds).
  // Google Ads no expone "alcance único" (reach) → se ordena por impresiones.
  // En Búsqueda el anuncio es texto (headlines/descriptions); no hay imagen.
  const adsQuery = `
    SELECT
      ad_group_ad.ad.id,
      ad_group_ad.ad.name,
      ad_group_ad.ad.type,
      ad_group_ad.ad.responsive_search_ad.headlines,
      ad_group_ad.ad.responsive_search_ad.descriptions,
      ad_group.name,
      campaign.name,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.ctr,
      metrics.conversions
    FROM ad_group_ad
    WHERE segments.date ${dateRange ? dateClause : `DURING ${dateClause}`}
      AND ad_group_ad.status != 'REMOVED'
    ORDER BY metrics.impressions DESC
    LIMIT 25
  `

  const [{ data }, adsData] = await Promise.all([
    axios.post(searchUrl, { query }, { headers }),
    axios.post(searchUrl, { query: adsQuery }, { headers })
      .then(r => r.data)
      .catch(err => {
        console.warn('[GoogleAds] Query ad_group_ad falló (se omite topAds):', err.response?.data?.error?.message || err.message)
        return null
      }),
  ])

  const rows = data.results ?? []

  // El nombre descriptivo de la cuenta viene en cada fila (recurso customer implícito).
  const customerName = rows.find(r => r.customer?.descriptiveName)?.customer?.descriptiveName ?? null

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

  // Anuncios individuales: preview de texto para Búsqueda (RSA), etiqueta de tipo
  // para el resto. No hay imagen ni reach en Google Ads.
  const topAds = (adsData?.results ?? [])
    .map(row => {
      const ad = row.adGroupAd?.ad ?? {}
      const headlines    = (ad.responsiveSearchAd?.headlines    ?? []).map(h => h.text).filter(Boolean)
      const descriptions = (ad.responsiveSearchAd?.descriptions ?? []).map(d => d.text).filter(Boolean)
      return {
        id:           ad.id,
        name:         ad.name || null,
        type:         ad.type || null,
        adGroupName:  row.adGroup?.name    ?? null,
        campaignName: row.campaign?.name   ?? null,
        // Preview de texto (RSA): hasta 3 títulos + 1 descripción
        headline:     headlines.slice(0, 3).join(' · ') || null,
        description:  descriptions[0]      ?? null,
        impressions:  parseInt(row.metrics?.impressions ?? 0, 10),
        clicks:       parseInt(row.metrics?.clicks      ?? 0, 10),
        cost:         (parseInt(row.metrics?.costMicros ?? 0, 10)) / 1_000_000,
        ctr:          parseFloat((parseFloat(row.metrics?.ctr ?? 0) * 100).toFixed(2)),
        conversions:  parseFloat(row.metrics?.conversions ?? 0),
      }
    })
    .filter(a => a.impressions > 0 || a.cost > 0)
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 10)

  return {
    cost:        parseFloat(totalCost.toFixed(2)),
    impressions: totalImpressions,
    clicks:      totalClicks,
    conversions: parseFloat(totalConversions.toFixed(1)),
    ctr:         avgCtr,
    avgCpc:      parseFloat(avgCpc.toFixed(2)),
    campaigns,
    topAds,
    customerName,
    datePreset,
  }
}

module.exports = { fetchGoogleAdsData }
