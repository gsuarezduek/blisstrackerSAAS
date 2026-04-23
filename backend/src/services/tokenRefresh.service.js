const { OAuth2Client } = require('google-auth-library')
const prisma           = require('../lib/prisma')
const { encrypt, decrypt } = require('../lib/encryption')

/**
 * Devuelve un access token válido para la integración.
 * Si está por expirar (< 5 min), lo refresca automáticamente usando el refresh_token.
 *
 * @param {object} integration — registro de ProjectIntegration de Prisma
 * @returns {Promise<string>} access token listo para usar
 */
async function getValidAccessToken(integration) {
  const now       = Date.now()
  const expiresAt = integration.expiresAt?.getTime() ?? 0

  // Reutilizar si todavía es válido por más de 5 minutos
  if (expiresAt - now > 5 * 60 * 1000 && integration.accessToken) {
    return decrypt(integration.accessToken)
  }

  if (!integration.refreshToken) {
    throw new Error('No hay refresh token disponible — el usuario debe reconectar la integración')
  }

  const client = new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
  )
  client.setCredentials({ refresh_token: decrypt(integration.refreshToken) })

  const { credentials } = await client.refreshAccessToken()

  // Persistir nuevo access token
  await prisma.projectIntegration.update({
    where: { id: integration.id },
    data: {
      accessToken: encrypt(credentials.access_token),
      expiresAt:   credentials.expiry_date ? new Date(credentials.expiry_date) : null,
      status:      'active',
    },
  })

  return credentials.access_token
}

module.exports = { getValidAccessToken }
