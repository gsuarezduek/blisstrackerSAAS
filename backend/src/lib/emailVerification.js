const crypto = require('crypto')
const prisma = require('./prisma')
const { sendVerificationEmail } = require('../services/email.service')

const RESEND_COOLDOWN_MS = 60 * 1000
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000

// Invalida tokens previos, crea uno nuevo y manda el email de verificación.
// `slug`, si se conoce, arma el link dentro del workspace recién creado.
async function createAndSendVerificationEmail(userId, email, name, { slug, workspaceId } = {}) {
  await prisma.emailVerificationToken.updateMany({
    where: { userId, used: false },
    data: { used: true },
  })

  const token = crypto.randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS)
  await prisma.emailVerificationToken.create({ data: { token, userId, expiresAt } })

  const domain = process.env.APP_DOMAIN
  const verifyUrl = domain && slug
    ? `https://${slug}.${domain}/verify-email?token=${token}`
    : `${process.env.FRONTEND_URL}/verify-email?token=${token}`

  await sendVerificationEmail(email, name, verifyUrl, workspaceId)
}

module.exports = { createAndSendVerificationEmail, RESEND_COOLDOWN_MS }
