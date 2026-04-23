const prisma = require('../lib/prisma')
const { fetchGA4Report } = require('../services/googleAnalytics.service')

const VALID_DATE_RANGES = new Set(['7daysAgo', '30daysAgo', '90daysAgo'])

/**
 * GET /api/marketing/projects/:id/analytics?dateRange=30daysAgo
 * Devuelve métricas de Google Analytics (GA4) para el proyecto.
 */
async function getAnalyticsData(req, res, next) {
  try {
    const projectId   = Number(req.params.id)
    const workspaceId = req.workspace.id
    const dateRange   = VALID_DATE_RANGES.has(req.query.dateRange)
      ? req.query.dateRange
      : '30daysAgo'

    const project = await prisma.project.findFirst({
      where: { id: projectId, workspaceId },
      select: { id: true, name: true, websiteUrl: true },
    })
    if (!project) return res.status(404).json({ error: 'Proyecto no encontrado' })

    const integration = await prisma.projectIntegration.findUnique({
      where: { projectId_type: { projectId, type: 'google_analytics' } },
    })

    if (!integration) {
      return res.status(404).json({ error: 'Google Analytics no conectado para este proyecto' })
    }

    if (integration.status === 'error') {
      return res.status(400).json({
        error: 'La integración tiene un error. Desconectá y volvé a conectar Google Analytics.',
        status: 'error',
      })
    }

    if (!integration.propertyId) {
      return res.status(400).json({
        error: 'GA4 Property ID no configurado. Ingresalo en la tab Info del proyecto.',
        status: 'no_property',
      })
    }

    const data = await fetchGA4Report(integration, dateRange)
    res.json({ ...data, projectName: project.name, websiteUrl: project.websiteUrl })
  } catch (err) {
    console.error('[analytics.getAnalyticsData] error:', err.code ?? '', err.message)
    // Marcar como error si el token fue revocado por el usuario en Google
    if (
      err.message?.includes('invalid_grant') ||
      err.message?.includes('Token has been expired') ||
      err.message?.includes('UNAUTHENTICATED')
    ) {
      await prisma.projectIntegration.update({
        where: { projectId_type: { projectId: Number(req.params.id), type: 'google_analytics' } },
        data:  { status: 'error' },
      }).catch(() => {})
      return res.status(401).json({
        error: 'Token revocado. Desconectá y volvé a conectar Google Analytics.',
        status: 'revoked',
      })
    }
    next(err)
  }
}

/**
 * GET /api/marketing/projects/:id/ads
 * Placeholder hasta que el Developer Token de Google Ads sea aprobado.
 */
async function getAdsData(req, res) {
  const projectId   = Number(req.params.id)
  const workspaceId = req.workspace.id

  const project = await prisma.project.findFirst({
    where: { id: projectId, workspaceId },
    select: { id: true },
  }).catch(() => null)

  if (!project) return res.status(404).json({ error: 'Proyecto no encontrado' })

  const integration = await prisma.projectIntegration.findUnique({
    where: { projectId_type: { projectId, type: 'google_ads' } },
  }).catch(() => null)

  if (!integration) {
    return res.status(404).json({ error: 'Google Ads no conectado para este proyecto' })
  }

  // TODO: implementar cuando el Developer Token esté aprobado
  res.status(503).json({
    error: 'Google Ads API en proceso de configuración',
    pending: true,
  })
}

module.exports = { getAnalyticsData, getAdsData }
