const crypto = require('crypto')
const jwt = require('jsonwebtoken')

// Token del paso intermedio del login con 2FA: se emite cuando la contraseña ya
// se validó pero falta el segundo factor, y es lo único que habilita
// POST /auth/mfa/verify. NO es un token de sesión — lleva `purpose: 'mfa'`, que
// `lib/jwt.js` rechaza, así que no sirve como Bearer (sin eso el 2FA sería
// decorativo: contraseña → mfaToken → usarlo como sesión).
const PURPOSE      = 'mfa'
const TTL_SECONDS  = 5 * 60
const MAX_ATTEMPTS = 5

// Intentos fallidos por desafío (`jti`), en memoria del proceso — mismo criterio
// que los locks de los crons y las sesiones de MCP, que ya asumen una sola
// instancia. Hace falta además del rate limit por IP: 6 dígitos con una ventana
// de 90s son fuerza-brutables si un mismo mfaToken admite intentos sin tope.
const attempts = new Map() // jti -> { count, expiresAt }

function sweep() {
  const now = Date.now()
  for (const [jti, rec] of attempts) {
    if (rec.expiresAt <= now) attempts.delete(jti)
  }
}

function signChallenge({ userId, slug }) {
  if (attempts.size > 500) sweep()
  const jti = crypto.randomBytes(16).toString('hex')
  return jwt.sign(
    { purpose: PURPOSE, userId, slug: slug ?? null, jti },
    process.env.JWT_SECRET,
    { algorithm: 'HS256', expiresIn: TTL_SECONDS },
  )
}

// Lanza con un error que trae `status`/`code` para que el controller lo traduzca
// sin volver a razonar sobre el motivo.
function verifyChallenge(token) {
  let decoded
  try {
    decoded = jwt.verify(String(token ?? ''), process.env.JWT_SECRET, { algorithms: ['HS256'] })
  } catch {
    const err = new Error('El paso de verificación expiró. Volvé a iniciar sesión.')
    err.status = 401
    err.code = 'MFA_CHALLENGE_EXPIRED'
    throw err
  }
  if (decoded.purpose !== PURPOSE || !decoded.userId || !decoded.jti) {
    const err = new Error('Verificación inválida')
    err.status = 401
    err.code = 'MFA_CHALLENGE_INVALID'
    throw err
  }

  const rec = attempts.get(decoded.jti)
  if (rec && rec.count >= MAX_ATTEMPTS) {
    const err = new Error('Demasiados códigos incorrectos. Volvé a iniciar sesión.')
    err.status = 429
    err.code = 'MFA_TOO_MANY_ATTEMPTS'
    throw err
  }

  return { userId: decoded.userId, slug: decoded.slug || null, jti: decoded.jti }
}

// Mismo tope de intentos para una clave arbitraria (hoy: el reset de contraseña
// de alguien con 2FA, keyeado por el id del PasswordResetToken). Lanza igual que
// verifyChallenge para que el controller no repita la traducción del error.
function assertNotExhausted(key) {
  const rec = attempts.get(key)
  if (rec && rec.count >= MAX_ATTEMPTS) {
    const err = new Error('Demasiados códigos incorrectos. Pedí un enlace nuevo.')
    err.status = 429
    err.code = 'MFA_TOO_MANY_ATTEMPTS'
    throw err
  }
}

// Devuelve cuántos intentos quedan (0 = el desafío quedó quemado).
function registerFailure(jti) {
  const rec = attempts.get(jti) ?? { count: 0, expiresAt: Date.now() + TTL_SECONDS * 1000 }
  rec.count += 1
  attempts.set(jti, rec)
  return Math.max(0, MAX_ATTEMPTS - rec.count)
}

// Quema el desafío después de un canje exitoso: el JWT sigue siendo válido sus 5
// minutos, así que sin esto el mismo `mfaToken` podría canjearse de nuevo
// mientras el TOTP siga en su ventana. Se marca agotado (no se borra la entrada,
// que es justamente lo que lo dejaría volver a pasar).
function consumeChallenge(jti) {
  attempts.set(jti, { count: MAX_ATTEMPTS, expiresAt: Date.now() + TTL_SECONDS * 1000 })
}

module.exports = { PURPOSE, TTL_SECONDS, MAX_ATTEMPTS, signChallenge, verifyChallenge, assertNotExhausted, registerFailure, consumeChallenge }
