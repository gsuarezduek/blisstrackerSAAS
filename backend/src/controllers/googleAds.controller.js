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
    // Helper local: marcar la integración como expirada (token muerto).
    const markExpired = () => prisma.projectIntegration.update({
      where: { projectId_type: { projectId: Number(req.params.id), type: 'google_ads' } },
      data:  { status: 'expired' },
    }).catch(e => console.error('[GoogleAds] Error al marcar integración como expirada:', e.message))

    // 1) Error de la Google Ads API (tiene response.data): clasificar SIEMPRE por su propio
    //    status — un problema de cuenta/manager NUNCA se reporta como "token expirado".
    const body = err.response?.data
    if (body) {
      console.error('[GoogleAds] API error:', JSON.stringify(body))
      const status  = err.response.status
      // Formato objeto: { error: { message, code, status } } | array (algunas versiones)
      const gadsErr = body.error || (Array.isArray(body) ? body[0]?.error : null)
      if (gadsErr) {
        if (status === 404) {
          return res.status(400).json({
            error: `Cuenta de Google Ads no encontrada (ID: ${req.query?.customerId ?? '?'}). Verificá que el Customer ID sea correcto y que tu cuenta de Google tenga acceso directo a esa cuenta.`,
            code: 'NOT_FOUND',
          })
        }
        if (status === 403) {
          return res.status(400).json({
            error: 'Sin permiso para acceder a esta cuenta. Si es una cuenta cliente de un Manager Account (MCC), ingresá el ID del Manager en el campo correspondiente.',
            code: 'PERMISSION_DENIED',
          })
        }
        // 401 UNAUTHENTICATED: el access token no sirve (revocado / scope insuficiente) →
        // sí es un problema de token: marcar expirado y pedir reconexión.
        if (status === 401) {
          await markExpired()
          return res.status(400).json({
            error: 'El token de Google Ads ya no es válido. Desconectá y volvé a conectar la integración.',
            code:  'TOKEN_EXPIRED',
          })
        }
        return res.status(400).json({ error: gadsErr.message || 'Error en Google Ads API' })
      }
    }

    // 2) Falla genuina al refrescar el token OAuth (sin response.data): el refresh dio
    //    invalid_grant. No es un problema de la cuenta — es el refresh token del usuario.
    if (err.code === 'TOKEN_EXPIRED' || err.message?.includes('invalid_grant')) {
      await markExpired()
      return res.status(400).json({
        error: 'El token de Google Ads expiró. Desconectá y volvé a conectar la integración.',
        code:  'TOKEN_EXPIRED',
      })
    }

    next(err)
  }
}

module.exports = { getGoogleAdsData }
