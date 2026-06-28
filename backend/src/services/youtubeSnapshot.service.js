const prisma = require('../lib/prisma')
const { getValidAccessToken } = require('./tokenRefresh.service')
const { fetchYouTubeMetrics }  = require('./youtube.service')
const { cacheImagesInArray }   = require('./socialImageCache.service')

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

/**
 * Guarda un snapshot de YouTube para un proyecto y mes.
 * @param {number} projectId
 * @param {number} workspaceId
 * @param {string} month          — "YYYY-MM"
 * @param {object|null} preloaded — métricas ya fetcheadas (evita re-consultar la API)
 */
async function saveYouTubeSnapshot(projectId, workspaceId, month, preloaded = null) {
  let metrics = preloaded

  if (!metrics) {
    const integration = await prisma.projectIntegration.findUnique({
      where: { projectId_type: { projectId, type: 'google_youtube' } },
    })
    if (!integration || integration.status !== 'active') {
      throw new Error(`Proyecto ${projectId}: no tiene integración de YouTube activa`)
    }
    const token = await getValidAccessToken(integration)
    metrics     = await fetchYouTubeMetrics(token, month, integration.propertyId || null)
  }

  // Cacheamos las portadas de los top videos (consistencia con las otras redes).
  const topVideosCached = await cacheImagesInArray(metrics.topVideos ?? [], 'coverUrl', workspaceId)
  const topVideosJson   = JSON.stringify(topVideosCached)

  const data = {
    subscriberCount: metrics.subscriberCount ?? 0,
    videoCount:      metrics.videoCount      ?? null,
    viewCountTotal:  metrics.viewCountTotal  ?? null,
    monthViews:      metrics.monthViews      ?? null,
    videosThisMonth: metrics.videosThisMonth ?? null,
    longsThisMonth:  metrics.longsThisMonth  ?? null,
    shortsThisMonth: metrics.shortsThisMonth ?? null,
    avgViews:        metrics.avgViews        ?? null,
    avgLikes:        metrics.avgLikes        ?? null,
    avgComments:     metrics.avgComments     ?? null,
    engagementRate:  metrics.engagementRate  ?? null,
    topVideos:       topVideosJson,
  }

  await prisma.youTubeSnapshot.upsert({
    where:  { projectId_month: { projectId, month } },
    update: data,
    create: { projectId, workspaceId, month, ...data },
  })

  console.log(`[YouTubeSnapshot] Guardado para proyecto ${projectId}, mes ${month}: ${metrics.subscriberCount} suscriptores`)
}

/**
 * Guarda snapshots del mes anterior para todos los proyectos con YouTube activo.
 * Se ejecuta el 1° de cada mes (cadena mensual).
 */
async function saveAllMonthlyYouTubeSnapshots() {
  const month = prevMonthStr(currentMonthStr())

  const integrations = await prisma.projectIntegration.findMany({
    where:  { type: 'google_youtube', status: 'active' },
    select: { projectId: true, project: { select: { workspaceId: true } } },
  })

  console.log(`[YouTubeSnapshot] Procesando ${integrations.length} proyectos (mes: ${month})`)

  for (const intg of integrations) {
    try {
      await saveYouTubeSnapshot(intg.projectId, intg.project.workspaceId, month)
      await new Promise(r => setTimeout(r, 2000))
    } catch (err) {
      console.error(`[YouTubeSnapshot] Error en proyecto ${intg.projectId}:`, err.message)
    }
  }
}

module.exports = { saveYouTubeSnapshot, saveAllMonthlyYouTubeSnapshots }
