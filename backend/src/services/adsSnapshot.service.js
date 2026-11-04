const prisma                         = require('../lib/prisma')
const { getValidFbToken, fetchMetaAdsData }  = require('./metaAds.service')
const { fetchGoogleAdsData }         = require('./googleAds.service')
const { fetchChatGptAdsData }        = require('./chatgptAds.service')
const { cacheImagesInArray }         = require('./socialImageCache.service')
const { DEFAULT_TZ } = require('../utils/dates')

function prevMonthStr() {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: DEFAULT_TZ }))
  const m = now.getMonth() // 0-indexed, so this is the previous month (we want last month)
  const y = now.getFullYear()
  const pm = m === 0 ? 12 : m
  const py = m === 0 ? y - 1 : y
  return `${py}-${String(pm).padStart(2, '0')}`
}

/** Rango de fechas del mes completo "YYYY-MM" (último día incluido). */
function monthRange(month) {
  const [y, m] = month.split('-').map(Number)
  const lastDay = new Date(y, m, 0).getDate()
  return {
    startDate: `${month}-01`,
    endDate:   `${month}-${String(lastDay).padStart(2, '0')}`,
  }
}

/**
 * Guarda un snapshot de Meta Ads para un proyecto y mes específicos.
 */
async function saveMetaAdsSnapshot(projectId, workspaceId, month) {
  const integration = await prisma.projectIntegration.findUnique({
    where: { projectId_type: { projectId, type: 'meta_ads' } },
  })
  if (!integration || integration.status !== 'active') {
    throw new Error(`Proyecto ${projectId}: sin integración Meta Ads activa`)
  }

  const dateRange = monthRange(month)

  const token = await getValidFbToken(integration)
  const data  = await fetchMetaAdsData(integration.propertyId, token, 'this_month', dateRange)

  // Top 5 campañas por gasto
  const topCampaigns = (data.campaigns ?? []).slice(0, 5).map(c => ({
    id:          c.id,
    name:        c.name,
    spend:       c.spend,
    impressions: c.impressions,
    clicks:      c.clicks,
    ctr:         c.ctr,
    reach:       c.reach ?? null,
  }))

  // Top 5 anuncios (por alcance) con la miniatura del creativo cacheada — las
  // thumbnail_url de Meta vencen, así que las persistimos como SocialImage/R2.
  const topAds = await cacheImagesInArray(
    (data.topAds ?? []).slice(0, 5),
    'thumbnailUrl',
    workspaceId,
  )

  await prisma.adsSnapshot.upsert({
    where: { projectId_month_type: { projectId, month, type: 'meta_ads' } },
    update: {
      spend:         data.spend,
      impressions:   data.impressions,
      clicks:        data.clicks,
      ctr:           data.ctr,
      reach:         data.reach   ?? null,
      cpm:           data.cpm     ?? null,
      cpc:           data.cpc     ?? null,
      conversions:   data.conversions ?? null,
      websitePurchases:     data.websitePurchases?.purchases ?? null,
      websitePurchaseValue: data.websitePurchases?.value ?? null,
      topCampaigns:  JSON.stringify(topCampaigns),
      topAds:        JSON.stringify(topAds),
      campaignsCount: topCampaigns.length,
    },
    create: {
      workspaceId,
      projectId,
      month,
      type:          'meta_ads',
      spend:         data.spend,
      impressions:   data.impressions,
      clicks:        data.clicks,
      ctr:           data.ctr,
      reach:         data.reach   ?? null,
      cpm:           data.cpm     ?? null,
      cpc:           data.cpc     ?? null,
      conversions:   data.conversions ?? null,
      websitePurchases:     data.websitePurchases?.purchases ?? null,
      websitePurchaseValue: data.websitePurchases?.value ?? null,
      topCampaigns:  JSON.stringify(topCampaigns),
      topAds:        JSON.stringify(topAds),
      campaignsCount: topCampaigns.length,
    },
  })

  return { projectId, month, type: 'meta_ads', spend: data.spend }
}

