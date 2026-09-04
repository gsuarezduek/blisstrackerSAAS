const { verifyToken } = require('../lib/jwt')

function auth(req, res, next) {
  const header = req.headers.authorization
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' })
  }
  try {
    const token = header.slice(7)
    req.user = verifyToken(token)
    // req.user contiene: { userId, workspaceId, role, isSuperAdmin, iat, exp }
    next()
  } catch {
    res.status(401).json({ error: 'Invalid token' })
  }
}

// Como `auth`, pero nunca bloquea la request: si hay un JWT válido lo deja en
// req.user, si no hay token o es inválido/expirado sigue igual (req.user queda
// undefined). Para rutas públicas que cambian de comportamiento cuando quien
// pega ya tiene sesión (ej. crear workspace estando logueado).
function optionalAuth(req, res, next) {
  const header = req.headers.authorization
  if (header && header.startsWith('Bearer ')) {
    try {
      req.user = verifyToken(header.slice(7))
    } catch {
      // token inválido/expirado: seguimos como anónimo, no bloqueamos la ruta pública
    }
  }
  next()
}

module.exports = { auth, optionalAuth }
