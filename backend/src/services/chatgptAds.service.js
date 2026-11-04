const axios = require('axios')
const { decrypt } = require('../lib/encryption')
const { dateStringInTz, DEFAULT_TZ } = require('../utils/dates')

// API de anuncios de ChatGPT (OpenAI Ads / Advertiser API).
// Docs: https://developers.openai.com/ads/api-overview
//
// Diferencias de fondo con Meta Ads y Google Ads, que explican por qué este
// servicio no se parece del todo a los otros dos:
//
//  1. NO hay OAuth. La autenticación es una API key que se genera en Ads Manager
//     (ads.openai.com → Settings) y **cada key está scopeada a UNA ad account**:
//     no viaja ningún id de cuenta en la request, la key ES la cuenta. Por eso no
//     hay selector de cuentas (como sí tiene Meta Ads) ni un Customer ID aparte
//     (como Google Ads) — `propertyId` guarda el id que devuelve `GET /ad_account`
//     sólo para mostrarlo, no para pedir datos.
//  2. No hay presets de fecha: todo se pide con un rango explícito. Los presets de
//     la pestaña se resuelven acá (`resolveRange`) en la timezone DE LA CUENTA, que
//     es la que la plataforma usa para facturar y cerrar los días.
//  3. Las métricas de entrega (impresiones/clicks/gasto/CTR/CPC/CPM) y las de
//     conversión viven en endpoints distintos: `GET /ad_account/insights` y
//     `POST /conversions/insights`. Las conversiones son best-effort — una cuenta
//     sin píxel ni eventos configurados no las tiene, y eso no es un error.
const ADS_BASE = 'https://api.ads.openai.com/v1'

// Tope de anuncios en modo "todos" (mismo criterio que googleAds.service.js).
const MAX_ADS = 500
// Tope de entidades por llamada de conversiones (la API no documenta un máximo;
// se recorta para no armar una query gigante en cuentas enormes).
const MAX_CONVERSION_ENTITIES = 200
// Enriquecer el creativo (título, texto, imagen) obliga a una llamada por grupo de
// anuncios, porque `GET /ads` exige `ad_group_id`. Se limita a los grupos de los
// anuncios que realmente se van a mostrar primero.
const MAX_AD_GROUP_LOOKUPS = 12

// Métricas de entrega que se piden explícitamente. Sin `fields[]` la API devuelve
// sólo impresiones + readable_time.
const DELIVERY_FIELDS = ['impressions', 'clicks', 'spend', 'ctr', 'cpc', 'cpm']

// ─── Fechas ───────────────────────────────────────────────────────────────────

function addDays(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + days)
  return dt.toISOString().slice(0, 10)
}

function firstOfMonth(dateStr) { return `${dateStr.slice(0, 7)}-01` }

function lastDayOfMonth(ym) {
  const [y, m] = ym.split('-').map(Number)
  return `${ym}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`
}

/**
 * Preset de la pestaña → rango de fechas, con el MISMO criterio de corte que usan
 * Meta Ads y Google Ads para los mismos botones: las ventanas de "N días" terminan
 * ayer (el día en curso está incompleto) y las de mes/semana llegan hasta hoy.
 *
 * @param {string} preset — today | yesterday | last_7d | last_30d | this_week | this_month | last_month | last_90d
 * @param {string} tz     — timezone de la cuenta publicitaria
 * @returns {{ since: string, until: string }} fechas "YYYY-MM-DD"
 */
function resolveRange(preset, tz = DEFAULT_TZ) {
  const today = dateStringInTz(new Date(), tz)
  const yesterday = addDays(today, -1)

  switch (preset) {
    case 'today':      return { since: today,               until: today }
    case 'yesterday':  return { since: yesterday,           until: yesterday }
    case 'last_7d':    return { since: addDays(today, -7),  until: yesterday }
    case 'last_30d':   return { since: addDays(today, -30), until: yesterday }
    case 'last_90d':   return { since: addDays(today, -90), until: yesterday }
    case 'this_week': {
      const [y, m, d] = today.split('-').map(Number)
      const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay() // 0=domingo
      return { since: addDays(today, -((dow + 6) % 7)), until: today }
    }
    case 'last_month': {
      const prevYm = firstOfMonth(addDays(firstOfMonth(today), -1)).slice(0, 7)
      return { since: `${prevYm}-01`, until: lastDayOfMonth(prevYm) }
    }
    case 'this_month':
    default:
      // Hasta hoy y no hasta fin de mes: pedir días futuros no agrega datos y la
      // API puede rechazar un `until` adelantado.
      return { since: firstOfMonth(today), until: today }
  }
}

