const { OAuth2Client } = require('google-auth-library')
const jwt              = require('jsonwebtoken')
const prisma           = require('../lib/prisma')
const { encrypt }      = require('../lib/encryption')

// Conexión OAuth de Google Calendar — POR PERSONA (no por proyecto, a diferencia
// de integrations.controller.js que gestiona GA4/Ads/GSC/YouTube vía
// ProjectIntegration). Mismo mecanismo de state JWT + intercambio de code que esos,
// pero sin projectId ni propagación entre proyectos (acá no aplica).
//
// ⚠️ calendar.events es un scope SENSIBLE de Google — como ya pasó con
// youtube.readonly, agregarlo a una app OAuth en Production dispara una
// re-verificación de Google. Hasta que esté aprobado, la conexión solo funciona
// para la cuenta del desarrollador o hasta ~100 usuarios de prueba agregados a
// mano en el OAuth Consent Screen (Testing users).
const SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'openid',
  'email',
]

function buildRedirectUri() {
  const base = process.env.BACKEND_URL || 'http://localhost:3001'
  return `${base}/api/calendar/google/callback`
}

function buildOAuthClient() {
  return new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    buildRedirectUri(),
  )
}

// GET /api/calendar/google/auth-url
async function getAuthUrl(req, res, next) {
  try {
    const state = jwt.sign(
      { workspaceId: req.workspace.id, slug: req.workspace.slug, userId: req.user.userId },
      process.env.JWT_SECRET,
      { expiresIn: '10m' },
    )
    const client = buildOAuthClient()
    const url = client.generateAuthUrl({
      access_type: 'offline',
      scope:       SCOPES,
      state,
      prompt:      'consent', // fuerza refresh_token siempre
    })
    res.json({ url })
  } catch (err) { next(err) }
}

// GET /api/calendar/google/callback — SIN auth, Google redirige acá directo.
async function handleCallback(req, res, next) {
  const { code, state, error } = req.query
  const frontendBase = process.env.FRONTEND_URL || 'http://localhost:5173'

  if (error) {
    return res.redirect(`${frontendBase}/oauth-result?error=${encodeURIComponent(error)}`)
  }

  try {
    let statePayload
    try {
      statePayload = jwt.verify(state, process.env.JWT_SECRET)
    } catch {
      return res.redirect(`${frontendBase}/oauth-result?error=invalid_state`)
    }
    const { workspaceId, userId } = statePayload

    const client = buildOAuthClient()
    const { tokens } = await client.getToken(code)

    const encAccessToken  = tokens.access_token  ? encrypt(tokens.access_token)  : null
    const encRefreshToken = tokens.refresh_token ? encrypt(tokens.refresh_token) : undefined
    const expiresAt       = tokens.expiry_date   ? new Date(tokens.expiry_date)  : null
    const idPayload    = tokens.id_token ? (jwt.decode(tokens.id_token) || {}) : {}
    const accountEmail = idPayload.email || null

    await prisma.googleCalendarConnection.upsert({
      where:  { userId_workspaceId: { userId, workspaceId } },
      update: { accessToken: encAccessToken, refreshToken: encRefreshToken, expiresAt, accountEmail, status: 'active' },
      create: { userId, workspaceId, accessToken: encAccessToken, refreshToken: encRefreshToken, expiresAt, accountEmail, status: 'active' },
    })

    res.redirect(`${frontendBase}/oauth-result?success=true&type=google_calendar`)
  } catch (err) {
    res.redirect(`${frontendBase}/oauth-result?error=${encodeURIComponent(err.message)}`)
  }
}

// GET /api/calendar/google/status
async function getStatus(req, res, next) {
  try {
    const connection = await prisma.googleCalendarConnection.findUnique({
      where:  { userId_workspaceId: { userId: req.user.userId, workspaceId: req.workspace.id } },
      select: { accountEmail: true, status: true, connectedAt: true },
    })
    res.json({
      connected:    !!connection && connection.status === 'active',
      accountEmail: connection?.accountEmail ?? null,
      status:       connection?.status ?? null,
    })
  } catch (err) { next(err) }
}

// DELETE /api/calendar/google
async function disconnect(req, res, next) {
  try {
    await prisma.googleCalendarConnection.deleteMany({
      where: { userId: req.user.userId, workspaceId: req.workspace.id },
    })
    res.json({ ok: true })
  } catch (err) { next(err) }
}

module.exports = { getAuthUrl, handleCallback, getStatus, disconnect }
