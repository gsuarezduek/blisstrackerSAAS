const axios   = require('axios')
const prisma  = require('../lib/prisma')
const { encrypt, decrypt } = require('../lib/encryption')

const LINKEDIN_TOKEN_URL = 'https://www.linkedin.com/oauth/v2/accessToken'

/**
 * Devuelve un access token válido para LinkedIn.
 * LinkedIn access tokens duran ~60 días, refresh tokens ~365 días.
 * Si el access está por vencer (< 5 min) y hay refresh token, lo renueva.
 * Si no hay refresh token o el refresh falla, lanza error para reconectar.
 */
async function getValidLinkedinToken(integration) {
  const now = Date.now()

  // Access token todavía válido (buffer 5 min)
  if (integration.expiresAt && integration.expiresAt.getTime() > now + 5 * 60 * 1000) {
    return decrypt(integration.accessToken)
  }

  if (!integration.refreshToken) {
    throw new Error('Token de LinkedIn expirado y la cuenta no permite refresh automático. Reconectá la cuenta.')
  }

  const refreshToken = decrypt(integration.refreshToken)

  const res = await axios.post(
    LINKEDIN_TOKEN_URL,
    new URLSearchParams({
      grant_type:    'refresh_token',
      refresh_token: refreshToken,
      client_id:     process.env.LINKEDIN_CLIENT_ID,
      client_secret: process.env.LINKEDIN_CLIENT_SECRET,
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
  )

  const data            = res.data
  const newAccessToken  = data.access_token
  const newRefreshToken = data.refresh_token || refreshToken
  const expiresIn       = data.expires_in ?? 5184000 // 60 días default
  const expiresAt       = new Date(now + expiresIn * 1000)

  await prisma.projectIntegration.update({
    where: { id: integration.id },
    data: {
      accessToken:  encrypt(newAccessToken),
      refreshToken: encrypt(newRefreshToken),
      expiresAt,
    },
  })

  console.log(`[LinkedinToken] Token refrescado para integración ${integration.id}`)
  return newAccessToken
}

module.exports = { getValidLinkedinToken }
