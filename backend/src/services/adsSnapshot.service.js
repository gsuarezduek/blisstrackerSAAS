const prisma                         = require('../lib/prisma')
const { getValidFbToken, fetchMetaAdsData }  = require('./metaAds.service')
const { fetchGoogleAdsData }         = require('./googleAds.service')
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

  // Construir dateRange para el mes completo
  const [y, m] = month.split('-').map(Number)
  const lastDay = new Date(y, m, 0).getDate()
  const dateRange = {
    startDate: `${month}-01`,
    endDate:   `${month}-${String(lastDay).padStart(2, '0')}`,
  }

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

  const [y, m] = month.split('-').map(Number)
  const lastDay = new Date(y, m, 0).getDate()
  const dateRange = {
    startDate: `${month}-01`,
    endDate:   `${month}-${String(lastDay).padStart(2, '0')}`,
  }

  const data = await fetchGoogleAdsData(integration, 'last_month', dateRange)

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
 * Guarda snapshots de ads (Meta + Google) del mes anterior para todos los
 * proyectos del workspace que tengan la integración activa.
 * Procesamiento secuencial con delay para no saturar APIs.
 */
async function saveAllAdsSnapshots() {
  const month = prevMonthStr()
  console.log(`[AdsSnapshot] Guardando snapshots del mes ${month}...`)

  const { enabledWorkspaceIds } = require('../lib/featureFlags')
  const enabled = await enabledWorkspaceIds('marketing')

  // Proyectos con integración Meta Ads activa
  const metaIntegrations = enabled.size === 0 ? [] : await prisma.projectIntegration.findMany({
    where: { type: 'meta_ads', status: 'active', workspaceId: { in: [...enabled] } },
    include: { project: { select: { id: true, workspaceId: true, name: true } } },
  })

  let metaOk = 0, metaFail = 0
  for (const integ of metaIntegrations) {
    try {
      await saveMetaAdsSnapshot(integ.projectId, integ.project.workspaceId, month)
      metaOk++
      console.log(`[AdsSnapshot] Meta Ads OK: ${integ.project.name} (${month})`)
    } catch (err) {
      metaFail++
      console.error(`[AdsSnapshot] Meta Ads ERROR: ${integ.project.name}: ${err.message}`)
    }
    await new Promise(r => setTimeout(r, 2000))
  }

  // Proyectos con integración Google Ads activa
  const gadsIntegrations = enabled.size === 0 ? [] : await prisma.projectIntegration.findMany({
    where: { type: 'google_ads', status: 'active', customerId: { not: null }, workspaceId: { in: [...enabled] } },
    include: { project: { select: { id: true, workspaceId: true, name: true } } },
  })

  let gadsOk = 0, gadsFail = 0
  for (const integ of gadsIntegrations) {
    try {
      await saveGoogleAdsSnapshot(integ.projectId, integ.project.workspaceId, month)
      gadsOk++
      console.log(`[AdsSnapshot] Google Ads OK: ${integ.project.name} (${month})`)
    } catch (err) {
      gadsFail++
      console.error(`[AdsSnapshot] Google Ads ERROR: ${integ.project.name}: ${err.message}`)
    }
    await new Promise(r => setTimeout(r, 2000))
  }

  console.log(`[AdsSnapshot] Completado. Meta: ${metaOk} OK / ${metaFail} errores. Google: ${gadsOk} OK / ${gadsFail} errores.`)
}

module.exports = { saveMetaAdsSnapshot, saveGoogleAdsSnapshot, saveAllAdsSnapshots }
