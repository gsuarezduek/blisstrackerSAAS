const prisma = require('../lib/prisma')
const { getValidMetaToken }       = require('./metaTokenRefresh.service')
const { fetchInstagramMetrics }   = require('./instagram.service')
const { scrapeInstagramProfile }  = require('./socialScrape.service')
const { cacheImagesInArray }      = require('./socialImageCache.service')
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

// Último día de un mes "YYYY-MM" → "YYYY-MM-DD" (Date.UTC con día 0 del mes siguiente).
// Nombre distinto de lib/monthUtils.js#lastDayOfMonth (esa devuelve un número de día, no una fecha).
function monthEndDateStr(month) {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(Date.UTC(y, m, 0)).getUTCDate()   // m es 1-based; índice m = mes siguiente, día 0 = último del mes m
  return `${month}-${String(d).padStart(2, '0')}`
}

/**
 * Guarda un snapshot de Instagram para un proyecto y mes específicos.
 * Usa la integración activa del proyecto.
 *
 * @param {number} projectId
 * @param {number} workspaceId
 * @param {string} month           — "YYYY-MM"
 * @param {object|null} preloadedMetrics — si se proveen, evita re-fetchear de la API
 */
async function saveInstagramSnapshot(projectId, workspaceId, month, preloadedMetrics = null) {
  let metrics = preloadedMetrics

  if (!metrics) {
    const integration = await prisma.projectIntegration.findUnique({
      where: { projectId_type: { projectId, type: 'instagram' } },
    })
    if (!integration || integration.status !== 'active') {
      throw new Error(`Proyecto ${projectId}: no tiene integración de Instagram activa`)
    }
    if (integration.scopes === 'scrape') {
      metrics = await scrapeInstagramProfile(integration.propertyId, { targetMonth: month, workspaceId, context: 'Instagram — snapshot mensual' })
    } else {
      const token      = await getValidMetaToken(integration)
      const useFbGraph = integration.scopes?.startsWith('fb_graph')
      metrics          = await fetchInstagramMetrics(integration.propertyId, token, month, useFbGraph)
    }
  }

  // Cacheamos las imágenes de los top posts (las URLs del CDN de IG vencen).
  const topPostsCached = await cacheImagesInArray(metrics.topPosts ?? [], 'imgSrc', workspaceId)
  const topPostsJson   = JSON.stringify(topPostsCached)

  await prisma.instagramSnapshot.upsert({
    where: { projectId_month: { projectId, month } },
    update: {
      followersCount: metrics.followersCount,
      mediaCount:     metrics.mediaCount     ?? null,
      avgLikes:       metrics.avgLikes       ?? null,
      avgComments:    metrics.avgComments    ?? null,
      engagementRate: metrics.engagementRate ?? null,
      postsCount:     metrics.postsThisMonth ?? null,
      reach:          metrics.reachThisMonth ?? null,
      views:          metrics.viewsThisMonth ?? null,
      totalSaved:     metrics.totalSaved     ?? null,
      totalShares:    metrics.totalShares    ?? null,
      avgReach:       metrics.avgReach        ?? null,
      topPosts:       topPostsJson,
    },
    create: {
      projectId,
      workspaceId,
      month,
      followersCount: metrics.followersCount,
      mediaCount:     metrics.mediaCount     ?? null,
      avgLikes:       metrics.avgLikes       ?? null,
      avgComments:    metrics.avgComments    ?? null,
      engagementRate: metrics.engagementRate ?? null,
      postsCount:     metrics.postsThisMonth ?? null,
      reach:          metrics.reachThisMonth ?? null,
      views:          metrics.viewsThisMonth ?? null,
      totalSaved:     metrics.totalSaved     ?? null,
      totalShares:    metrics.totalShares    ?? null,
      avgReach:       metrics.avgReach        ?? null,
      topPosts:       topPostsJson,
    },
  })

  console.log(`[InstagramSnapshot] Guardado para proyecto ${projectId}, mes ${month}: ${metrics.followersCount} seguidores`)
  return metrics
}

/**
 * Guarda snapshots mensuales para todos los proyectos con Instagram activo.
 * Se ejecuta el 1° de cada mes para guardar el mes anterior.
 */
async function saveAllMonthlyInstagramSnapshots() {
  const month = prevMonthStr(currentMonthStr())

  const { enabledWorkspaceIds } = require('../lib/featureFlags')
  const enabled = await enabledWorkspaceIds('marketing')
  const integrations = enabled.size === 0 ? [] : await prisma.projectIntegration.findMany({
    where:  { type: 'instagram', status: 'active', workspaceId: { in: [...enabled] } },
    select: { projectId: true, project: { select: { workspaceId: true } } },
  })

  console.log(`[InstagramSnapshot] Procesando ${integrations.length} proyectos (mes: ${month})`)

  const anchorDate = monthEndDateStr(month)   // cierre del mes que se snapshotea → baseline del mes en curso

  for (const intg of integrations) {
    try {
      const metrics = await saveInstagramSnapshot(intg.projectId, intg.project.workspaceId, month)
      // Ancla de baseline: deja un log de seguidores al cierre del mes anterior para que
      // el cálculo de "nuevos" del mes en curso siempre tenga un punto de partida estable,
      // aunque la cuenta se scrapee/visite una sola vez en el mes. `update: {}` para no pisar
      // un log real que ya exista de ese día.
      if (metrics?.followersCount != null) {
        await prisma.instagramFollowerLog.upsert({
          where:  { projectId_date: { projectId: intg.projectId, date: anchorDate } },
          update: {},
          create: { projectId: intg.projectId, workspaceId: intg.project.workspaceId, date: anchorDate, followersCount: metrics.followersCount },
        })
      }
      await new Promise(r => setTimeout(r, 2000))
    } catch (err) {
      console.error(`[InstagramSnapshot] Error en proyecto ${intg.projectId}:`, err.message)
    }
  }
}

module.exports = { saveInstagramSnapshot, saveAllMonthlyInstagramSnapshots }
