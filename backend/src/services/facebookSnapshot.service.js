const prisma = require('../lib/prisma')
const { getValidFacebookToken } = require('./metaTokenRefresh.service')
const { fetchFacebookMetrics }  = require('./facebook.service')
const { scrapeFacebookPage }    = require('./socialScrape.service')
const { cacheImagesInArray }    = require('./socialImageCache.service')

function currentMonthStr() {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' }))
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function prevMonthStr(month) {
  const [y, m] = month.split('-').map(Number)
  const pm = m === 1 ? 12 : m - 1
  const py = m === 1 ? y - 1 : y
  return `${py}-${String(pm).padStart(2, '0')}`
}

function snapshotData(metrics) {
  return {
    followersCount: metrics.followersCount ?? 0,
    fanCount:       metrics.fanCount       ?? null,
    reach:          metrics.reach          ?? null,
    impressions:    metrics.impressions    ?? null,
    pageViews:      metrics.pageViews      ?? null,
    engagementRate: metrics.engagementRate ?? null,
    totalLikes:     metrics.totalLikes     ?? null,
    totalComments:  metrics.totalComments  ?? null,
    totalShares:    metrics.totalShares    ?? null,
    postsThisMonth: metrics.postsThisMonth ?? null,
    topPosts:       JSON.stringify(metrics.topPosts ?? []),
  }
}

/**
 * Guarda un snapshot de Facebook para un proyecto y mes.
 * Si se pasan métricas pre-fetcheadas, no consulta la API/scraping.
 */
async function saveFacebookSnapshot(projectId, workspaceId, month, preloaded = null) {
  let metrics = preloaded
  if (!metrics) {
    const integration = await prisma.projectIntegration.findUnique({
      where: { projectId_type: { projectId, type: 'facebook' } },
    })
    if (!integration || integration.status !== 'active') {
      throw new Error(`Proyecto ${projectId}: no tiene integración de Facebook activa`)
    }
    if (!integration.propertyId) {
      throw new Error(`Proyecto ${projectId}: integración Facebook sin página seleccionada`)
    }
    if (integration.scopes === 'scrape') {
      metrics = await scrapeFacebookPage(integration.propertyId, { targetMonth: month, workspaceId, context: 'Facebook — snapshot mensual' })
    } else {
      const token = getValidFacebookToken(integration)
      metrics     = await fetchFacebookMetrics(integration.propertyId, token, month)
    }
  }

  // Cacheamos las imágenes de los top posts (las URLs del CDN de FB vencen).
  const topPostsCached = await cacheImagesInArray(metrics.topPosts ?? [], 'imgSrc', workspaceId)
  const data = snapshotData({ ...metrics, topPosts: topPostsCached })

  await prisma.facebookSnapshot.upsert({
    where:  { projectId_month: { projectId, month } },
    update: data,
    create: { projectId, workspaceId, month, ...data },
  })

  console.log(`[FacebookSnapshot] Guardado para proyecto ${projectId}, mes ${month}: ${metrics.followersCount} seguidores`)
}

/**
 * Guarda snapshots del mes anterior para todos los proyectos con Facebook activo.
 * Se ejecuta el 1° de cada mes (cadena MONTHLY_CHAIN).
 */
async function saveAllMonthlyFacebookSnapshots() {
  const month = prevMonthStr(currentMonthStr())

  const integrations = await prisma.projectIntegration.findMany({
    where:  { type: 'facebook', status: 'active', propertyId: { not: null } },
    select: { projectId: true, project: { select: { workspaceId: true } } },
  })

  console.log(`[FacebookSnapshot] Procesando ${integrations.length} proyectos (mes: ${month})`)

  for (const intg of integrations) {
    try {
      await saveFacebookSnapshot(intg.projectId, intg.project.workspaceId, month)
      await new Promise(r => setTimeout(r, 2000))
    } catch (err) {
      console.error(`[FacebookSnapshot] Error en proyecto ${intg.projectId}:`, err.message)
    }
  }
}

module.exports = { saveFacebookSnapshot, saveAllMonthlyFacebookSnapshots }
