const { OAuth2Client }     = require('google-auth-library')
const jwt                  = require('jsonwebtoken')
const prisma               = require('../lib/prisma')
const { encrypt, decrypt } = require('../lib/encryption')

// GA4 y Search Console comparten el mismo scope set — una sola auth sirve para ambos
const GOOGLE_COMBINED_SCOPES = [
  'https://www.googleapis.com/auth/analytics.readonly',
  'https://www.googleapis.com/auth/webmasters.readonly',
]

// Scopes de identidad: pedimos openid+email SOLO para recibir un id_token y saber
// QUÉ cuenta de Google autorizó. No se persisten como scopes de la integración;
// sirven para scopear la propagación de tokens por cuenta. No son sensibles
// (no requieren verificación de Google).
const GOOGLE_IDENTITY_SCOPES = ['openid', 'email']

// Scopes de DATOS por tipo (sin identidad) — son los que se persisten en la integración.
const DATA_SCOPES = {
  google_analytics:      GOOGLE_COMBINED_SCOPES,
  google_search_console: GOOGLE_COMBINED_SCOPES,
  google_ads:            ['https://www.googleapis.com/auth/adwords'],
  // YouTube Data API v3 — lectura del canal del usuario (suscriptores, videos, vistas).
  // youtube.readonly es un scope SENSIBLE: con la app OAuth publicada, agregarlo dispara
  // la re-verificación de Google (mismo trámite ya hecho para analytics.readonly).
  google_youtube:        ['https://www.googleapis.com/auth/youtube.readonly'],
}

// Scopes que se piden en el consent de OAuth (datos + identidad).
const SCOPES = {
  google_analytics:      [...DATA_SCOPES.google_analytics,      ...GOOGLE_IDENTITY_SCOPES],
  google_ads:            [...DATA_SCOPES.google_ads,            ...GOOGLE_IDENTITY_SCOPES],
  google_search_console: [...DATA_SCOPES.google_search_console, ...GOOGLE_IDENTITY_SCOPES],
  google_youtube:        [...DATA_SCOPES.google_youtube,        ...GOOGLE_IDENTITY_SCOPES],
}

// Tipos que comparten tokens entre sí
const GOOGLE_LINKED_TYPES = ['google_analytics', 'google_search_console']

// IDs recordados por tipo (Project.integrationDefaults, JSON guardado como string).
// Permiten repoblar propertyId/customerId/country al reconectar sin volver a buscarlos.
function parseIntegrationDefaults(raw) {
  if (!raw) return {}
  if (typeof raw === 'object') return raw
  try { return JSON.parse(raw) } catch { return {} }
}

