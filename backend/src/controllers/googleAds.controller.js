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
    // Token de Google expirado — marcar integración y devolver 400 con código reconocible
    if (err.code === 'TOKEN_EXPIRED' || err.message?.includes('invalid_grant')) {
      await prisma.projectIntegration.update({
        where: { projectId_type: { projectId: Number(req.params.id), type: 'google_ads' } },
        data:  { status: 'expired' },
      }).catch(() => {})
      return res.status(400).json({
        error: 'El token de Google Ads expiró. Desconectá y volvé a conectar la integración.',
        code:  'TOKEN_EXPIRED',
      })
    }

    // Error específico de Google Ads API — puede venir como objeto o como array
    const body = err.response?.data
    if (body) {
      console.error('[GoogleAds] API error:', JSON.stringify(body))
      // Formato objeto: { error: { message, code, status } }
      const gadsErr = body.error
      if (gadsErr) {
        const status = err.response.status
        if (status === 404) {
          return res.status(400).json({
            error: `Cuenta de Google Ads no encontrada (ID: ${req.query?.customerId ?? '?'}). Verificá que el Customer ID sea correcto y que tu cuenta de Google tenga acceso directo a esa cuenta.`,
            code: 'NOT_FOUND',
          })
        }
        return res.status(400).json({ error: gadsErr.message || 'Error en Google Ads API' })
      }
      // Formato array (algunas versiones de la API)
      if (Array.isArray(body) && body[0]?.error) {
        return res.status(400).json({ error: body[0].error.message || 'Error en Google Ads API' })
      }
    }
    next(err)
  }
}

module.exports = { getGoogleAdsData }
