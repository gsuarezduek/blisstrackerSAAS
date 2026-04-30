const prisma                         = require('../lib/prisma')
const { getValidFbToken, fetchMetaAdsData } = require('../services/metaAds.service')

/**
 * GET /api/marketing/projects/:id/meta-ads?datePreset=this_month
 */
async function getMetaAdsData(req, res, next) {
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
      where: { projectId_type: { projectId, type: 'meta_ads' } },
    })
    if (!integration) {
      return res.status(404).json({ error: 'Sin integración de Meta Ads', code: 'NOT_CONNECTED' })
    }

    const token = await getValidFbToken(integration)
    const data  = await fetchMetaAdsData(integration.propertyId, token, datePreset)

    res.json(data)
  } catch (err) { next(err) }
}

module.exports = { getMetaAdsData }
