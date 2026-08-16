const axios            = require('axios')
const { encrypt, decrypt } = require('../lib/encryption')
const prisma           = require('../lib/prisma')

const FB_GRAPH = 'https://graph.facebook.com/v21.0'

/**
 * Devuelve un token de Facebook válido para una integración de tipo 'meta_ads'.
 * Extiende automáticamente si quedan ≤10 días para expirar.
 */
async function getValidFbToken(integration) {
  const now       = Date.now()
  const expiresAt = integration.expiresAt?.getTime() ?? null

  // Token permanente (System User Token sin vencimiento) — usar directamente
  if (expiresAt === null) {
    return decrypt(integration.accessToken)
  }

  if (expiresAt < now) {
    throw new Error('El token de Meta Ads expiró. Reconectá la cuenta desde la configuración del proyecto.')
  }

  // Token vigente con más de 10 días — usar directamente
  if (expiresAt - now > 10 * 24 * 60 * 60 * 1000) {
    return decrypt(integration.accessToken)
  }

  // Renovar con fb_exchange_token (tokens OAuth de corta duración)
  const current = decrypt(integration.accessToken)
  const { data } = await axios.get(`${FB_GRAPH}/oauth/access_token`, {
    params: {
      grant_type:        'fb_exchange_token',
      client_id:         process.env.META_APP_ID,
      client_secret:     process.env.META_APP_SECRET,
      fb_exchange_token: current,
    },
  })

  const newToken  = data.access_token
  const expiresIn = data.expires_in ?? 5183944
  const newExpiry = new Date(now + expiresIn * 1000)

  await prisma.projectIntegration.update({
    where: { id: integration.id },
    data:  { accessToken: encrypt(newToken), expiresAt: newExpiry, status: 'active' },
  })

  return newToken
}

const DATE_PRESETS = new Set([
  'today', 'yesterday', 'this_week_mon_today', 'last_7d',
  'last_30d', 'this_month', 'last_month', 'last_90d',
])

// action_types de Meta que razonablemente cuentan como "resultado" (no todo lo que
// devuelve `actions` es un resultado — hay ruido como "page_engagement", "post_reaction").
// El brief de Meta Ads le pregunta al cliente si el objetivo es ventas/leads/mensajes de
// WhatsApp, y estos son justamente esos tres. Curado, no exhaustivo: si un cliente usa un
// action_type fuera de esta lista, no se pierde (queda en `breakdown`), solo no suma al
// número principal `conversions`.
const RESULT_ACTION_TYPES = new Set([
  'lead',
  'offsite_conversion.fb_pixel_lead',
  'onsite_conversion.lead',
  'purchase',
  'offsite_conversion.fb_pixel_purchase',
  'onsite_conversion.purchase',
  'omni_purchase',
  'onsite_conversion.messaging_conversation_started_7d',
  'complete_registration',
  'offsite_conversion.fb_pixel_complete_registration',
])

// Suma los `value` de los action_types "resultado" de un insights row de Meta (`actions`
// = array [{action_type, value}]) y devuelve también el desglose crudo completo, para que
// quien consuma esto (ej. el prompt de un análisis de IA) tenga la data real si el número
// curado no alcanza a explicar el objetivo puntual del cliente.
function extractConversions(actions) {
  if (!Array.isArray(actions) || actions.length === 0) return { conversions: 0, breakdown: [] }
  let conversions = 0
  const breakdown = actions.map(a => {
    const value = parseFloat(a.value ?? 0)
    if (RESULT_ACTION_TYPES.has(a.action_type)) conversions += value
    return { actionType: a.action_type, value }
  })
  return { conversions: Math.round(conversions), breakdown }
}

/**
 * Obtiene métricas de la cuenta publicitaria y sus campañas.
 * @param {string} adAccountId  — e.g. "act_1234567890"
 * @param {string} accessToken
 * @param {string} datePreset   — uno de DATE_PRESETS (ignorado si se pasa dateRange)
 * @param {{ startDate: string, endDate: string }|null} dateRange — rango específico YYYY-MM-DD
 */
