const prisma = require('../lib/prisma')
const { getValidLinkedinToken } = require('./linkedinTokenRefresh.service')
const { fetchLinkedinMetrics }  = require('./linkedin.service')

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
    pageViews:      metrics.pageViews      ?? null,
    uniqueVisitors: metrics.uniqueVisitors ?? null,
    impressions:    metrics.impressions    ?? null,
    clicks:         metrics.clicks         ?? null,
    ctr:            metrics.ctr            ?? null,
    engagementRate: metrics.engagementRate ?? null,
    totalLikes:     metrics.totalLikes     ?? null,
    totalComments:  metrics.totalComments  ?? null,
    totalShares:    metrics.totalShares    ?? null,
    postsThisMonth: metrics.postsThisMonth ?? null,
    topPosts:       JSON.stringify(metrics.topPosts     ?? []),
    demographics:   JSON.stringify(metrics.demographics ?? {}),
  }
}

/**
 * Guarda un snapshot de LinkedIn para un proyecto y mes.
 * Si se pasan métricas pre-fetcheadas, no consulta la API.
 */
async function saveLinkedinSnapshot(projectId, workspaceId, month, preloaded = null) {
  let metrics = preloaded
  if (!metrics) {
    const integration = await prisma.projectIntegration.findUnique({
      where: { projectId_type: { projectId, type: 'linkedin' } },
    })
    if (!integration || integration.status !== 'active') {
      throw new Error(`Proyecto ${projectId}: no tiene integración de LinkedIn activa`)
    }
    if (!integration.propertyId) {
      throw new Error(`Proyecto ${projectId}: integración LinkedIn sin organización seleccionada`)
    }
    const token = await getValidLinkedinToken(integration)
    metrics     = await fetchLinkedinMetrics(integration.propertyId, token, month)
  }

  const data = snapshotData(metrics)

  await prisma.linkedinSnapshot.upsert({
    where:  { projectId_month: { projectId, month } },
    update: data,
    create: { projectId, workspaceId, month, ...data },
  })

  console.log(`[LinkedinSnapshot] Guardado para proyecto ${projectId}, mes ${month}: ${metrics.followersCount} seguidores`)
}

/**
 * Guarda snapshots del mes anterior para todos los proyectos con LinkedIn activo.
 * Se ejecuta el 1° de cada mes.
 */
async function saveAllMonthlyLinkedinSnapshots() {
  const month = prevMonthStr(currentMonthStr())

  const integrations = await prisma.projectIntegration.findMany({
    where:  { type: 'linkedin', status: 'active', propertyId: { not: null } },
    select: { projectId: true, project: { select: { workspaceId: true } } },
  })

  console.log(`[LinkedinSnapshot] Procesando ${integrations.length} proyectos (mes: ${month})`)

  for (const intg of integrations) {
    try {
      await saveLinkedinSnapshot(intg.projectId, intg.project.workspaceId, month)
      await new Promise(r => setTimeout(r, 2000))
    } catch (err) {
      console.error(`[LinkedinSnapshot] Error en proyecto ${intg.projectId}:`, err.message)
    }
  }
}

module.exports = { saveLinkedinSnapshot, saveAllMonthlyLinkedinSnapshots }