// ─── HTTP ─────────────────────────────────────────────────────────────────────

function apiKeyOf(integration) {
  if (!integration?.accessToken) {
    const e = new Error('Falta la API key de ChatGPT Ads en este proyecto.')
    e.code = 'NO_API_KEY'; throw e
  }
  return decrypt(integration.accessToken)
}

function headers(apiKey) {
  return { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' }
}

/**
 * Normaliza los errores de la API a algo que el controller pueda clasificar sin
 * volver a mirar el cuerpo crudo. La API responde `{ error: { message, type, code } }`.
 */
function normalizeError(err, context) {
  const status = err.response?.status
  const apiMsg = err.response?.data?.error?.message || err.message
  const e = new Error(apiMsg)
  e.httpStatus = status ?? null
  e.context = context
  // `status` además de `code` para que los handlers genéricos (ej. el del Asesor IA)
  // lo degraden a un 4xx con el mensaje real en vez de a un 500 opaco.
  e.status = status === 429 ? 429 : 400
  if (status === 401) e.code = 'TOKEN_EXPIRED'
  else if (status === 403) e.code = 'PERMISSION_DENIED'
  else if (status === 404) e.code = 'NOT_FOUND'
  else if (status === 429) e.code = 'RATE_LIMITED'
  else e.code = 'API_ERROR'
  return e
}

async function adsGet(apiKey, path, params, context) {
  try {
    const { data } = await axios.get(`${ADS_BASE}${path}`, {
      headers: headers(apiKey),
      params,
      // Arrays como `fields[]=a&fields[]=b` y objetos JSON ya serializados como
      // string — exactamente el formato de los ejemplos de la doc.
      paramsSerializer: { indexes: null },
      timeout: 30_000,
    })
    return data
  } catch (err) { throw normalizeError(err, context) }
}

async function adsPost(apiKey, path, body, context) {
  try {
    const { data } = await axios.post(`${ADS_BASE}${path}`, body, {
      headers: { ...headers(apiKey), 'Content-Type': 'application/json' },
      timeout: 30_000,
    })
    return data
  } catch (err) { throw normalizeError(err, context) }
}

/**
 * Datos de la cuenta publicitaria a la que pertenece la API key. Es además la
 * forma documentada de validar que la key sirve (la usa el alta de la conexión).
 */
async function fetchAdAccount(apiKey) {
  const data = await adsGet(apiKey, '/ad_account', undefined, 'ad_account')
  return {
    id:       data?.id ?? null,
    name:     data?.account_name || data?.brand_name || data?.name || data?.legal_name || null,
    status:   data?.status ?? null,
    currency: data?.currency_code ?? null,
    timezone: data?.timezone ?? null,
    url:      data?.url ?? null,
  }
}

// ─── Insights ─────────────────────────────────────────────────────────────────

const num = v => (v == null ? null : Number(v))
const int = v => (v == null ? 0 : parseInt(v, 10) || 0)
const money = v => (v == null ? 0 : Math.round(Number(v) * 100) / 100)
// La API devuelve el CTR como ratio (0.0314 = 3,14%); toda la app lo guarda y lo
// muestra como porcentaje.
const pct = v => (v == null ? null : parseFloat((Number(v) * 100).toFixed(2)))

function timeRangeParam({ since, until }, tz) {
  return JSON.stringify({ type: 'date_range', since, until, timezone: tz || DEFAULT_TZ })
}

/**
 * Una tanda de insights de entrega, con el total del período por fila (sin cortar
 * por día) al nivel pedido.
 */
async function deliveryInsights(apiKey, { level, range, tz, fields = [], sortField, limit }) {
  const params = {
    aggregation_level: level,
    time_granularity:  'none',
    'time_ranges[]':   timeRangeParam(range, tz),
    'fields[]':        [...fields, ...DELIVERY_FIELDS],
  }
  if (sortField) params['sort[]'] = JSON.stringify({ field: sortField, direction: 'desc' })
  if (limit) params.limit = limit
  const data = await adsGet(apiKey, '/ad_account/insights', params, `insights:${level}`)
  return data?.data ?? []
}

function deliveryRow(row) {
  return {
    impressions: int(row.impressions),
    clicks:      int(row.clicks),
    cost:        money(row.spend),
    ctr:         pct(row.ctr) ?? 0,
    avgCpc:      num(row.cpc) != null ? parseFloat(Number(row.cpc).toFixed(4)) : null,
    cpm:         num(row.cpm) != null ? parseFloat(Number(row.cpm).toFixed(2)) : null,
  }
}

/**
 * Conversiones del período. Endpoint aparte (POST) y best-effort: una cuenta sin
 * píxel ni eventos configurados simplemente no tiene conversiones, y eso no puede
 * hacer fallar la pestaña entera. Devuelve null si no se pudo traer.
 *
 * @param {string[]|null} entityIds — ids a desglosar; null pide el total sin agrupar.
 */
async function fetchConversions(apiKey, { level, range, entityIds, withEvents = false }) {
  const body = {
    aggregation_level: level,
    time_granularity:  'none',
    time_ranges:       [{ type: 'date_range', since: range.since, until: range.until }],
    group_by_entity:   !!entityIds,
  }
  if (entityIds) body.entity_ids = entityIds.slice(0, MAX_CONVERSION_ENTITIES)
  if (withEvents) body.include = ['attributed_events']
  const data = await adsPost(apiKey, '/conversions/insights', body, `conversions:${level}`)
  return data?.data ?? []
}

function conversionRow(row) {
  if (!row) return { conversions: null, attributedSales: null }
  return {
    conversions:     row.conversions != null ? Number(row.conversions) : null,
    attributedSales: row.order_created_attributed_sales != null
      ? money(row.order_created_attributed_sales)
      : null,
  }
}

// ─── Campañas y creativos ─────────────────────────────────────────────────────

// Estados de la API en minúscula (active | paused | archived). Se suben a
// mayúscula para que compartan vocabulario con Meta (ACTIVE/PAUSED) y Google
// (ENABLED/PAUSED) y el filtro de `AdsBrowser` los reconozca sin tocarlo.
const upperStatus = s => (s ? String(s).toUpperCase() : null)

async function fetchCampaignMeta(apiKey) {
  const data = await adsGet(apiKey, '/campaigns', { limit: 200 }, 'campaigns')
  const map = new Map()
  for (const c of data?.data ?? []) {
    map.set(String(c.id), {
      name:          c.name ?? null,
      status:        upperStatus(c.status),
      objective:     c.objective ?? null,
      reviewStatus:  c.review_status ?? null,
    })
  }
  return map
}

/**
 * Creativos de los anuncios, por grupo. `GET /ads` exige `ad_group_id`, así que
 * esto es una llamada por grupo — acotada a `MAX_AD_GROUP_LOOKUPS` grupos, los de
 * los anuncios que se muestran primero.
 */
async function fetchCreatives(apiKey, adGroupIds) {
  const map = new Map()
  const groups = adGroupIds.slice(0, MAX_AD_GROUP_LOOKUPS)
  const results = await Promise.all(groups.map(id =>
    adsGet(apiKey, '/ads', { ad_group_id: id, limit: 100 }, 'ads')
      .then(d => d?.data ?? [])
      .catch(() => []),
  ))
  for (const ads of results) {
    for (const ad of ads) {
      map.set(String(ad.id), {
        name:         ad.name ?? null,
        status:       upperStatus(ad.status),
        reviewStatus: ad.review_status ?? null,
        headline:     ad.creative?.title ?? null,
        description:  ad.creative?.body ?? null,
        thumbnailUrl: ad.creative?.image_url ?? null,
        targetUrl:    ad.creative?.target_url ?? null,
        creativeType: ad.creative?.type ?? null,
      })
    }
  }
  return map
}

// ─── Entrada principal ────────────────────────────────────────────────────────

/**
 * Métricas de la cuenta de ChatGPT Ads de un proyecto.
 *
 * Devuelve el mismo shape que `fetchGoogleAdsData` (gasto en `cost`, CPC en
 * `avgCpc`, `campaigns`/`ads`/`topAds`) para que todo lo que ya consume anuncios
 * —informe mensual, snapshot, Asesor IA, panel cross-proyecto, objetivos— lo lea
 * sin un caso especial más.
 *
 * @param {object} integration — ProjectIntegration { accessToken (cifrado), propertyId }
 * @param {string} datePreset  — clave de `resolveRange`
 * @param {{ since?, until?, startDate?, endDate? }|null} dateRange — rango exacto; gana sobre el preset
 * @param {{ allAds?: boolean }} opts — allAds trae todos los anuncios con actividad
 *   (hasta MAX_ADS); sin él, los 25 con más impresiones (alcanza para `topAds`).
 */
async function fetchChatGptAdsData(integration, datePreset = 'this_month', dateRange = null, { allAds = false } = {}) {
  const apiKey = apiKeyOf(integration)

  // La cuenta primero: su timezone es la base de los rangos (es la que la
  // plataforma usa para cerrar los días y facturar).
  const account = await fetchAdAccount(apiKey)
  const tz = account.timezone || DEFAULT_TZ
  const range = dateRange
    ? { since: dateRange.since ?? dateRange.startDate, until: dateRange.until ?? dateRange.endDate }
    : resolveRange(datePreset, tz)

  const adsLimit = allAds ? MAX_ADS : 25

  const [totalRows, campaignRows, adRows, campaignMeta] = await Promise.all([
    deliveryInsights(apiKey, { level: 'ad_account', range, tz }),
    deliveryInsights(apiKey, { level: 'campaign', range, tz, fields: ['campaign_id', 'campaign_name'], sortField: 'spend', limit: 50 }),
    // Best-effort, igual que la query de anuncios de Google Ads: es la llamada con
    // más parámetros (sort + 5 campos) y, si la API rechaza alguno, la pestaña tiene
    // que seguir mostrando totales y campañas en vez de no mostrar nada.
    deliveryInsights(apiKey, {
      level: 'ad', range, tz,
      fields: ['ad_id', 'ad_name', 'ad_group_id', 'campaign_id', 'campaign_name'],
      sortField: 'impressions', limit: adsLimit,
    }).catch(err => {
      console.warn('[ChatGptAds] Insights de nivel anuncio falló (se sigue sin anuncios):', err.message)
      return []
    }),
    // Estado/objetivo de cada campaña: los insights traen métricas, no el estado.
    fetchCampaignMeta(apiKey).catch(err => {
      console.warn('[ChatGptAds] No se pudo leer /campaigns (se sigue sin estados):', err.message)
      return new Map()
    }),
  ])

  // Conversiones: endpoint aparte, cada tanda aislada. Sin eventos configurados
  // quedan en null (distinto de 0, que sí es un dato).
  const campaignIds = campaignRows.map(r => String(r.campaign_id)).filter(Boolean)
  const adIds       = adRows.map(r => String(r.ad_id)).filter(Boolean)
  const [totalConv, campaignConv, adConv] = await Promise.all([
    fetchConversions(apiKey, { level: 'campaign', range, entityIds: null, withEvents: true })
      .then(rows => rows[0] ?? null).catch(() => null),
    campaignIds.length
      ? fetchConversions(apiKey, { level: 'campaign', range, entityIds: campaignIds }).catch(() => [])
      : Promise.resolve([]),
    adIds.length
      ? fetchConversions(apiKey, { level: 'ad', range, entityIds: adIds }).catch(() => [])
      : Promise.resolve([]),
  ])
  const convByCampaign = new Map((campaignConv ?? []).map(r => [String(r.entity_id), conversionRow(r)]))
  const convByAd       = new Map((adConv ?? []).map(r => [String(r.entity_id), conversionRow(r)]))

  const campaigns = campaignRows.map(row => {
    const id   = String(row.campaign_id)
    const meta = campaignMeta.get(id) ?? {}
    const conv = convByCampaign.get(id) ?? { conversions: null, attributedSales: null }
    return {
      id,
      name:            row.campaign_name || meta.name || id,
      status:          meta.status ?? null,
      channelLabel:    meta.objective ?? null,
      ...deliveryRow(row),
      conversions:     conv.conversions,
      attributedSales: conv.attributedSales,
    }
  }).filter(c => c.cost > 0 || c.impressions > 0 || c.status === 'ACTIVE')

  // Creativos de los anuncios que se van a ver primero (título, texto, imagen).
  const topAdGroupIds = [...new Set(adRows.slice(0, 60).map(r => r.ad_group_id).filter(Boolean).map(String))]
  const creatives = topAdGroupIds.length
    ? await fetchCreatives(apiKey, topAdGroupIds)
    : new Map()

  const ads = adRows.map(row => {
    const id  = String(row.ad_id)
    const cre = creatives.get(id) ?? {}
    const d   = deliveryRow(row)
    const conv = convByAd.get(id) ?? { conversions: null, attributedSales: null }
    return {
      id,
      name:         row.ad_name || cre.name || id,
      type:         cre.creativeType ?? null,
      status:       cre.status ?? null,
      reviewStatus: cre.reviewStatus ?? null,
      campaignId:   row.campaign_id != null ? String(row.campaign_id) : null,
      campaignName: row.campaign_name ?? null,
      adGroupId:    row.ad_group_id != null ? String(row.ad_group_id) : null,
      headline:     cre.headline ?? null,
      description:  cre.description ?? null,
      thumbnailUrl: cre.thumbnailUrl ?? null,
      targetUrl:    cre.targetUrl ?? null,
      ...d,
      conversions:  conv.conversions,
      // Los anuncios de ChatGPT no tienen una métrica de interacción propia:
      // el click ES la interacción (se abre la conversación con el anuncio).
      engagement:   d.clicks,
    }
  }).filter(a => a.impressions > 0 || a.cost > 0)
  const topAds = ads.slice(0, 10)

  // Totales: la fila de nivel cuenta es la autoritativa; si no vino (cuenta sin
  // actividad en el rango), se suman las campañas.
  const totals = totalRows[0]
    ? deliveryRow(totalRows[0])
    : {
        impressions: campaigns.reduce((s, c) => s + c.impressions, 0),
        clicks:      campaigns.reduce((s, c) => s + c.clicks, 0),
        cost:        money(campaigns.reduce((s, c) => s + c.cost, 0)),
        ctr:         0,
        avgCpc:      null,
        cpm:         null,
      }
  if (!totalRows[0] && totals.impressions > 0) {
    totals.ctr = parseFloat(((totals.clicks / totals.impressions) * 100).toFixed(2))
    totals.avgCpc = totals.clicks > 0 ? parseFloat((totals.cost / totals.clicks).toFixed(4)) : null
  }

  const conv = conversionRow(totalConv)
  // Ventas atribuidas: la cantidad sale del evento `order_created` cuando está
  // configurado; el monto, de `order_created_attributed_sales`.
  const orderEvent = (totalConv?.attributed_events ?? []).find(e => e.event_name === 'order_created')

  return {
    cost:        totals.cost,
    impressions: totals.impressions,
    clicks:      totals.clicks,
    ctr:         totals.ctr,
    avgCpc:      totals.avgCpc != null ? parseFloat(totals.avgCpc.toFixed(2)) : null,
    cpm:         totals.cpm,
    conversions: conv.conversions,
    websitePurchases: orderEvent?.attributed_event_count != null
      ? int(orderEvent.attributed_event_count)
      : null,
    websitePurchaseValue: conv.attributedSales,
    roas: conv.attributedSales != null && totals.cost > 0
      ? parseFloat((conv.attributedSales / totals.cost).toFixed(2))
      : null,
    campaigns,
    ads,
    topAds,
    accountName: account.name,
    accountId:   account.id,
    currency:    account.currency,
    timezone:    tz,
    datePreset,
    dateRange:   range,
  }
}

module.exports = {
  fetchChatGptAdsData,
  fetchAdAccount,
  resolveRange,
  ADS_BASE,
  MAX_ADS,
}
