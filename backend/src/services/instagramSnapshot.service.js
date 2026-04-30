const prisma = require('../lib/prisma')
const { getValidMetaToken }     = require('./metaTokenRefresh.service')
const { fetchInstagramMetrics } = require('./instagram.service')

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
    const token = await getValidMetaToken(integration)
    metrics     = await fetchInstagramMetrics(integration.propertyId, token)
  }

  await prisma.instagramSnapshot.upsert({
    where: { projectId_month: { projectId, month } },
    update: {
      followersCount: metrics.followersCount,
      mediaCount:     metrics.mediaCount     ?? null,
      avgLikes:       metrics.avgLikes       ?? null,
      avgComments:    metrics.avgComments    ?? null,
      engagementRate: metrics.engagementRate ?? null,
      postsCount:     metrics.postsThisMonth ?? null,
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
    },
  })

  console.log(`[InstagramSnapshot] Guardado para proyecto ${projectId}, mes ${month}: ${metrics.followersCount} seguidores`)
}

/**
 * Guarda snapshots mensuales para todos los proyectos con Instagram activo.
 * Se ejecuta el 1° de cada mes para guardar el mes anterior.
 */
async function saveAllMonthlyInstagramSnapshots() {
  const month = prevMonthStr(currentMonthStr())

  const integrations = await prisma.projectIntegration.findMany({
    where:  { type: 'instagram', status: 'active' },
    select: { projectId: true, project: { select: { workspaceId: true } } },
  })

  console.log(`[InstagramSnapshot] Procesando ${integrations.length} proyectos (mes: ${month})`)

  for (const intg of integrations) {
    try {
      await saveInstagramSnapshot(intg.projectId, intg.project.workspaceId, month)
      await new Promise(r => setTimeout(r, 2000))
    } catch (err) {
      console.error(`[InstagramSnapshot] Error en proyecto ${intg.projectId}:`, err.message)
    }
  }
}

module.exports = { saveInstagramSnapshot, saveAllMonthlyInstagramSnapshots }