async function fetchMetaAdsData(adAccountId, accessToken, datePreset = 'this_month', dateRange = null) {
  if (!dateRange && !DATE_PRESETS.has(datePreset)) datePreset = 'this_month'

  // Parámetros de fecha: date_preset o time_range
  const dateParam = dateRange
    ? { time_range: JSON.stringify({ since: dateRange.startDate, until: dateRange.endDate }) }
    : { date_preset: datePreset }

  // Para el edge de campaigns, construir el string de insights
  const insightsParam = dateRange
    ? `insights.time_range(${JSON.stringify({ since: dateRange.startDate, until: dateRange.endDate })}){spend,reach,impressions,clicks,ctr,actions}`
    : `insights.date_preset(${datePreset}){spend,reach,impressions,clicks,ctr,actions}`

  const [summaryRes, campaignsRes, adsRes] = await Promise.all([
    // Métricas globales de la cuenta
    axios.get(`${FB_GRAPH}/${adAccountId}/insights`, {
      params: {
        fields:       'spend,reach,impressions,clicks,ctr,cpm,cpc,actions',
        ...dateParam,
        access_token: accessToken,
      },
    }),
    // Campañas con métricas incorporadas (edge expansion)
    axios.get(`${FB_GRAPH}/${adAccountId}/campaigns`, {
      params: {
        fields:       `id,name,status,objective,${insightsParam}`,
        limit:        50,
        access_token: accessToken,
      },
    }),
    // Anuncios individuales con creativo (miniatura) + métricas incorporadas.
    // El edge /ads es best-effort: si falla (permiso/rate limit) seguimos sin topAds.
    axios.get(`${FB_GRAPH}/${adAccountId}/ads`, {
      params: {
        fields:       `id,name,effective_status,creative{thumbnail_url},${insightsParam}`,
        limit:        50,
        access_token: accessToken,
      },
    }).catch(err => {
      console.warn('[MetaAds] Edge /ads falló (se omite topAds):', err.response?.data?.error?.message || err.message)
      return null
    }),
  ])

  const summary = summaryRes.data.data?.[0] ?? {}
  const summaryConv = extractConversions(summary.actions)

  const campaigns = (campaignsRes.data.data ?? [])
    .map(c => {
      const spend = parseFloat(c.insights?.data?.[0]?.spend ?? 0)
      const conv  = extractConversions(c.insights?.data?.[0]?.actions)
      return {
        id:               c.id,
        name:             c.name,
        status:           c.status,
        objective:        c.objective ?? null,
        spend,
        reach:            parseInt(  c.insights?.data?.[0]?.reach       ?? 0, 10),
        impressions:      parseInt(  c.insights?.data?.[0]?.impressions ?? 0, 10),
        clicks:           parseInt(  c.insights?.data?.[0]?.clicks      ?? 0, 10),
        ctr:              parseFloat(c.insights?.data?.[0]?.ctr         ?? 0),
        conversions:      conv.conversions,
        costPerConversion: conv.conversions > 0 ? parseFloat((spend / conv.conversions).toFixed(2)) : null,
        resultsBreakdown: conv.breakdown,
      }
    })
    .filter(c => c.spend > 0 || c.status === 'ACTIVE')
    .sort((a, b) => b.spend - a.spend)

  // Anuncios individuales: solo los que tuvieron actividad en el período. Se
  // ordenan por alcance desc; los consumidores derivan "mejor CTR" del array.
  const topAds = (adsRes?.data?.data ?? [])
    .map(a => {
      const spend = parseFloat(a.insights?.data?.[0]?.spend ?? 0)
      const conv  = extractConversions(a.insights?.data?.[0]?.actions)
      return {
        id:               a.id,
        name:             a.name,
        status:           a.effective_status ?? null,
        thumbnailUrl:     a.creative?.thumbnail_url ?? null,
        spend,
        reach:            parseInt(  a.insights?.data?.[0]?.reach       ?? 0, 10),
        impressions:      parseInt(  a.insights?.data?.[0]?.impressions ?? 0, 10),
        clicks:           parseInt(  a.insights?.data?.[0]?.clicks      ?? 0, 10),
        ctr:              parseFloat(a.insights?.data?.[0]?.ctr         ?? 0),
        conversions:      conv.conversions,
        costPerConversion: conv.conversions > 0 ? parseFloat((spend / conv.conversions).toFixed(2)) : null,
        resultsBreakdown: conv.breakdown,
      }
    })
    .filter(a => a.impressions > 0 || a.spend > 0)
    .sort((a, b) => b.reach - a.reach)
    .slice(0, 10)

  return {
    spend:             parseFloat(summary.spend       ?? 0),
    reach:             parseInt(  summary.reach       ?? 0, 10),
    impressions:       parseInt(  summary.impressions ?? 0, 10),
    clicks:            parseInt(  summary.clicks      ?? 0, 10),
    ctr:               parseFloat(summary.ctr         ?? 0),
    cpm:               parseFloat(summary.cpm         ?? 0),
    cpc:               parseFloat(summary.cpc         ?? 0),
    conversions:       summaryConv.conversions,
    costPerConversion: summaryConv.conversions > 0 ? parseFloat((parseFloat(summary.spend ?? 0) / summaryConv.conversions).toFixed(2)) : null,
    resultsBreakdown:  summaryConv.breakdown,
    campaigns,
    topAds,
    datePreset,
  }
}

module.exports = { getValidFbToken, fetchMetaAdsData, extractConversions }
