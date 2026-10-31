const crypto = require('crypto')
const { authenticator } = require('otplib')
const QRCode = require('qrcode')
const { encrypt, decrypt } = require('./encryption')
const prisma = require('./prisma')

// Segundo factor por TOTP (RFC 6238) — la app de autenticación del teléfono
// (Google Authenticator, 1Password, Authy…). Opt-in personal, global al usuario
// y no por workspace: el login es por cuenta.
//
// Ventana de ±1 paso (30s a cada lado): absorbe el reloj desfasado del teléfono
// sin ampliar la superficie de fuerza bruta más de lo necesario. El tope real de
// intentos lo pone el rate limit de /auth/mfa/verify + los 5 intentos por
// mfaToken, no esta ventana.
authenticator.options = { window: 1 }

const ISSUER = 'BlissTracker'

const RECOVERY_CODE_COUNT  = 10
const RECOVERY_CODE_LENGTH = 10
// Sin I, L, O, U, 0 ni 1: son los que se confunden al copiar un código a mano.
// 30 caracteres ^ 10 ≈ 49 bits de entropía por código.
const RECOVERY_ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ'

// ── TOTP ──────────────────────────────────────────────────────────────────────

function generateSecret() {
  return authenticator.generateSecret()
}

// `otpauth://` URI que lee la app al escanear el QR. El label lleva el email
// para que quien tenga varias cuentas las distinga en la lista.
function buildOtpauthUri(email, secret) {
  return authenticator.keyuri(email, ISSUER, secret)
}

function buildQrDataUrl(otpauthUri) {
  return QRCode.toDataURL(otpauthUri, { margin: 1, width: 240 })
}

// `true` sólo si el código corresponde al secret en la ventana actual. otplib
// lanza con un secret mal formado o un token no numérico, así que se envuelve:
// un código inválido es un `false`, nunca un 500.
function verifyTotp(secret, code) {
  const token = String(code ?? '').replace(/\s/g, '')
  if (!/^\d{6}$/.test(token)) return false
  try {
    return authenticator.verify({ token, secret })
  } catch {
    return false
  }
}

// ── Estado del 2FA de un usuario ──────────────────────────────────────────────

// Un secret sin confirmar (enrolamiento abandonado a mitad de camino) NO cuenta
// como 2FA activo: si contara, alguien que cerró el modal del QR antes de
// escanearlo quedaría afuera de su propia cuenta.
function hasMfa(user) {
  return Boolean(user?.totpSecret && user?.totpConfirmedAt)
}

function readSecret(user) {
  return decrypt(user.totpSecret)
}

// ── Códigos de recuperación ───────────────────────────────────────────────────

function generateRecoveryCode() {
  let out = ''
  for (let i = 0; i < RECOVERY_CODE_LENGTH; i++) {
    // randomInt (no randomBytes % len) para no sesgar hacia el principio del alfabeto.
    out += RECOVERY_ALPHABET[crypto.randomInt(RECOVERY_ALPHABET.length)]
  }
  // Se muestra partido al medio ("A2BC-D3EF4G"): se transcribe con menos errores.
  return `${out.slice(0, 4)}-${out.slice(4)}`
}

// Tolera cómo lo pegue la persona: minúsculas, con o sin guion, con espacios.
function normalizeRecoveryCode(code) {
  return String(code ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
}

function hashRecoveryCode(code) {
  return crypto.createHash('sha256').update(normalizeRecoveryCode(code)).digest('hex')
}

// Reemplaza los 10 códigos (al confirmar el enrolamiento o al regenerarlos) y
// devuelve los valores en claro — la única vez que existen fuera del hash.
async function replaceRecoveryCodes(userId) {
  const codes = Array.from({ length: RECOVERY_CODE_COUNT }, generateRecoveryCode)
  await prisma.$transaction([
    prisma.mfaRecoveryCode.deleteMany({ where: { userId } }),
    prisma.mfaRecoveryCode.createMany({
      data: codes.map(code => ({ userId, codeHash: hashRecoveryCode(code) })),
    }),
  ])
  return codes
}

// Gasta el código si existe y está sin usar. Devuelve true sólo si lo consumió
// (un código ya usado es `false`, no se reutiliza).
async function consumeRecoveryCode(userId, code) {
  const normalized = normalizeRecoveryCode(code)
  if (normalized.length !== RECOVERY_CODE_LENGTH) return false

  const target = hashRecoveryCode(normalized)
  const targetBuf = Buffer.from(target, 'hex')
  const rows = await prisma.mfaRecoveryCode.findMany({ where: { userId, usedAt: null } })

  const match = rows.find(r => {
    const buf = Buffer.from(r.codeHash, 'hex')
    return buf.length === targetBuf.length && crypto.timingSafeEqual(buf, targetBuf)
  })
  if (!match) return false

  // `usedAt: null` en el where: si dos requests traen el mismo código a la vez,
  // sólo una lo gasta.
  const { count } = await prisma.mfaRecoveryCode.updateMany({
    where: { id: match.id, usedAt: null },
    data:  { usedAt: new Date() },
  })
  return count > 0
}

// ── Verificación unificada ────────────────────────────────────────────────────

// Acepta un TOTP de 6 dígitos o un código de recuperación, sin que quien llama
// tenga que distinguirlos. Devuelve el método usado para poder avisar por mail
// cuando se gastó un código de recuperación.
async function verifySecondFactor(user, code) {
  if (verifyTotp(readSecret(user), code)) return { ok: true, method: 'totp' }
  if (await consumeRecoveryCode(user.id, code)) return { ok: true, method: 'recovery' }
  return { ok: false, method: null }
}

async function countUnusedRecoveryCodes(userId) {
  return prisma.mfaRecoveryCode.count({ where: { userId, usedAt: null } })
}

module.exports = {
  ISSUER,
  RECOVERY_CODE_COUNT,
  generateSecret,
  buildOtpauthUri,
  buildQrDataUrl,
  verifyTotp,
  hasMfa,
  readSecret,
  encryptSecret: encrypt,
  generateRecoveryCode,
  normalizeRecoveryCode,
  hashRecoveryCode,
  replaceRecoveryCodes,
  consumeRecoveryCode,
  verifySecondFactor,
  countUnusedRecoveryCodes,
}
