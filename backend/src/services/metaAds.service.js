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
    const e = new Error('El token de Meta Ads expiró. Reconectá la cuenta desde la configuración del proyecto.')
    e.code = 'TOKEN_EXPIRED'
    throw e
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
      client_id:         process.env.META_ADS_APP_ID,
      client_secret:     process.env.META_ADS_APP_SECRET,
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

// "Compras en el sitio web" del administrador de anuncios = el evento Purchase del píxel.
// Se lee solo este action_type (no `purchase`/`omni_purchase`, que repiten la misma compra
// sumando otros canales) para que el número coincida con la columna "Resultados".
const WEBSITE_PURCHASE = 'offsite_conversion.fb_pixel_purchase'
// Objetivos de campaña de ventas: con alguno de estos activo, 0 compras es un dato (no "no aplica").
const SALES_OBJECTIVES = new Set(['OUTCOME_SALES', 'CONVERSIONS', 'PRODUCT_CATALOG_SALES'])

const actionValue = (list, type) => {
  const hit = Array.isArray(list) ? list.find(a => a.action_type === type) : null
  return hit ? parseFloat(hit.value ?? 0) : null
}

/**
 * Píxeles de Meta asociados a la cuenta publicitaria. Best-effort: null si la consulta
 * falla (permisos), para que quien llama decida con otra señal.
 */
async function fetchAdAccountPixels(adAccountId, accessToken) {
  try {
    const { data } = await axios.get(`${FB_GRAPH}/${adAccountId}/adspixels`, {
      params: { fields: 'id,name,last_fired_time,is_unavailable', limit: 25, access_token: accessToken },
    })
    return (data.data ?? []).filter(p => !p.is_unavailable)
  } catch (err) {
    console.warn('[MetaAds] No se pudieron leer los píxeles de la cuenta:', err.response?.data?.error?.message || err.message)
    return null
  }
}

/**
 * Ventas en el sitio web (evento Purchase del píxel). Devuelve null cuando no aplica: sin
 * píxel en la cuenta, o con píxel pero sin compras ni campañas de ventas en el período
 * (el cliente mide otra cosa, ej. leads). Si no se pudieron leer los píxeles, la señal es
 * que haya eventos del píxel en las acciones del período.
 */
function buildWebsitePurchases({ pixels, summary, campaigns, spend }) {
  const actions   = summary.actions
  const purchases = actionValue(actions, WEBSITE_PURCHASE)
  const hasPixel  = pixels
    ? pixels.length > 0
    : Array.isArray(actions) && actions.some(a => a.action_type?.startsWith('offsite_conversion.fb_pixel_'))
  if (!hasPixel) return null

  const hasSalesCampaign = campaigns.some(c => SALES_OBJECTIVES.has(c.objective))
  if (!purchases && !hasSalesCampaign) return null

  const count = Math.round(purchases ?? 0)
  const value = actionValue(summary.action_values, WEBSITE_PURCHASE)
  return {
    purchases:       count,
    value:           value != null ? parseFloat(value.toFixed(2)) : null,
    costPerPurchase: count > 0 ? parseFloat((spend / count).toFixed(2)) : null,
    roas:            value != null && spend > 0 ? parseFloat((value / spend).toFixed(2)) : null,
    pixel:           pixels?.[0] ? { id: pixels[0].id, name: pixels[0].name, lastFiredTime: pixels[0].last_fired_time ?? null } : null,
  }
}

// Tope de anuncios por consulta en modo "todos" (para no paginar sin fin en cuentas
// enormes). Se piden ordenados por gasto desc, así lo que queda afuera es lo que menos invirtió.
const MAX_ADS = 500
// Sin `allAds` (informes, snapshot, Asesor IA, panel cross-proyecto) alcanza con una página.
const TOP_ADS_PAGE = 25

const sumActions = list => Array.isArray(list)
  ? list.reduce((s, a) => s + parseFloat(a.value ?? 0), 0)
  : 0

/**
 * Anuncios con actividad en el período vía `/insights?level=ad` (solo devuelve los que
 * tuvieron entrega — a diferencia del edge `/ads`, que trae toda la historia de la cuenta),
 * paginando hasta `max`. Después completa estado + miniatura del creativo con `?ids=`
 * (de a 50, el máximo de Graph API). Best-effort: si algo falla devuelve null.
 */
async function fetchAdsInsights(adAccountId, accessToken, dateParam, max) {
  const rows = []
  let url    = `${FB_GRAPH}/${adAccountId}/insights`
  let params = {
    level:        'ad',
    fields:       'ad_id,ad_name,campaign_id,campaign_name,spend,reach,impressions,clicks,ctr,actions,inline_post_engagement,video_play_actions',
    sort:         'spend_descending',
    limit:        Math.min(max, 100),
    ...dateParam,
    access_token: accessToken,
  }
  while (url && rows.length < max) {
    const { data } = await axios.get(url, { params })
    rows.push(...(data.data ?? []))
    url    = data.paging?.next ?? null
    params = undefined // `next` ya trae todos los params (token incluido)
  }
  const ads = rows.slice(0, max)

  // Estado + miniatura: best-effort por lote, un lote que falla deja esos sin imagen.
  const meta = {}
  const ids  = ads.map(a => a.ad_id).filter(Boolean)
  const chunks = []
  for (let i = 0; i < ids.length; i += 50) chunks.push(ids.slice(i, i + 50))
  await Promise.all(chunks.map(chunk =>
    axios.get(FB_GRAPH, {
      params: { ids: chunk.join(','), fields: 'effective_status,creative{thumbnail_url}', access_token: accessToken },
    })
      .then(({ data }) => Object.assign(meta, data))
      .catch(err => console.warn('[MetaAds] Lote de creativos falló:', err.response?.data?.error?.message || err.message))
  ))

  return ads.map(a => ({ ...a, _meta: meta[a.ad_id] ?? {} }))
}

