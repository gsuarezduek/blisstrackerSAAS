const crypto = require('crypto')
const axios  = require('axios')
const jwt    = require('jsonwebtoken')
const prisma = require('../lib/prisma')
const { encrypt } = require('../lib/encryption')

const TIKTOK_TOKEN_URL = 'https://open.tiktokapis.com/v2/oauth/token/'

function buildTikTokRedirectUri() {
  const base = process.env.BACKEND_URL || 'http://localhost:3001'
  return `${base}/api/marketing/integrations/tiktok/callback`
}

/**
 * GET /api/marketing/integrations/tiktok/auth-url?projectId=X
 */
async function getTikTokAuthUrl(req, res, next) {
  try {
    const { projectId } = req.query
    if (!projectId) return res.status(400).json({ error: 'projectId requerido' })

    const project = await prisma.project.findFirst({
      where: { id: Number(projectId), workspaceId: req.workspace.id },
      select: { id: true },
    })
    if (!project) return res.status(404).json({ error: 'Proyecto no encontrado' })

    // PKCE
    const codeVerifier  = crypto.randomBytes(32).toString('base64url')
    const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url')

    const state = jwt.sign(
      {
        projectId:    Number(projectId),
        workspaceId:  req.workspace.id,
        slug:         req.workspace.slug,
        userId:       req.user.userId,
        codeVerifier,
      },
      process.env.JWT_SECRET,
      { expiresIn: '10m' },
    )

    const params = new URLSearchParams({
      client_key:            process.env.TIKTOK_CLIENT_KEY,
      redirect_uri:          buildTikTokRedirectUri(),
      response_type:         'code',
      scope:                 'user.info.basic,user.info.stats,video.list',
      state,
      code_challenge:        codeChallenge,
      code_challenge_method: 'S256',
    })

    const url = `https://www.tiktok.com/v2/auth/authorize/?${params.toString()}`
    res.json({ url })
  } catch (err) { next(err) }
}

/**
 * GET /api/marketing/integrations/tiktok/callback?code=...&state=...
 * Sin auth middleware.
 */
async function handleTikTokCallback(req, res, next) {
  const { code, state, error: oauthError, error_description } = req.query
  const appDomain = process.env.APP_DOMAIN || 'blisstracker.app'

  if (oauthError) {
    const msg = error_description || oauthError
    return res.redirect(
      `${process.env.FRONTEND_URL || 'http://localhost:5173'}/oauth-result?error=${encodeURIComponent(msg)}`
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

  const { projectId, workspaceId, slug, userId, codeVerifier } = statePayload
  const isLocalDev   = process.env.NODE_ENV !== 'production'
  const frontendBase = isLocalDev
    ? (process.env.FRONTEND_URL || 'http://localhost:5173')
    : `https://${slug}.${appDomain}`

  const redirectUri = buildTikTokRedirectUri()

  try {
    // 1. Intercambiar code por tokens
    const tokenRes = await axios.post(
      TIKTOK_TOKEN_URL,
      new URLSearchParams({
        client_key:    process.env.TIKTOK_CLIENT_KEY,
        client_secret: process.env.TIKTOK_CLIENT_SECRET,
        code,
        grant_type:    'authorization_code',
        redirect_uri:  redirectUri,
        code_verifier: codeVerifier,
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
    )

    const body = tokenRes.data
    if (body.error?.code && body.error.code !== 'ok') {
      throw new Error(body.error.message || 'Error al obtener token de TikTok')
    }

    const data         = body.data
    const accessToken  = data.access_token
    const refreshToken = data.refresh_token
    const openId       = data.open_id
    const expiresAt    = new Date(Date.now() + data.expires_in * 1000)

    // 2. Upsert en ProjectIntegration
    await prisma.projectIntegration.upsert({
      where:  { projectId_type: { projectId, type: 'tiktok' } },
      update: {
        workspaceId, status: 'active', propertyId: openId,
        accessToken: encrypt(accessToken), refreshToken: encrypt(refreshToken),
        expiresAt, scopes: 'user.info.basic,user.info.stats,video.list',
        connectedById: userId, connectedAt: new Date(),
      },
      create: {
        projectId, workspaceId, type: 'tiktok', status: 'active',
        propertyId: openId, accessToken: encrypt(accessToken), refreshToken: encrypt(refreshToken),
        expiresAt, scopes: 'user.info.basic,user.info.stats,video.list',
        connectedById: userId, connectedAt: new Date(),
      },
    })

    console.log(`[TikTokOAuth] Conectado: proyecto ${projectId}, openId ${openId}`)
    res.redirect(`${frontendBase}/oauth-result?success=true&type=tiktok`)
  } catch (err) {
    console.error('[TikTokOAuth] Error:', JSON.stringify(err.response?.data ?? err.message, null, 2))
    const msg = err.response?.data?.error?.message || err.message
    res.redirect(`${frontendBase}/oauth-result?error=${encodeURIComponent(msg)}`)
  }
}

module.exports = { getTikTokAuthUrl, handleTikTokCallback }
