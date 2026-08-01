const jwt = require('jsonwebtoken')

function auth(req, res, next) {
  const header = req.headers.authorization
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' })
  }
  try {
    const token = header.slice(7)
    const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] })
    // Los tokens de propósito acotado (ej. portal de cliente) nunca deben servir para rutas de staff.
    if (decoded.purpose === 'client-portal-live') {
      return res.status(401).json({ error: 'Invalid token' })
    }
    req.user = decoded
    // req.user contiene: { userId, workspaceId, role, isSuperAdmin, iat, exp }
    next()
  } catch {
    res.status(401).json({ error: 'Invalid token' })
  }
}

module.exports = { auth }
