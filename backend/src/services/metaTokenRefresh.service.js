const axios            = require('axios')
const prisma           = require('../lib/prisma')
const { encrypt, decrypt } = require('../lib/encryption')

// Instagram Business Login tokens se renuevan en graph.instagram.com
const IG_GRAPH = 'https://graph.instagram.com'

/**
 * Devuelve un access token válido para una integración de tipo 'instagram'.
 * Meta no usa refresh_token clásico — extiende el long-lived token usando
 * el mismo endpoint fb_exchange_token con el token vigente.
 *
 * - Si faltan >10 días para expirar: devuelve el token actual.
 * - Si quedan ≤10 días: extiende el token (nueva ventana de 60 días) y lo persiste.
 * - Si ya expiró: lanza error (el usuario debe reconectar).
 *
 * @param {object} integration — registro de ProjectIntegration de Prisma
 * @returns {Promise<string>} access token listo para usar
 */
async function getValidMetaToken(integration) {
  const now       = Date.now()
  const expiresAt = integration.expiresAt?.getTime() ?? 0

  // Token ya expirado — no se puede extender automáticamente
  if (expiresAt < now) {
    throw new Error('El token de Instagram expiró. Reconectá la cuenta desde la configuración del proyecto.')
  }

  // Todavía válido por más de 10 días — reutilizar
  if (expiresAt - now > 10 * 24 * 60 * 60 * 1000) {
    return decrypt(integration.accessToken)
  }

  // Queda poco tiempo — renovar el long-lived token (Instagram Business Login)
  const currentToken = decrypt(integration.accessToken)

  const { data } = await axios.get(`${IG_GRAPH}/refresh_access_token`, {
    params: {
      grant_type:   'ig_refresh_token',
      access_token: currentToken,
    },
  })

  const newToken    = data.access_token
  const expiresIn   = data.expires_in ?? 5183944 // ~60 días en segundos (default Meta)
  const newExpiry   = new Date(now + expiresIn * 1000)

  await prisma.projectIntegration.update({
    where: { id: integration.id },
    data: {
      accessToken: encrypt(newToken),
      expiresAt:   newExpiry,
      status:      'active',
    },
  })

  return newToken
}

module.exports = { getValidMetaToken }
