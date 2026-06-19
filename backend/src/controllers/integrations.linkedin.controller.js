const axios  = require('axios')
const jwt    = require('jsonwebtoken')
const prisma = require('../lib/prisma')
const { encrypt } = require('../lib/encryption')
const { listAdminOrganizations } = require('../services/linkedin.service')

const LINKEDIN_AUTH_URL  = 'https://www.linkedin.com/oauth/v2/authorization'
const LINKEDIN_TOKEN_URL = 'https://www.linkedin.com/oauth/v2/accessToken'

// Scopes mínimos de sólo lectura para Company Page (Community Management API)
const LINKEDIN_SCOPES = 'r_organization_social r_organization_admin'

function buildLinkedinRedirectUri() {
  const base = process.env.BACKEND_URL || 'http://localhost:3001'
  return `${base}/api/marketing/integrations/linkedin/callback`
}

/**
 * GET /api/marketing/integrations/linkedin/auth-url?projectId=X
 */
async function getLinkedinAuthUrl(req, res, next) {
  try {
    const { projectId } = req.query
    if (!projectId) return res.status(400).json({ error: 'projectId requerido' })

    // Pre-chequeo: sin credenciales el popup iría a LinkedIn y fallaría con un
    // error genérico de ellos. Avisamos claro acá antes de abrir nada.
    if (!process.env.LINKEDIN_CLIENT_ID || !process.env.LINKEDIN_CLIENT_SECRET) {
      return res.status(503).json({
        error: 'LinkedIn no está configurado en el servidor: faltan las variables LINKEDIN_CLIENT_ID y/o LINKEDIN_CLIENT_SECRET.',
        code:  'NOT_CONFIGURED',
      })
    }

    const project = await prisma.project.findFirst({
      where:  { id: Number(projectId), workspaceId: req.workspace.id },
      select: { id: true },
    })
    if (!project) return res.status(404).json({ error: 'Proyecto no encontrado' })

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
      response_type: 'code',
      client_id:     process.env.LINKEDIN_CLIENT_ID,
      redirect_uri:  buildLinkedinRedirectUri(),
      state,
      scope:         LINKEDIN_SCOPES,
    })

    res.json({ url: `${LINKEDIN_AUTH_URL}?${params.toString()}` })
  } catch (err) { next(err) }
}

/**
 * GET /api/marketing/integrations/linkedin/callback?code=...&state=...
 * Sin auth middleware — viene de LinkedIn.
 */
async function handleLinkedinCallback(req, res, next) {
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

  const { projectId, workspaceId, slug, userId } = statePayload
  const isLocalDev   = process.env.NODE_ENV !== 'production'
  const frontendBase = isLocalDev
    ? (process.env.FRONTEND_URL || 'http://localhost:5173')
    : `https://${slug}.${appDomain}`

  const redirectUri = buildLinkedinRedirectUri()

  try {
    // 1. Intercambiar code por tokens
    const tokenRes = await axios.post(
      LINKEDIN_TOKEN_URL,
      new URLSearchParams({
        grant_type:    'authorization_code',
        code,
        redirect_uri:  redirectUri,
        client_id:     process.env.LINKEDIN_CLIENT_ID,
        client_secret: process.env.LINKEDIN_CLIENT_SECRET,
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
    )

    const accessToken  = tokenRes.data.access_token
    const refreshToken = tokenRes.data.refresh_token ?? null
    const expiresIn    = tokenRes.data.expires_in ?? 5184000 // 60 días default
    const expiresAt    = new Date(Date.now() + expiresIn * 1000)

    // 2. Listar organizaciones donde el user es admin — si hay solo 1, autoselect
    let propertyId = null
    try {
      const orgs = await listAdminOrganizations(accessToken)
      if (orgs.length === 1) propertyId = orgs[0].id
    } catch (err) {
      console.warn('[LinkedinOAuth] No se pudieron listar orgs (se guardará sin propertyId):', err.message)
    }

    // 3. Upsert ProjectIntegration
    await prisma.projectIntegration.upsert({
      where:  { projectId_type: { projectId, type: 'linkedin' } },
      update: {
        workspaceId, status: 'active', propertyId,
        accessToken: encrypt(accessToken),
        refreshToken: refreshToken ? encrypt(refreshToken) : null,
        expiresAt, scopes: LINKEDIN_SCOPES,
        connectedById: userId, connectedAt: new Date(),
      },
      create: {
        projectId, workspaceId, type: 'linkedin', status: 'active',
        propertyId,
        accessToken: encrypt(accessToken),
        refreshToken: refreshToken ? encrypt(refreshToken) : null,
        expiresAt, scopes: LINKEDIN_SCOPES,
        connectedById: userId, connectedAt: new Date(),
      },
    })

    console.log(`[LinkedinOAuth] Conectado: proyecto ${projectId}, org ${propertyId ?? 'pendiente de elección'}`)
    res.redirect(`${frontendBase}/oauth-result?success=true&type=linkedin`)
  } catch (err) {
    console.error('[LinkedinOAuth] Error:', JSON.stringify(err.response?.data ?? err.message, null, 2))
    let msg = err.response?.data?.error_description || err.response?.data?.message || err.message
    // Pistas accionables para las fallas de configuración más comunes.
    if (/redirect/i.test(msg)) msg += ` · Registrá esta redirect URI exacta en la app de LinkedIn: ${redirectUri}`
    else if (/client|unauthorized|invalid_request/i.test(msg)) msg += ' · Revisá LINKEDIN_CLIENT_ID / LINKEDIN_CLIENT_SECRET en el servidor'
    res.redirect(`${frontendBase}/oauth-result?error=${encodeURIComponent(msg)}`)
  }
}

module.exports = { getLinkedinAuthUrl, handleLinkedinCallback }
