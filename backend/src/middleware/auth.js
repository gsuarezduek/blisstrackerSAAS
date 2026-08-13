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

module.exports = { auth }
