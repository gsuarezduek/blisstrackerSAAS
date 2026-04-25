const { OAuth2Client }     = require('google-auth-library')
const jwt                  = require('jsonwebtoken')
const prisma               = require('../lib/prisma')
const { encrypt, decrypt } = require('../lib/encryption')

const SCOPES = {
  google_analytics:      ['https://www.googleapis.com/auth/analytics.readonly'],
  google_ads:            ['https://www.googleapis.com/auth/adwords'],
  google_search_console: ['https://www.googleapis.com/auth/webmasters.readonly'],
}

function buildRedirectUri() {
  const base = process.env.BACKEND_URL || 'http://localhost:3001'
  return `${base}/api/marketing/integrations/google/callback`
}

function buildOAuthClient() {
  return new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    buildRedirectUri(),
  )
}

/**
 * GET /api/marketing/integrations/google/auth-url?projectId=X&type=google_analytics
 * Genera la URL de autorización de Google para la integración solicitada.
 */
async function getAuthUrl(req, res, next) {
  try {
    const { projectId, type } = req.query
    if (!projectId || !SCOPES[type]) {
      return res.status(400).json({ error: 'projectId y type (google_analytics | google_ads | google_search_console) requeridos' })
    }

    const project = await prisma.project.findFirst({
      where: { id: Number(projectId), workspaceId: req.workspace.id },
      select: { id: true },
    })
    if (!project) return res.status(404).json({ error: 'Proyecto no encontrado' })

    // state JWT firmado: projectId, workspaceId, type, slug para construir redirect del frontend
    const state = jwt.sign(
      {
        projectId:   Number(projectId),
        workspaceId: req.workspace.id,
        slug:        req.workspace.slug,
        type,
        userId:      req.user.userId,
      },
      process.env.JWT_SECRET,
      { expiresIn: '10m' },
    )

    const client = buildOAuthClient()
    const url    = client.generateAuthUrl({
      access_type: 'offline',
      scope:       SCOPES[type],
      state,
      prompt:      'consent', // fuerza refresh_token siempre
    })

    // Verificar si el workspace ya tiene tokens de una integración anterior
    const existing = await prisma.projectIntegration.findFirst({
      where: {
        workspaceId: req.workspace.id,
        type,
        status: 'active',
        refreshToken: { not: null },
        NOT: { projectId: Number(projectId) },
      },
      select: { id: true },
    })

    res.json({ url, hasExistingTokens: !!existing })
  } catch (err) { next(err) }
}

/**
 * POST /api/marketing/projects/:id/integrations/connect-existing?type=google_analytics
 * Reutiliza tokens de una integración existente en el workspace (mismo tipo).
 * El usuario no necesita pasar por OAuth de nuevo.
 */
async function connectExisting(req, res, next) {
  try {
    const projectId = Number(req.params.id)
    const { type }  = req.query
    if (!SCOPES[type]) return res.status(400).json({ error: 'type inválido' })

    const project = await prisma.project.findFirst({
      where: { id: projectId, workspaceId: req.workspace.id },
      select: { id: true },
    })
    if (!project) return res.status(404).json({ error: 'Proyecto no encontrado' })

    // Buscar tokens existentes en el workspace
    const source = await prisma.projectIntegration.findFirst({
      where: {
        workspaceId: req.workspace.id,
        type,
        status: 'active',
        refreshToken: { not: null },
        NOT: { projectId },
      },
    })
    if (!source) return res.status(404).json({ error: 'No hay tokens previos en este workspace' })

    const integration = await prisma.projectIntegration.upsert({
      where:  { projectId_type: { projectId, type } },
      update: {
        status:       'active',
        accessToken:  source.accessToken,
        refreshToken: source.refreshToken,
        expiresAt:    source.expiresAt,
        scopes:       source.scopes,
        connectedById: req.user.userId,
        connectedAt:  new Date(),
      },
      create: {
        projectId,
        workspaceId: req.workspace.id,
        type,
        status:       'active',
        accessToken:  source.accessToken,
        refreshToken: source.refreshToken,
        expiresAt:    source.expiresAt,
        scopes:       source.scopes,
        connectedById: req.user.userId,
        connectedAt:  new Date(),
      },
      select: { type: true, status: true, propertyId: true, customerId: true, scopes: true, connectedAt: true },
    })

    res.json(integration)
  } catch (err) { next(err) }
}

/**
 * GET /api/marketing/integrations/google/callback?code=...&state=...
 * Recibe el código de autorización de Google, intercambia tokens, cifra y guarda.
 * Sin auth middleware — la request viene de Google, no del frontend.
 */
