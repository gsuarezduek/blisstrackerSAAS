const prisma = require('../lib/prisma')
const { fetchGA4Report } = require('../services/googleAnalytics.service')

// Acepta 'NdaysAgo', 'today', 'yesterday' o 'YYYY-MM-DD'
const VALID_GA4_DATE = /^(\d{4}-\d{2}-\d{2}|\d+daysAgo|today|yesterday)$/

function parseDateParam(val, fallback) {
  if (val && VALID_GA4_DATE.test(val.trim())) return val.trim()
  return fallback
}

/**
 * GET /api/marketing/projects/:id/analytics?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 * También acepta ?dateRange=NdaysAgo para compatibilidad.
 */
async function getAnalyticsData(req, res, next) {
  try {
    const projectId   = Number(req.params.id)
    const workspaceId = req.workspace.id

    // Soporte para startDate/endDate explícitos o el viejo dateRange
    let startDate, endDate
    if (req.query.startDate || req.query.endDate) {
      startDate = parseDateParam(req.query.startDate, '30daysAgo')
      endDate   = parseDateParam(req.query.endDate,   'today')
    } else {
      const legacy = ['7daysAgo', '30daysAgo', '90daysAgo'].includes(req.query.dateRange)
        ? req.query.dateRange
        : '30daysAgo'
      startDate = legacy
      endDate   = 'today'
    }

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

    const comparePrevious = req.query.compare === 'true'
    const data = await fetchGA4Report(integration, startDate, endDate, { comparePrevious })
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
