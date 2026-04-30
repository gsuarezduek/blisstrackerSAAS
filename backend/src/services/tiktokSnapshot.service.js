const prisma = require('../lib/prisma')
const { getValidTikTokToken }  = require('./tiktokTokenRefresh.service')
const { fetchTikTokMetrics }   = require('./tiktok.service')

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
 * Guarda un snapshot de TikTok para un proyecto y mes.
 * @param {number} projectId
 * @param {number} workspaceId
 * @param {string} month          — "YYYY-MM"
 * @param {object|null} preloaded — si se proveen métricas ya fetcheadas, no re-consulta la API
 */
async function saveTikTokSnapshot(projectId, workspaceId, month, preloaded = null) {
  let metrics = preloaded

  if (!metrics) {
    const integration = await prisma.projectIntegration.findUnique({
      where: { projectId_type: { projectId, type: 'tiktok' } },
    })
    if (!integration || integration.status !== 'active') {
      throw new Error(`Proyecto ${projectId}: no tiene integración de TikTok activa`)
    }
    const token = await getValidTikTokToken(integration)
    metrics     = await fetchTikTokMetrics(token)
  }

  await prisma.tikTokSnapshot.upsert({
    where:  { projectId_month: { projectId, month } },
    update: {
      followersCount: metrics.followersCount,
      videoCount:     metrics.videoCount     ?? null,
      likesCount:     metrics.likesCount     ?? null,
      avgViews:       metrics.avgViews       ?? null,
      avgLikes:       metrics.avgLikes       ?? null,
      avgComments:    metrics.avgComments    ?? null,
      avgShares:      metrics.avgShares      ?? null,
      postsThisMonth: metrics.postsThisMonth ?? null,
      engagementRate: metrics.engagementRate ?? null,
    },
    create: {
      projectId,
      workspaceId,
      month,
      followersCount: metrics.followersCount,
      videoCount:     metrics.videoCount     ?? null,
      likesCount:     metrics.likesCount     ?? null,
      avgViews:       metrics.avgViews       ?? null,
      avgLikes:       metrics.avgLikes       ?? null,
      avgComments:    metrics.avgComments    ?? null,
      avgShares:      metrics.avgShares      ?? null,
      postsThisMonth: metrics.postsThisMonth ?? null,
      engagementRate: metrics.engagementRate ?? null,
    },
  })

  console.log(`[TikTokSnapshot] Guardado para proyecto ${projectId}, mes ${month}: ${metrics.followersCount} seguidores`)
}

/**
 * Guarda snapshots del mes anterior para todos los proyectos con TikTok activo.
 * Se ejecuta el 1° de cada mes.
 */
async function saveAllMonthlyTikTokSnapshots() {
  const month = prevMonthStr(currentMonthStr())

  const integrations = await prisma.projectIntegration.findMany({
    where:  { type: 'tiktok', status: 'active' },
    select: { projectId: true, project: { select: { workspaceId: true } } },
  })

  console.log(`[TikTokSnapshot] Procesando ${integrations.length} proyectos (mes: ${month})`)

  for (const intg of integrations) {
    try {
      await saveTikTokSnapshot(intg.projectId, intg.project.workspaceId, month)
      await new Promise(r => setTimeout(r, 2000))
    } catch (err) {
      console.error(`[TikTokSnapshot] Error en proyecto ${intg.projectId}:`, err.message)
    }
  }
}

module.exports = { saveTikTokSnapshot, saveAllMonthlyTikTokSnapshots }