async function handleCallback(req, res, next) {
  const { code, state, error } = req.query
  const appDomain  = process.env.APP_DOMAIN || 'blisstracker.app'

  if (error) {
    // Redirigir de vuelta al frontend con error
    return res.redirect(
      `${process.env.FRONTEND_URL || 'http://localhost:5173'}/oauth-result?error=${encodeURIComponent(error)}`
    )
  }

  try {
    // Validar state JWT
    let statePayload
    try {
      statePayload = jwt.verify(state, process.env.JWT_SECRET)
    } catch {
      return res.redirect(
        `${process.env.FRONTEND_URL || 'http://localhost:5173'}/oauth-result?error=invalid_state`
      )
    }

    const { projectId, workspaceId, type, slug, userId } = statePayload

    // Intercambiar code por tokens
    const client         = buildOAuthClient()
    const { tokens }     = await client.getToken(code)

    const data = {
      workspaceId,
      status:       'active',
      scopes:       tokens.scope || SCOPES[type].join(' '),
      accessToken:  tokens.access_token ? encrypt(tokens.access_token) : null,
      refreshToken: tokens.refresh_token ? encrypt(tokens.refresh_token) : undefined,
      expiresAt:    tokens.expiry_date   ? new Date(tokens.expiry_date)  : null,
      connectedById: userId,
      connectedAt:  new Date(),
    }

    await prisma.projectIntegration.upsert({
      where:  { projectId_type: { projectId, type } },
      update: data,
      create: { projectId, type, ...data },
    })

    // Redirigir a la página puente del frontend (en el subdominio del workspace)
    const isLocalDev = process.env.NODE_ENV !== 'production'
    const frontendBase = isLocalDev
      ? (process.env.FRONTEND_URL || 'http://localhost:5173')
      : `https://${slug}.${appDomain}`

    res.redirect(`${frontendBase}/oauth-result?success=true&type=${encodeURIComponent(type)}`)
  } catch (err) {
    console.error('[integrations.callback] error:', err.message)
    // Intentar redirigir al workspace si tenemos el slug del state
    let frontendBase = process.env.FRONTEND_URL || 'http://localhost:5173'
    try {
      const payload = jwt.decode(req.query.state)
      if (payload?.slug) {
        const appDomain = process.env.APP_DOMAIN || 'blisstracker.app'
        frontendBase = process.env.NODE_ENV === 'production'
          ? `https://${payload.slug}.${appDomain}`
          : frontendBase
      }
    } catch { /* ignorar */ }
    res.redirect(`${frontendBase}/oauth-result?error=${encodeURIComponent(err.message)}`)
  }
}

/**
 * GET /api/marketing/projects/:id/integrations
 * Lista integraciones del proyecto (sin exponer tokens).
 */
async function listIntegrations(req, res, next) {
  try {
    const projectId   = Number(req.params.id)
    const workspaceId = req.workspace.id

    const project = await prisma.project.findFirst({
      where: { id: projectId, workspaceId },
      select: { id: true },
    })
    if (!project) return res.status(404).json({ error: 'Proyecto no encontrado' })

    const integrations = await prisma.projectIntegration.findMany({
      where: { projectId },
      select: {
        type: true, status: true, propertyId: true,
        customerId: true, country: true, scopes: true, connectedAt: true,
        // tokens NO se devuelven al frontend
      },
    })

    res.json(integrations)
  } catch (err) { next(err) }
}

/**
 * PATCH /api/marketing/projects/:id/integrations/:type
 * Actualiza propertyId o customerId de una integración.
 */
async function updateIntegration(req, res, next) {
  try {
    const projectId = Number(req.params.id)
    const type      = req.params.type
    const { propertyId, customerId, country } = req.body

    const project = await prisma.project.findFirst({
      where: { id: projectId, workspaceId: req.workspace.id },
      select: { id: true },
    })
    if (!project) return res.status(404).json({ error: 'Proyecto no encontrado' })

    const updateData = {}
    if (propertyId !== undefined) updateData.propertyId = propertyId || null
    if (customerId !== undefined) updateData.customerId = customerId || null
    if (country    !== undefined) updateData.country    = country    || 'arg'

    const updated = await prisma.projectIntegration.update({
      where: { projectId_type: { projectId, type } },
      data:  updateData,
      select: { type: true, status: true, propertyId: true, customerId: true, country: true, scopes: true },
    })

    res.json(updated)
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Integración no encontrada' })
    next(err)
  }
}

/**
 * DELETE /api/marketing/projects/:id/integrations/:type
 * Desconecta una integración y revoca el token en Google.
 */
async function disconnect(req, res, next) {
  try {
    const projectId = Number(req.params.id)
    const type      = req.params.type

    const project = await prisma.project.findFirst({
      where: { id: projectId, workspaceId: req.workspace.id },
      select: { id: true },
    })
    if (!project) return res.status(404).json({ error: 'Proyecto no encontrado' })

    const integration = await prisma.projectIntegration.findUnique({
      where: { projectId_type: { projectId, type } },
    })

    if (integration?.accessToken) {
      try {
        const client = buildOAuthClient()
        client.setCredentials({ access_token: decrypt(integration.accessToken) })
        await client.revokeCredentials()
      } catch { /* ignorar si ya estaba revocado */ }
    }

    await prisma.projectIntegration.delete({
      where: { projectId_type: { projectId, type } },
    })

    res.json({ ok: true })
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Integración no encontrada' })
    next(err)
  }
}

module.exports = { getAuthUrl, handleCallback, connectExisting, listIntegrations, updateIntegration, disconnect }
