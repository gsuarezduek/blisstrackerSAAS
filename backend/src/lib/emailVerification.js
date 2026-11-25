const crypto = require('crypto')
const prisma = require('./prisma')
const { workspaceUrl } = require('./publicUrls')
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

  // Con slug se manda al subdominio del workspace, que es donde la persona va a
  // trabajar. Sin slug, al host de la app — antes era el dominio raíz, que ahora es el
  // sitio público y no tiene esta pantalla.
  const verifyUrl = workspaceUrl(slug, `/verify-email?token=${token}`)

  await sendVerificationEmail(email, name, verifyUrl, workspaceId)
}

module.exports = { createAndSendVerificationEmail, RESEND_COOLDOWN_MS }