// Campos de ID a aplicar al CREAR una integración nueva, según lo recordado para ese tipo.
function rememberedFieldsFor(defaults, type) {
  const d = defaults?.[type] || {}
  const out = {}
  if (d.propertyId) out.propertyId = d.propertyId
  if (d.customerId) out.customerId = d.customerId
  if (d.country)    out.country    = d.country
  return out
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
      return res.status(400).json({ error: 'projectId y type (google_analytics | google_ads | google_search_console | google_youtube) requeridos' })
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
      select: { id: true, integrationDefaults: true },
    })
    if (!project) return res.status(404).json({ error: 'Proyecto no encontrado' })

    // Buscar tokens vigentes en el workspace (status active, no expirados)
    const source = await prisma.projectIntegration.findFirst({
      where: {
        workspaceId: req.workspace.id,
        type,
        status:      'active',
        refreshToken: { not: null },
        expiresAt:   { gt: new Date() },
        NOT: { projectId },
      },
    })
    if (!source) return res.status(404).json({ error: 'No hay tokens vigentes en este workspace', code: 'NO_VALID_TOKEN' })

    const integration = await prisma.projectIntegration.upsert({
      where:  { projectId_type: { projectId, type } },
      update: {
        status:       'active',
        accessToken:  source.accessToken,
        refreshToken: source.refreshToken,
        expiresAt:    source.expiresAt,
        scopes:       source.scopes,
        accountId:    source.accountId,
        accountEmail: source.accountEmail,
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
        accountId:    source.accountId,
        accountEmail: source.accountEmail,
        connectedById: req.user.userId,
        connectedAt:  new Date(),
        ...rememberedFieldsFor(parseIntegrationDefaults(project.integrationDefaults), type),
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

    const encAccessToken  = tokens.access_token  ? encrypt(tokens.access_token)  : null
    const encRefreshToken = tokens.refresh_token ? encrypt(tokens.refresh_token) : undefined
    const expiresAt       = tokens.expiry_date   ? new Date(tokens.expiry_date)  : null

    // Identidad de la cuenta de Google que autorizó (del id_token recibido en el
    // intercambio directo con Google sobre TLS — no requiere verificar firma).
    const idPayload   = tokens.id_token ? (jwt.decode(tokens.id_token) || {}) : {}
    const accountId   = idPayload.sub   || null
    const accountEmail = idPayload.email || null

    const baseData = {
      workspaceId,
      status:        'active',
      scopes:        (DATA_SCOPES[type] || GOOGLE_COMBINED_SCOPES).join(' '),
      accessToken:   encAccessToken,
      refreshToken:  encRefreshToken,
      expiresAt,
      accountId,
      accountEmail,
      connectedById: userId,
      connectedAt:   new Date(),
    }

    // Si es GA4 o GSC, guardar ambos registros con los mismos tokens
    // (una sola auth OAuth sirve para los dos servicios)
    const typesToSave = GOOGLE_LINKED_TYPES.includes(type)
      ? GOOGLE_LINKED_TYPES
      : [type]

    // IDs recordados de una conexión anterior — solo se aplican al CREAR la fila
    // (en el update se preservan los que ya tenga la integración existente).
    const projForDefaults = await prisma.project.findUnique({
      where:  { id: projectId },
      select: { integrationDefaults: true },
    })
    const defaults = parseIntegrationDefaults(projForDefaults?.integrationDefaults)

    for (const t of typesToSave) {
      await prisma.projectIntegration.upsert({
        where:  { projectId_type: { projectId, type: t } },
        update: baseData,
        create: { projectId, type: t, ...baseData, ...rememberedFieldsFor(defaults, t) },
      })
    }

    // Propagar el nuevo refresh_token a los proyectos del workspace que comparten ESTE token.
    // Evita que otros proyectos queden con un refresh token viejo (→ invalid_grant) tras reconectar uno.
    // `typesToSave` es exactamente el grupo que comparte el mismo token/scope:
    //   - GA4/GSC comparten una sola auth (GOOGLE_LINKED_TYPES).
    //   - google_ads usa el scope `adwords` por separado, pero entre proyectos con google_ads
    //     comparten el refresh token del mismo usuario de Google → se propaga solo a otros google_ads.
    // IMPORTANTE: se scopea por `accountId` (cuenta de Google). Con 2 cuentas distintas en el
    // mismo workspace, reconectar una NO pisa el token de la otra. Si no sabemos la cuenta
    // (sin id_token), NO propagamos (mejor no propagar que pisar la cuenta equivocada).
    if (encRefreshToken && accountId) {
      await prisma.projectIntegration.updateMany({
        where: {
          workspaceId,
          type:        { in: typesToSave },
          NOT:         { projectId },          // no pisar el que acabamos de guardar
          refreshToken: { not: null },
          accountId,                           // solo filas de la MISMA cuenta de Google
        },
        data: {
          accessToken:  encAccessToken,
          refreshToken: encRefreshToken,
          expiresAt,
          accountEmail,
          status:       'active',              // reactiva los que estaban expired
        },
      })
    }

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

    // Cambiar de cuenta/manager no es un problema de token: si la integración quedó
    // marcada `expired` por una falla previa, reactivarla para que la próxima llamada
    // revalide con el token actual. Si el token estuviera realmente muerto, el flujo de
    // datos la volverá a marcar `expired`. Solo aplica si hay refresh token para reintentar.
    if (Object.keys(updateData).length > 0) {
      const current = await prisma.projectIntegration.findUnique({
        where:  { projectId_type: { projectId, type } },
        select: { status: true, refreshToken: true },
      })
      if (current?.status === 'expired' && current.refreshToken) {
        updateData.status = 'active'
      }
    }

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

    // Recordar los IDs configurados para no tener que volver a buscarlos al reconectar.
    const remembered = {}
    if (integration?.propertyId) remembered.propertyId = integration.propertyId
    if (integration?.customerId) remembered.customerId = integration.customerId
    if (integration?.country)    remembered.country    = integration.country
    if (Object.keys(remembered).length > 0) {
      const proj = await prisma.project.findUnique({
        where:  { id: projectId },
        select: { integrationDefaults: true },
      })
      const defaults = parseIntegrationDefaults(proj?.integrationDefaults)
      defaults[type] = { ...(defaults[type] || {}), ...remembered }
      await prisma.project.update({
        where: { id: projectId },
        data:  { integrationDefaults: JSON.stringify(defaults) },
      })
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