/**
 * Guarda un snapshot de Google Ads para un proyecto y mes específicos.
 */
async function saveGoogleAdsSnapshot(projectId, workspaceId, month) {
  const integration = await prisma.projectIntegration.findUnique({
    where: { projectId_type: { projectId, type: 'google_ads' } },
  })
  if (!integration || integration.status !== 'active' || !integration.customerId) {
    throw new Error(`Proyecto ${projectId}: sin integración Google Ads activa`)
  }
  if (!process.env.GOOGLE_ADS_DEVELOPER_TOKEN) {
    throw new Error('GOOGLE_ADS_DEVELOPER_TOKEN no configurado')
  }

  const data = await fetchGoogleAdsData(integration, 'last_month', monthRange(month))

  const topCampaigns = (data.campaigns ?? []).slice(0, 5).map(c => ({
    id:           c.id,
    name:         c.name,
    spend:        c.cost,
    impressions:  c.impressions,
    clicks:       c.clicks,
    ctr:          c.ctr,
    conversions:  c.conversions,
  }))

  // Top 5 anuncios (por impresiones) — preview de texto, sin imagen que cachear.
  const topAds = (data.topAds ?? []).slice(0, 5).map(a => ({
    id:           a.id,
    name:         a.name,
    type:         a.type,
    headline:     a.headline,
    description:  a.description,
    impressions:  a.impressions,
    clicks:       a.clicks,
    ctr:          a.ctr,
    cost:         a.cost,
    conversions:  a.conversions,
  }))

  const totalCost = parseFloat(data.cost?.toFixed(2) ?? 0)

  await prisma.adsSnapshot.upsert({
    where: { projectId_month_type: { projectId, month, type: 'google_ads' } },
    update: {
      spend:          totalCost,
      impressions:    data.impressions,
      clicks:         data.clicks,
      ctr:            data.ctr,
      conversions:    data.conversions ?? null,
      avgCpc:         data.avgCpc      ?? null,
      topCampaigns:   JSON.stringify(topCampaigns),
      topAds:         JSON.stringify(topAds),
      campaignsCount: topCampaigns.length,
    },
    create: {
      workspaceId,
      projectId,
      month,
      type:           'google_ads',
      spend:          totalCost,
      impressions:    data.impressions,
      clicks:         data.clicks,
      ctr:            data.ctr,
      conversions:    data.conversions ?? null,
      avgCpc:         data.avgCpc      ?? null,
      topCampaigns:   JSON.stringify(topCampaigns),
      topAds:         JSON.stringify(topAds),
      campaignsCount: topCampaigns.length,
    },
  })

  return { projectId, month, type: 'google_ads', spend: totalCost }
}

/**
 * Guarda un snapshot de ChatGPT Ads para un proyecto y mes específicos.
 *
 * Reusa las columnas que ya tiene AdsSnapshot (no hace falta migración): `cpm`/`cpc`
 * como las de Meta, `avgCpc`/`conversions` como las de Google, y
 * `websitePurchases`/`websitePurchaseValue` para las ventas atribuidas al evento
 * `order_created` (el equivalente de ChatGPT a las compras del píxel de Meta).
 */
