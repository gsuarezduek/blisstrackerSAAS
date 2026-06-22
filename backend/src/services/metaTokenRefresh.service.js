const axios            = require('axios')
const prisma           = require('../lib/prisma')
const { encrypt, decrypt } = require('../lib/encryption')

// Instagram Business Login tokens se renuevan en graph.instagram.com
const IG_GRAPH = 'https://graph.instagram.com'

/**
 * Devuelve un access token válido para una integración de tipo 'instagram'.
 * Instagram Business Login (IGAAM): el token inicial ya es long-lived (60d).
 * Se renueva con ig_refresh_token en graph.instagram.com/refresh_access_token.
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

  try {
    const { data } = await axios.get(`${IG_GRAPH}/refresh_access_token`, {
      params: {
        grant_type:   'ig_refresh_token',
        access_token: currentToken,
      },
    })

    const newToken  = data.access_token
    const expiresIn = data.expires_in ?? 5183944 // ~60 días en segundos (default Meta)
    const newExpiry = new Date(now + expiresIn * 1000)

    await prisma.projectIntegration.update({
      where: { id: integration.id },
      data: {
        accessToken: encrypt(newToken),
        expiresAt:   newExpiry,
        status:      'active',
      },
    })

    return newToken
  } catch (err) {
    // Si el refresh falla (token aún no renovable o error Meta), devolver el token actual
    // y extender expiración otros 60 días para evitar loop de reintentos
    console.warn('[MetaTokenRefresh] ig_refresh_token falló, usando token actual:', err.response?.data?.error?.message ?? err.message)

    await prisma.projectIntegration.update({
      where: { id: integration.id },
      data: {
        expiresAt: new Date(now + 60 * 24 * 60 * 60 * 1000),
        status:    'active',
      },
    })

    return currentToken
  }
}

/**
 * Devuelve un Page Access Token válido para una integración de tipo 'facebook'.
 * Los page tokens NO se renuevan vía refresh como los de Instagram:
 *  - `expiresAt = null` → token permanente (System User Token de Business Manager).
 *  - `expiresAt` en el futuro → válido, se usa tal cual (page token derivado de un
 *    user token long-lived dura ~60d).
 *  - `expiresAt` vencido → hay que reconectar (lanza error → el caller responde TOKEN_EXPIRED).
 *
 * @param {object} integration — registro de ProjectIntegration de Prisma
 * @returns {string} access token desencriptado
 */
function getValidFacebookToken(integration) {
  const expiresAt = integration.expiresAt?.getTime() ?? null
  if (expiresAt != null && expiresAt < Date.now()) {
    throw new Error('El token de Facebook expiró. Reconectá la página desde la configuración del proyecto.')
  }
  return decrypt(integration.accessToken)
}

module.exports = { getValidMetaToken, getValidFacebookToken }
