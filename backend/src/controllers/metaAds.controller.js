const prisma                         = require('../lib/prisma')
const { getValidFbToken, fetchMetaAdsForIntegration } = require('../services/metaAds.service')

/**
 * GET /api/marketing/projects/:id/meta-ads?datePreset=this_month[&accountId=act_X]
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
    // accountId: una sola de las cuentas (selector de la pestaña); sin él, todas juntas
    const accountId = req.query.accountId ? String(req.query.accountId) : null
    const data  = await fetchMetaAdsForIntegration(integration, token, datePreset, null, { allAds: true, accountId })

    res.json(data)
  } catch (err) {
    if (err.response?.data) {
      console.error('[MetaAds] Error de Facebook API:', JSON.stringify(err.response.data, null, 2))
      const fbErr = err.response.data.error
      return res.status(400).json({ error: fbErr?.message || 'Error en Meta Ads API', code: fbErr?.code })
    }
    if (err.status === 400) return res.status(400).json({ error: err.message })
    next(err)
  }
}

module.exports = { getMetaAdsData }