async function saveChatgptAdsSnapshot(projectId, workspaceId, month) {
  const integration = await prisma.projectIntegration.findUnique({
    where: { projectId_type: { projectId, type: 'chatgpt_ads' } },
  })
  if (!integration || integration.status !== 'active' || !integration.accessToken) {
    throw new Error(`Proyecto ${projectId}: sin integración ChatGPT Ads activa`)
  }

  const data = await fetchChatGptAdsData(integration, 'last_month', monthRange(month))

  const topCampaigns = (data.campaigns ?? []).slice(0, 5).map(c => ({
    id:          c.id,
    name:        c.name,
    spend:       c.cost,
    impressions: c.impressions,
    clicks:      c.clicks,
    ctr:         c.ctr,
    conversions: c.conversions,
  }))

  // Top 5 anuncios. La imagen del creativo se cachea (SocialImage/R2) igual que la
  // de Meta: es una URL firmada de la plataforma y vence.
  const topAds = await cacheImagesInArray(
    (data.topAds ?? []).slice(0, 5).map(a => ({
      id:           a.id,
      name:         a.name,
      headline:     a.headline,
      description:  a.description,
      thumbnailUrl: a.thumbnailUrl,
      impressions:  a.impressions,
      clicks:       a.clicks,
      ctr:          a.ctr,
      cost:         a.cost,
      conversions:  a.conversions,
    })),
    'thumbnailUrl',
    workspaceId,
  )

  const fields = {
    spend:                data.cost,
    impressions:          data.impressions,
    clicks:               data.clicks,
    ctr:                  data.ctr,
    cpm:                  data.cpm         ?? null,
    cpc:                  data.avgCpc      ?? null,
    avgCpc:               data.avgCpc      ?? null,
    conversions:          data.conversions ?? null,
    websitePurchases:     data.websitePurchases     ?? null,
    websitePurchaseValue: data.websitePurchaseValue  ?? null,
    currency:             data.currency || 'USD',
    topCampaigns:         JSON.stringify(topCampaigns),
    topAds:               JSON.stringify(topAds),
    campaignsCount:       topCampaigns.length,
  }

  await prisma.adsSnapshot.upsert({
    where:  { projectId_month_type: { projectId, month, type: 'chatgpt_ads' } },
    update: fields,
    create: { workspaceId, projectId, month, type: 'chatgpt_ads', ...fields },
  })

  return { projectId, month, type: 'chatgpt_ads', spend: data.cost }
}

/**
 * Guarda snapshots de ads (Meta + Google + ChatGPT) del mes anterior para todos los
 * proyectos del workspace que tengan la integración activa.
 * Procesamiento secuencial con delay para no saturar APIs.
 */
async function saveAllAdsSnapshots() {
  const month = prevMonthStr()
  console.log(`[AdsSnapshot] Guardando snapshots del mes ${month}...`)

  const { enabledWorkspaceIds } = require('../lib/featureFlags')
  const enabled = await enabledWorkspaceIds('marketing')

  // Una entrada por plataforma: qué integración la habilita y con qué función se
  // guarda. El `extraWhere` es lo que cada una necesita para traer datos (Google
  // sin Customer ID y ChatGPT sin API key están "conectadas" pero no sirven).
  const PLATFORMS = [
    { type: 'meta_ads',    label: 'Meta Ads',    save: saveMetaAdsSnapshot,    extraWhere: {} },
    { type: 'google_ads',  label: 'Google Ads',  save: saveGoogleAdsSnapshot,  extraWhere: { customerId: { not: null } } },
    { type: 'chatgpt_ads', label: 'ChatGPT Ads', save: saveChatgptAdsSnapshot, extraWhere: { accessToken: { not: null } } },
  ]

  const summary = []
  for (const platform of PLATFORMS) {
    const integrations = enabled.size === 0 ? [] : await prisma.projectIntegration.findMany({
      where: {
        type: platform.type, status: 'active', ...platform.extraWhere,
        workspaceId: { in: [...enabled] }, project: { active: true },
      },
      include: { project: { select: { id: true, workspaceId: true, name: true } } },
    })

    let ok = 0, fail = 0
    for (const integ of integrations) {
      try {
        await platform.save(integ.projectId, integ.project.workspaceId, month)
        ok++
        console.log(`[AdsSnapshot] ${platform.label} OK: ${integ.project.name} (${month})`)
      } catch (err) {
        fail++
        console.error(`[AdsSnapshot] ${platform.label} ERROR: ${integ.project.name}: ${err.message}`)
      }
      await new Promise(r => setTimeout(r, 2000))
    }
    summary.push(`${platform.label}: ${ok} OK / ${fail} errores`)
  }

  console.log(`[AdsSnapshot] Completado. ${summary.join('. ')}.`)
}

module.exports = { saveMetaAdsSnapshot, saveGoogleAdsSnapshot, saveChatgptAdsSnapshot, saveAllAdsSnapshots }