/**
 * Obtiene métricas de la cuenta publicitaria y sus campañas.
 * @param {string} adAccountId  — e.g. "act_1234567890"
 * @param {string} accessToken
 * @param {string} datePreset   — uno de DATE_PRESETS (ignorado si se pasa dateRange)
 * @param {{ startDate: string, endDate: string }|null} dateRange — rango específico YYYY-MM-DD
 * @param {{ allAds?: boolean }} opts — allAds: trae todos los anuncios con actividad (hasta
 *   MAX_ADS) en `ads`; sin él solo la primera página (alcanza para `topAds`).
 */
async function fetchMetaAdsData(adAccountId, accessToken, datePreset = 'this_month', dateRange = null, { allAds = false } = {}) {
  if (!dateRange && !DATE_PRESETS.has(datePreset)) datePreset = 'this_month'

  // Parámetros de fecha: date_preset o time_range
  const dateParam = dateRange
    ? { time_range: JSON.stringify({ since: dateRange.startDate, until: dateRange.endDate }) }
    : { date_preset: datePreset }

  // Para el edge de campaigns, construir el string de insights
  const insightsParam = dateRange
    ? `insights.time_range(${JSON.stringify({ since: dateRange.startDate, until: dateRange.endDate })}){spend,reach,impressions,clicks,ctr,actions}`
    : `insights.date_preset(${datePreset}){spend,reach,impressions,clicks,ctr,actions}`

  const [summaryRes, campaignsRes, adsRes, pixels] = await Promise.all([
    // Métricas globales de la cuenta. `use_unified_attribution_setting` aplica la ventana de
    // atribución de cada conjunto de anuncios, igual que el administrador de anuncios.
    axios.get(`${FB_GRAPH}/${adAccountId}/insights`, {
      params: {
        fields:       'spend,reach,impressions,clicks,ctr,cpm,cpc,actions,action_values',
        use_unified_attribution_setting: true,
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
    // Anuncios individuales con métricas + creativo (miniatura). Best-effort: si
    // falla (permiso/rate limit) seguimos sin anuncios.
    fetchAdsInsights(adAccountId, accessToken, dateParam, allAds ? MAX_ADS : TOP_ADS_PAGE).catch(err => {
      console.warn('[MetaAds] Insights por anuncio fallaron (se omiten anuncios):', err.response?.data?.error?.message || err.message)
      return null
    }),
    fetchAdAccountPixels(adAccountId, accessToken),
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

  // Anuncios individuales: solo los que tuvieron actividad en el período.
  // `ads` va ordenado por alcance desc (el front reordena a gusto); `topAds` son los
  // 10 primeros — lo que consumen informes, snapshot y Asesor IA.
  const ads = (adsRes ?? [])
    .map(a => {
      const spend = parseFloat(a.spend ?? 0)
      const conv  = extractConversions(a.actions)
      return {
        id:               a.ad_id,
        name:             a.ad_name,
        status:           a._meta.effective_status ?? null,
        thumbnailUrl:     a._meta.creative?.thumbnail_url ?? null,
        campaignId:       a.campaign_id ?? null,
        campaignName:     a.campaign_name ?? null,
        spend,
        reach:            parseInt(  a.reach       ?? 0, 10),
        impressions:      parseInt(  a.impressions ?? 0, 10),
        clicks:           parseInt(  a.clicks      ?? 0, 10),
        ctr:              parseFloat(a.ctr         ?? 0),
        // Interacción con la publicación (reacciones, comentarios, compartidos, clics)
        engagement:       parseInt(  a.inline_post_engagement ?? 0, 10),
        videoViews:       Math.round(sumActions(a.video_play_actions)),
        conversions:      conv.conversions,
        costPerConversion: conv.conversions > 0 ? parseFloat((spend / conv.conversions).toFixed(2)) : null,
        resultsBreakdown: conv.breakdown,
      }
    })
    .filter(a => a.impressions > 0 || a.spend > 0)
    .sort((a, b) => b.reach - a.reach)
  const topAds = ads.slice(0, 10)

  const websitePurchases = buildWebsitePurchases({
    pixels, summary, campaigns, spend: parseFloat(summary.spend ?? 0),
  })

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
    // null = no aplica (sin píxel o sin ventas que medir); ver buildWebsitePurchases
    websitePurchases,
    campaigns,
    ads,
    topAds,
    datePreset,
  }
}

module.exports = { getValidFbToken, fetchMetaAdsData, extractConversions, buildWebsitePurchases }
