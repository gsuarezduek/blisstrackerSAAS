const jwt = require('jsonwebtoken')

function auth(req, res, next) {
  const header = req.headers.authorization
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' })
  }
  try {
    const token = header.slice(7)
    req.user = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] })
    // req.user contiene: { userId, workspaceId, role, isSuperAdmin, iat, exp }
    next()
  } catch {
    res.status(401).json({ error: 'Invalid token' })
  }
}

/**
 * @deprecated Usar workspaceAdminOnly del middleware workspace.js.
 * Mantenido por compatibilidad mientras se migran las rutas.
 */
function adminOnly(req, res, next) {
  const member = req.workspaceMember
  if (req.user?.isSuperAdmin) return next()
  if (!member || (member.role !== 'admin' && member.role !== 'owner')) {
    return res.status(403).json({ error: 'Admin access required' })
  }
  next()
}

module.exports = { auth, adminOnly }
