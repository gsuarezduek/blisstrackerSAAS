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

/**
 * Obtiene métricas de la cuenta publicitaria y sus campañas.
 * @param {string} adAccountId  — e.g. "act_1234567890"
 * @param {string} accessToken
 * @param {string} datePreset   — uno de DATE_PRESETS
 */
async function fetchMetaAdsData(adAccountId, accessToken, datePreset = 'this_month') {
  if (!DATE_PRESETS.has(datePreset)) datePreset = 'this_month'

  const [summaryRes, campaignsRes] = await Promise.all([
    // Métricas globales de la cuenta
    axios.get(`${FB_GRAPH}/${adAccountId}/insights`, {
      params: {
        fields:       'spend,reach,impressions,clicks,ctr,cpm,cpc',
        date_preset:  datePreset,
        access_token: accessToken,
      },
    }),
    // Campañas con métricas incorporadas (edge expansion)
    axios.get(`${FB_GRAPH}/${adAccountId}/campaigns`, {
      params: {
        fields:       `id,name,status,objective,insights.date_preset(${datePreset}){spend,reach,impressions,clicks,ctr}`,
        limit:        50,
        access_token: accessToken,
      },
    }),
  ])

  const summary = summaryRes.data.data?.[0] ?? {}

  const campaigns = (campaignsRes.data.data ?? [])
    .map(c => ({
      id:          c.id,
      name:        c.name,
      status:      c.status,
      objective:   c.objective ?? null,
      spend:       parseFloat(c.insights?.data?.[0]?.spend       ?? 0),
      reach:       parseInt(  c.insights?.data?.[0]?.reach       ?? 0, 10),
      impressions: parseInt(  c.insights?.data?.[0]?.impressions ?? 0, 10),
      clicks:      parseInt(  c.insights?.data?.[0]?.clicks      ?? 0, 10),
      ctr:         parseFloat(c.insights?.data?.[0]?.ctr         ?? 0),
    }))
    .filter(c => c.spend > 0 || c.status === 'ACTIVE')
    .sort((a, b) => b.spend - a.spend)

  return {
    spend:       parseFloat(summary.spend       ?? 0),
    reach:       parseInt(  summary.reach       ?? 0, 10),
    impressions: parseInt(  summary.impressions ?? 0, 10),
    clicks:      parseInt(  summary.clicks      ?? 0, 10),
    ctr:         parseFloat(summary.ctr         ?? 0),
    cpm:         parseFloat(summary.cpm         ?? 0),
    cpc:         parseFloat(summary.cpc         ?? 0),
    campaigns,
    datePreset,
  }
}

module.exports = { getValidFbToken, fetchMetaAdsData }
