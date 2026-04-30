const axios   = require('axios')
const prisma  = require('../lib/prisma')
const { encrypt, decrypt } = require('../lib/encryption')

const TIKTOK_TOKEN_URL = 'https://open.tiktokapis.com/v2/oauth/token/'

/**
 * Devuelve un access token válido para TikTok.
 * Si el token está por vencer (< 5 min), lo refresca con el refresh token.
 * Si el refresh token venció también, lanza error para reconectar.
 */
async function getValidTikTokToken(integration) {
  const now = Date.now()

  // Access token todavía válido (con buffer de 5 min)
  if (integration.expiresAt && integration.expiresAt.getTime() > now + 5 * 60 * 1000) {
    return decrypt(integration.accessToken)
  }

  if (!integration.refreshToken) {
    throw new Error('Token de TikTok expirado sin refresh token. Reconectá la cuenta.')
  }

  const refreshToken = decrypt(integration.refreshToken)

  const res = await axios.post(
    TIKTOK_TOKEN_URL,
    new URLSearchParams({
      client_key:    process.env.TIKTOK_CLIENT_KEY,
      client_secret: process.env.TIKTOK_CLIENT_SECRET,
      grant_type:    'refresh_token',
      refresh_token: refreshToken,
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
  )

  const body = res.data
  if (body.error?.code && body.error.code !== 'ok') {
    throw new Error(`No se pudo renovar el token de TikTok: ${body.error.message}. Reconectá la cuenta.`)
  }

  const data            = body.data ?? body
  const newAccessToken  = data.access_token
  const newRefreshToken = data.refresh_token || refreshToken
  const expiresAt       = new Date(now + (data.expires_in ?? 86400) * 1000)

  await prisma.projectIntegration.update({
    where: { id: integration.id },
    data: {
      accessToken:  encrypt(newAccessToken),
      refreshToken: encrypt(newRefreshToken),
      expiresAt,
    },
  })

  console.log(`[TikTokToken] Token refrescado para integración ${integration.id}`)
  return newAccessToken
}

module.exports = { getValidTikTokToken }
