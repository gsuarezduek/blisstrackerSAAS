const jwt = require('jsonwebtoken')

// Verifica un JWT emitido por /api/auth/*. Compartido por el middleware `auth`
// (requests HTTP) y el handshake de Socket.IO (lib/socket.js) — misma regla en
// un solo lugar. Lanza si el token es inválido/expirado o es de un propósito
// acotado que no debe servir para rutas/rooms de staff (ej. portal de cliente).
function verifyToken(token) {
  const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] })
  if (decoded.purpose === 'client-portal-live') {
    throw new Error('Invalid token')
  }
  return decoded
}

module.exports = { verifyToken }
