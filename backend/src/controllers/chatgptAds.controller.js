const prisma = require('../lib/prisma')
const { encrypt } = require('../lib/encryption')
const { fetchChatGptAdsData, fetchAdAccount } = require('../services/chatgptAds.service')

const TYPE = 'chatgpt_ads'

/**
 * POST /api/marketing/projects/:id/integrations/chatgpt-ads/connect-token
 * Body: { accessToken }
 *
 * Alta de la conexión. No hay OAuth: la API key se genera en Ads Manager
 * (ads.openai.com → Settings) y **está scopeada a una sola ad account**, así que
 * tampoco hay selector de cuentas — se valida la key contra `GET /ad_account` y lo
 * que devuelve es, por definición, la cuenta que se conecta.
 *
 * `expiresAt: null` = la key no vence sola (mismo criterio que el token de System
 * User de Meta Ads); si la revocan, la API responde 401 y se marca `expired`.
 */
async function connectChatgptAdsToken(req, res, next) {
  try {
    const projectId = Number(req.params.id)
    const { accessToken } = req.body
    if (!accessToken?.trim()) return res.status(400).json({ error: 'accessToken requerido' })

    const project = await prisma.project.findFirst({
      where:  { id: projectId, workspaceId: req.workspace.id },
      select: { id: true },
    })
    if (!project) return res.status(404).json({ error: 'Proyecto no encontrado' })

    let account
    try {
      account = await fetchAdAccount(accessToken.trim())
    } catch (err) {
      const msg = err.code === 'TOKEN_EXPIRED'
        ? 'La API key no es válida o fue revocada. Generá una nueva en Ads Manager → Settings.'
        : `No pudimos validar la API key: ${err.message}`
      return res.status(400).json({ error: msg })
    }

    await prisma.projectIntegration.upsert({
      where:  { projectId_type: { projectId, type: TYPE } },
      update: {
        workspaceId: req.workspace.id, status: 'active',
        propertyId: account.id, accessToken: encrypt(accessToken.trim()),
        refreshToken: null, expiresAt: null, scopes: 'api_key',
        connectedById: req.user.userId, connectedAt: new Date(),
      },
      create: {
        projectId, workspaceId: req.workspace.id, type: TYPE, status: 'active',
        propertyId: account.id, accessToken: encrypt(accessToken.trim()),
        refreshToken: null, expiresAt: null, scopes: 'api_key',
        connectedById: req.user.userId, connectedAt: new Date(),
      },
    })

    console.log(`[ChatGptAds] Conectado: proyecto ${projectId}, cuenta ${account.id} (${account.name})`)
    res.json({ ok: true, adAccountId: account.id, accountName: account.name, currency: account.currency })
  } catch (err) { next(err) }
}

/**
 * GET /api/marketing/projects/:id/chatgpt-ads?datePreset=this_month
 */
async function getChatgptAdsData(req, res, next) {
  const projectId = Number(req.params.id)
  try {
    const workspaceId = req.workspace.id
    const datePreset  = req.query.datePreset || 'this_month'

    const project = await prisma.project.findFirst({
      where: { id: projectId, workspaceId }, select: { id: true },
    })
    if (!project) return res.status(404).json({ error: 'Proyecto no encontrado' })

    const integration = await prisma.projectIntegration.findUnique({
      where: { projectId_type: { projectId, type: TYPE } },
    })
    if (!integration) {
      return res.status(404).json({ error: 'ChatGPT Ads no conectado', code: 'NOT_CONNECTED' })
    }

    const data = await fetchChatGptAdsData(integration, datePreset, null, { allAds: true })
    res.json(data)
  } catch (err) {
    // Sólo un 401 es un problema de la key — un 403/404 es de la cuenta y marcarlo
    // como "token vencido" mandaría a reconectar una key que está perfecta (mismo
    // criterio que googleAds.controller.js).
    if (err.code === 'TOKEN_EXPIRED') {
      await prisma.projectIntegration.update({
        where: { projectId_type: { projectId, type: TYPE } },
        data:  { status: 'expired' },
      }).catch(e => console.error('[ChatGptAds] No se pudo marcar la integración como expirada:', e.message))
      return res.status(400).json({
        error: 'La API key de ChatGPT Ads ya no es válida. Generá una nueva en Ads Manager → Settings y volvé a conectar.',
        code:  'TOKEN_EXPIRED',
      })
    }
    if (err.code === 'PERMISSION_DENIED') {
      return res.status(400).json({
        error: 'La API key no tiene permiso para leer esta cuenta publicitaria.',
        code:  'PERMISSION_DENIED',
      })
    }
    if (err.code === 'NOT_FOUND') {
      return res.status(400).json({
        error: 'La cuenta publicitaria de la API key no existe o no está disponible.',
        code:  'NOT_FOUND',
      })
    }
    if (err.code === 'RATE_LIMITED') {
      return res.status(429).json({
        error: 'La API de ChatGPT Ads está limitando las consultas. Probá de nuevo en un minuto.',
        code:  'RATE_LIMITED',
      })
    }
    if (err.code === 'NO_API_KEY') {
      return res.status(400).json({ error: err.message, code: 'NOT_CONNECTED' })
    }
    if (err.code === 'API_ERROR') {
      console.error('[ChatGptAds] API error:', err.context, err.message)
      return res.status(400).json({ error: err.message || 'Error en la API de ChatGPT Ads' })
    }
    next(err)
  }
}

module.exports = { connectChatgptAdsToken, getChatgptAdsData }
