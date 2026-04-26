const axios            = require('axios')
const jwt              = require('jsonwebtoken')
const prisma           = require('../lib/prisma')
const { encrypt }      = require('../lib/encryption')
const { resolveIgUserId } = require('../services/instagram.service')

const META_GRAPH = 'https://graph.facebook.com/v21.0'

function buildMetaRedirectUri() {
  const base = process.env.BACKEND_URL || 'http://localhost:3001'
  return `${base}/api/marketing/integrations/meta/callback`
}

/**
 * GET /api/marketing/integrations/meta/auth-url?projectId=X
 * Genera la URL de autorización de Meta/Facebook para conectar Instagram.
 */
async function getMetaAuthUrl(req, res, next) {
  try {
    const { projectId } = req.query
    if (!projectId) {
      return res.status(400).json({ error: 'projectId requerido' })
    }

    const project = await prisma.project.findFirst({
      where: { id: Number(projectId), workspaceId: req.workspace.id },
      select: { id: true },
    })
    if (!project) return res.status(404).json({ error: 'Proyecto no encontrado' })

    // State JWT firmado — 10 minutos de validez
    const state = jwt.sign(
      {
        projectId:   Number(projectId),
        workspaceId: req.workspace.id,
        slug:        req.workspace.slug,
        userId:      req.user.userId,
      },
      process.env.JWT_SECRET,
      { expiresIn: '10m' },
    )

    const params = new URLSearchParams({
      client_id:     process.env.META_APP_ID,
      redirect_uri:  buildMetaRedirectUri(),
      scope:         'instagram_business_basic,pages_show_list,pages_read_engagement',
      state,
      response_type: 'code',
    })

    const url = `https://www.facebook.com/dialog/oauth?${params.toString()}`
    res.json({ url })
  } catch (err) { next(err) }
}

/**
 * GET /api/marketing/integrations/meta/callback?code=...&state=...
 * Recibe el código de Meta, canjea por long-lived token, resuelve IG User ID y guarda.
 * Sin auth middleware.
 */
async function handleMetaCallback(req, res, next) {
  const { code, state, error: oauthError } = req.query
  const appDomain = process.env.APP_DOMAIN || 'blisstracker.app'

  if (oauthError) {
    return res.redirect(
      `${process.env.FRONTEND_URL || 'http://localhost:5173'}/oauth-result?error=${encodeURIComponent(oauthError)}`
    )
  }

  let statePayload
  try {
    statePayload = jwt.verify(state, process.env.JWT_SECRET)
  } catch {
    return res.redirect(
      `${process.env.FRONTEND_URL || 'http://localhost:5173'}/oauth-result?error=invalid_state`
    )
  }

  const { projectId, workspaceId, slug, userId } = statePayload

  const isLocalDev    = process.env.NODE_ENV !== 'production'
  const frontendBase  = isLocalDev
    ? (process.env.FRONTEND_URL || 'http://localhost:5173')
    : `https://${slug}.${appDomain}`

  try {
    // 1. Intercambiar code por short-lived user access token
    const tokenRes = await axios.get(`${META_GRAPH}/oauth/access_token`, {
      params: {
        client_id:     process.env.META_APP_ID,
        client_secret: process.env.META_APP_SECRET,
        redirect_uri:  buildMetaRedirectUri(),
        code,
      },
    })
    const shortToken = tokenRes.data.access_token

    // 2. Canjear short-lived → long-lived (60 días)
    const longRes = await axios.get(`${META_GRAPH}/oauth/access_token`, {
      params: {
        grant_type:        'fb_exchange_token',
        client_id:         process.env.META_APP_ID,
        client_secret:     process.env.META_APP_SECRET,
        fb_exchange_token: shortToken,
      },
    })
    const longToken  = longRes.data.access_token
    const expiresIn  = longRes.data.expires_in ?? 5183944 // ~60 días (segundos)
    const expiresAt  = new Date(Date.now() + expiresIn * 1000)

    // 3. Resolver Instagram User ID (Business/Creator Account)
    const { igUserId, username } = await resolveIgUserId(longToken)

    // 4. Upsert en ProjectIntegration
    await prisma.projectIntegration.upsert({
      where:  { projectId_type: { projectId, type: 'instagram' } },
      update: {
        workspaceId,
        status:       'active',
        propertyId:   igUserId,
        accessToken:  encrypt(longToken),
        refreshToken: null,        // Meta no tiene refresh_token
        expiresAt,
        scopes:       'instagram_business_basic,pages_show_list,pages_read_engagement',
        connectedById: userId,
        connectedAt:  new Date(),
      },
      create: {
        projectId,
        workspaceId,
        type:         'instagram',
        status:       'active',
        propertyId:   igUserId,
        accessToken:  encrypt(longToken),
        refreshToken: null,
        expiresAt,
        scopes:       'instagram_business_basic,pages_show_list,pages_read_engagement',
        connectedById: userId,
        connectedAt:  new Date(),
      },
    })

    console.log(`[MetaOAuth] Instagram conectado: proyecto ${projectId}, IG User @${username} (${igUserId})`)
    res.redirect(`${frontendBase}/oauth-result?success=true&type=instagram`)
  } catch (err) {
    console.error('[MetaOAuth] Error en callback:', err.message)
    res.redirect(`${frontendBase}/oauth-result?error=${encodeURIComponent(err.message)}`)
  }
}

module.exports = { getMetaAuthUrl, handleMetaCallback }
