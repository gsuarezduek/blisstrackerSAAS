const { OAuth2Client } = require('google-auth-library')
const prisma           = require('../lib/prisma')
const { encrypt, decrypt } = require('../lib/encryption')

// Espejo de tokenRefresh.service.js, pero apuntado a GoogleCalendarConnection
// (conexión por PERSONA, no por ProjectIntegration) — no se reusa ese archivo
// porque está hardcodeado a `prisma.projectIntegration`, mismo criterio que
// metaTokenRefresh/tiktokTokenRefresh/linkedinTokenRefresh (un servicio de
// refresh por tipo de integración, no uno genérico).

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

  if (!connection.refreshToken) {
    await prisma.googleCalendarConnection.update({
      where: { id: connection.id },
      data:  { status: 'expired' },
    }).catch(err => console.error('[GoogleCalendarToken] Error al marcar conexión como expirada:', err.message))
    const e = new Error('No hay refresh token disponible — hay que reconectar Google Calendar')
    e.code = 'TOKEN_EXPIRED'
    throw e
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
      await prisma.googleCalendarConnection.update({
        where: { id: connection.id },
        data:  { status: 'expired' },
      }).catch(err2 => console.error('[GoogleCalendarToken] Error al marcar conexión como expirada:', err2.message))
      const e = new Error('El token de Google Calendar expiró. Reconectá.')
      e.code = 'TOKEN_EXPIRED'
      throw e
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

module.exports = { getValidAccessToken }
