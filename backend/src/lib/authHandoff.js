const crypto = require('crypto')
const prisma = require('./prisma')

const TTL_MS = 60 * 1000

function hashCode(code) {
  return crypto.createHash('sha256').update(code).digest('hex')
}

// Guarda el JWT ya firmado detrás de un código opaco. El código es lo único
// que viaja en la URL al cruzar de dominio.
async function createHandoff(token) {
  const code = crypto.randomBytes(32).toString('base64url')
  await prisma.authHandoff.deleteMany({ where: { expiresAt: { lt: new Date() } } })
  await prisma.authHandoff.create({
    data: {
      codeHash: hashCode(code),
      token,
      expiresAt: new Date(Date.now() + TTL_MS),
    },
  })
  return code
}

// Un solo canje: el DELETE ... RETURNING es atómico, así dos requests con el
// mismo código no reciben los dos el JWT.
async function consumeHandoff(code) {
  if (typeof code !== 'string' || code.length < 20 || code.length > 200) return null
  const rows = await prisma.$queryRaw`
    DELETE FROM "AuthHandoff"
    WHERE "codeHash" = ${hashCode(code)} AND "expiresAt" > NOW()
    RETURNING "token"
  `
  return rows[0]?.token || null
}

module.exports = { createHandoff, consumeHandoff, TTL_MS }
