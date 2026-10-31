const jwt = require('jsonwebtoken')

// Verifica un JWT emitido por /api/auth/*. Compartido por el middleware `auth`
// (requests HTTP) y el handshake de Socket.IO (lib/socket.js) — misma regla en
// un solo lugar. Lanza si el token es inválido/expirado o no es de sesión.
//
// INVARIANTE: un token de SESIÓN nunca lleva el claim `purpose`. Todo JWT de
// propósito acotado firmado con JWT_SECRET (portal de cliente, link de Google,
// `state` de OAuth, el paso intermedio del 2FA…) SÍ lo lleva, y acá se rechaza.
// Antes esto era una lista NEGRA de un solo valor ('client-portal-live'), así
// que cualquier token acotado nuevo nacía sirviendo también como token de
// sesión: `resolveWorkspace` resuelve la membresía con el header X-Workspace +
// `userId`, no con el `workspaceId` del token, así que bastaba con que trajera
// `userId` para habilitar todas las rutas de nivel `member`. Con el 2FA eso
// sería un bypass completo del segundo factor (contraseña → mfaToken → usar el
// mfaToken como Bearer), de ahí la inversión a lista blanca.
//
// Al agregar un JWT que no sea de sesión: ponerle `purpose` y validarlo donde
// se consume (ver lib/oauthState.js como ejemplo).
function verifyToken(token) {
  const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] })
  if (decoded.purpose) {
    throw new Error('Invalid token')
  }
  return decoded
}

module.exports = { verifyToken }
