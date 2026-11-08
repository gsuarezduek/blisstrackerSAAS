const prisma = require('../lib/prisma')
const { MARKETING_PROJECT_WHERE } = require('../lib/projectModules')
const { getValidFacebookToken } = require('./metaTokenRefresh.service')
const { fetchFacebookMetrics }  = require('./facebook.service')
const { scrapeFacebookPage }    = require('./socialScrape.service')
const { cacheImagesInArray }    = require('./socialImageCache.service')
const { DEFAULT_TZ } = require('../utils/dates')

function currentMonthStr() {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: DEFAULT_TZ }))
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
 * Resuelve los valores de **stock** (seguidores y "me gusta" de la página) de un mes
 * ya cerrado. Son los únicos datos del snapshot que NO están fechados: un scrape de
 * hoy devuelve los seguidores de hoy, así que recalcular octubre en noviembre dejaría
 * el snapshot de octubre con el número de noviembre y el crecimiento mensual mentiría.
 * Los posts/engagement sí van fechados (se filtran por mes) y se recalculan sin riesgo.
 * Orden de preferencia: lo que ya tenía el snapshot → el último registro diario de
 * seguidores de ese mes → lo que trajo el scrape (único dato disponible).
 * Función pura: las dos primeras fuentes las consulta el caller.
 */
function pickHistoricalStock({ existing, lastLog, metrics }) {
  if (existing?.followersCount != null) {
    return { followersCount: existing.followersCount, fanCount: existing.fanCount ?? metrics.fanCount ?? null, followersSource: 'snapshot' }
  }
  if (lastLog?.followersCount != null) {
    return { followersCount: lastLog.followersCount, fanCount: existing?.fanCount ?? metrics.fanCount ?? null, followersSource: 'log' }
  }
  return { followersCount: metrics.followersCount ?? 0, fanCount: metrics.fanCount ?? null, followersSource: 'scrape' }
}

/**
 * Guarda un snapshot de Facebook para un proyecto y mes.
 * Si se pasan métricas pre-fetcheadas, no consulta la API/scraping.
 * `opts.preserveStock` (recálculo de un mes ya cerrado): conserva los seguidores /
 * "me gusta" históricos en vez de pisarlos con los de hoy — ver `pickHistoricalStock`.
 * @returns {{ metrics, followersSource: 'snapshot'|'log'|'scrape'|'live' }}
 */
async function saveFacebookSnapshot(projectId, workspaceId, month, preloaded = null, opts = {}) {
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
      metrics = await scrapeFacebookPage(integration.propertyId, { targetMonth: month, workspaceId, projectId, action: 'monthly_snapshot', actionLabel: 'Facebook — snapshot mensual' })
    } else {
      const token = getValidFacebookToken(integration)
      metrics     = await fetchFacebookMetrics(integration.propertyId, token, month)
    }
  }

  // Cacheamos las imágenes de los top posts (las URLs del CDN de FB vencen).
  const topPostsCached = await cacheImagesInArray(metrics.topPosts ?? [], 'imgSrc', workspaceId)
  const data = snapshotData({ ...metrics, topPosts: topPostsCached })

  let followersSource = 'live'
  if (opts.preserveStock) {
    const [existing, lastLog] = await Promise.all([
      prisma.facebookSnapshot.findUnique({
        where:  { projectId_month: { projectId, month } },
        select: { followersCount: true, fanCount: true },
      }),
      prisma.facebookFollowerLog.findFirst({
        where:   { projectId, date: { startsWith: month } },
        orderBy: { date: 'desc' },
        select:  { followersCount: true },
      }),
    ])
    const stock = pickHistoricalStock({ existing, lastLog, metrics })
    data.followersCount = stock.followersCount
    data.fanCount       = stock.fanCount
    followersSource     = stock.followersSource
  }

  await prisma.facebookSnapshot.upsert({
    where:  { projectId_month: { projectId, month } },
    update: data,
    create: { projectId, workspaceId, month, ...data },
  })

  console.log(`[FacebookSnapshot] Guardado para proyecto ${projectId}, mes ${month}: ${data.followersCount} seguidores (origen: ${followersSource}), ${data.postsThisMonth ?? 0} posts`)
  return { metrics, followersSource }
}

/**
 * Guarda snapshots del mes anterior para todos los proyectos con Facebook activo.
 * Se ejecuta el 1° de cada mes (cadena MONTHLY_CHAIN).
 */
async function saveAllMonthlyFacebookSnapshots() {
  const month = prevMonthStr(currentMonthStr())

  const integrations = await prisma.projectIntegration.findMany({
    where:  { type: 'facebook', status: 'active', propertyId: { not: null }, project: { active: true, ...MARKETING_PROJECT_WHERE } },
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

module.exports = { saveFacebookSnapshot, saveAllMonthlyFacebookSnapshots, pickHistoricalStock }
