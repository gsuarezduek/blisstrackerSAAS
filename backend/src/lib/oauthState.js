const jwt = require('jsonwebtoken')

// Firma/verifica el parámetro `state` de los flujos OAuth (Google, Google
// Calendar, Meta, TikTok, LinkedIn). Es un JWT corto que lleva el contexto
// (projectId/workspaceId/slug/userId) de ida y vuelta por el redirect.
//
// Lleva `purpose: 'oauth-state'` para que `lib/jwt.js` lo rechace como token de
// sesión: el `state` viaja en el query string de la URL del proveedor, así que
// queda en el historial del browser, en los logs del referer y del lado del
// proveedor — es el token acotado más expuesto que emite el backend, y sin el
// `purpose` servía como Bearer de nivel `member` durante sus 10 minutos.
const STATE_PURPOSE = 'oauth-state'
const STATE_TTL     = '10m'

function signState(payload) {
  return jwt.sign(
    { ...payload, purpose: STATE_PURPOSE },
    process.env.JWT_SECRET,
    { algorithm: 'HS256', expiresIn: STATE_TTL },
  )
}

// Lanza si el state es inválido, expiró o no es un state de OAuth (p. ej. si
// alguien intenta pasar un token de sesión propio para falsear el contexto).
function verifyState(state) {
  const decoded = jwt.verify(state, process.env.JWT_SECRET, { algorithms: ['HS256'] })
  if (decoded.purpose !== STATE_PURPOSE) throw new Error('Invalid OAuth state')
  return decoded
}

module.exports = { signState, verifyState, STATE_PURPOSE }
