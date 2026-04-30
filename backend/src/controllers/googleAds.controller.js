const prisma                   = require('../lib/prisma')
const { fetchGoogleAdsData }   = require('../services/googleAds.service')

/**
 * GET /api/marketing/projects/:id/google-ads?datePreset=this_month
 */
async function getGoogleAdsData(req, res, next) {
  try {
    const projectId   = Number(req.params.id)
    const workspaceId = req.workspace.id
    const datePreset  = req.query.datePreset || 'this_month'

    const project = await prisma.project.findFirst({
      where: { id: projectId, workspaceId },
      select: { id: true },
    })
    if (!project) return res.status(404).json({ error: 'Proyecto no encontrado' })

    const integration = await prisma.projectIntegration.findUnique({
      where: { projectId_type: { projectId, type: 'google_ads' } },
    })
    if (!integration) {
      return res.status(404).json({ error: 'Google Ads no conectado', code: 'NOT_CONNECTED' })
    }
    if (!integration.customerId) {
      return res.status(400).json({ error: 'Customer ID no configurado', code: 'NO_CUSTOMER_ID' })
    }

    if (!process.env.GOOGLE_ADS_DEVELOPER_TOKEN) {
      return res.status(500).json({ error: 'GOOGLE_ADS_DEVELOPER_TOKEN no configurado en el servidor' })
    }

    const data = await fetchGoogleAdsData(integration, datePreset)
    res.json(data)
  } catch (err) {
    // Error específico de Google Ads API
    const gadsErr = err.response?.data?.error
    if (gadsErr) {
      console.error('[GoogleAds] API error:', JSON.stringify(gadsErr))
      return res.status(400).json({ error: gadsErr.message || 'Error en Google Ads API' })
    }
    next(err)
  }
}

module.exports = { getGoogleAdsData }
