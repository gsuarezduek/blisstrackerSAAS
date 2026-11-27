const { OAuth2Client } = require('google-auth-library')
const prisma           = require('../lib/prisma')
const { encrypt, decrypt } = require('../lib/encryption')
const { emitTo }           = require('../lib/socket')

// Espejo de tokenRefresh.service.js, pero apuntado a GoogleCalendarConnection
// (conexión por PERSONA, no por ProjectIntegration) — no se reusa ese archivo
// porque está hardcodeado a `prisma.projectIntegration`, mismo criterio que
// metaTokenRefresh/tiktokTokenRefresh/linkedinTokenRefresh (un servicio de
// refresh por tipo de integración, no uno genérico).

// Estados de GoogleCalendarConnection que piden que la persona vuelva a conectar:
// `expired` (Google revocó o venció el refresh token) y `missing_scope` (conectó
// destildando el permiso del calendario — la pantalla de Google lo permite, y el
// token sirve para el login pero cada pedido al calendario da 403).
const NEEDS_RECONNECT = ['expired', 'missing_scope']

const RECONNECT_MESSAGE = {
  expired:       'Tu Google Calendar se desconectó. Volvé a conectarlo desde Calendario → Mis calendarios para seguir viendo tus eventos y empujando tus reuniones.',
  missing_scope: 'Tu Google Calendar está conectado sin permiso para el calendario. Volvé a conectarlo desde Calendario → Mis calendarios y dejá tildada la casilla del calendario.',
}

function reconnectError(status) {
  const e = new Error(status === 'missing_scope'
    ? 'Falta el permiso del calendario: volvé a conectar Google Calendar'
    : 'Hay que volver a conectar Google Calendar')
  e.code = 'TOKEN_EXPIRED'
  return e
}

/**
 * Marca la conexión como caída y le avisa a su dueño — una sola vez por caída.
 *
 * El `updateMany` condicionado a `status: 'active'` es lo que hace la transición
 * atómica: el cron, el refresco interactivo y un push pueden toparse con el mismo
 * token vencido a la vez, y solo el que efectivamente la pasa de activa a caída
 * avisa. Mientras siga caída, nadie más vuelve a avisar ni a loguear; el cron
 * directamente la saltea (externalCalendar.service#syncAllDue). Reconectar la
 * vuelve a `active` (googleCalendarAuth.controller#handleCallback).
 */
async function markNeedsReconnect(connection, status) {
  let changed = 0
  try {
    const res = await prisma.googleCalendarConnection.updateMany({
      where: { id: connection.id, status: 'active' },
      data:  { status },
    })
    changed = res.count
  } catch (err) {
    console.error('[GoogleCalendarToken] Error al marcar la conexión para reconectar:', err.message)
    return
  }
  if (!changed) return

  console.log(`[GoogleCalendarToken] Conexión ${connection.id} (user ${connection.userId}) → ${status}: se avisa para reconectar.`)
  try {
    await prisma.notification.create({
      data: {
        userId:      connection.userId,
        workspaceId: connection.workspaceId,
        type:        'CALENDAR_CONNECTION',
        message:     RECONNECT_MESSAGE[status] || RECONNECT_MESSAGE.expired,
      },
    })
    emitTo(`user:${connection.userId}`, 'notification:new', { type: 'CALENDAR_CONNECTION' })
  } catch (err) {
    console.error('[GoogleCalendarToken] No se pudo crear el aviso de reconexión:', err.message)
  }
}

/**
 * Devuelve un access token válido para la conexión de Google Calendar.
 * Si está por expirar (< 5 min), lo refresca usando el refresh_token.
 * @param {object} connection — registro de GoogleCalendarConnection de Prisma
 * @returns {Promise<string>}
 */
async function getValidAccessToken(connection) {
  const now       = Date.now()
  const expiresAt = connection.expiresAt?.getTime() ?? 0

  if (expiresAt - now > 5 * 60 * 1000 && connection.accessToken) {
    return decrypt(connection.accessToken)
  }

  if (NEEDS_RECONNECT.includes(connection.status)) throw reconnectError(connection.status)

  if (!connection.refreshToken) {
    await markNeedsReconnect(connection, 'expired')
    throw reconnectError('expired')
  }

  const client = new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
  )
  client.setCredentials({ refresh_token: decrypt(connection.refreshToken) })

  let credentials
  try {
    const result = await client.refreshAccessToken()
    credentials = result.credentials
  } catch (err) {
    const isInvalidGrant = err.message?.includes('invalid_grant') || err.response?.data?.error === 'invalid_grant'
    if (isInvalidGrant) {
      await markNeedsReconnect(connection, 'expired')
      throw reconnectError('expired')
    }
    throw err
  }

  await prisma.googleCalendarConnection.update({
    where: { id: connection.id },
    data: {
      accessToken: encrypt(credentials.access_token),
      expiresAt:   credentials.expiry_date ? new Date(credentials.expiry_date) : null,
      status:      'active',
    },
  })

  return credentials.access_token
}

/**
 * true si el error de una llamada a la API de Calendar significa que el token no
 * tiene el permiso del calendario (403 ACCESS_TOKEN_SCOPE_INSUFFICIENT,
 * "Request had insufficient authentication scopes"). Reintentar no lo arregla.
 */
function isMissingScopeError(err) {
  const data = err?.response?.data?.error
  if (err?.response?.status !== 403 || !data) return false
  const reasons = (data.details || []).map(d => d.reason).concat((data.errors || []).map(e => e.reason))
  return reasons.includes('ACCESS_TOKEN_SCOPE_INSUFFICIENT') ||
    /insufficient authentication scopes/i.test(data.message || '')
}

module.exports = { getValidAccessToken, markNeedsReconnect, isMissingScopeError, reconnectError, NEEDS_RECONNECT }
