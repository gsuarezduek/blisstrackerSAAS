const jwt = require('jsonwebtoken')
const prisma = require('../lib/prisma')

// Verifica el JWT de propósito acotado emitido tras validar el código OTP.
// Adjunta req.clientPortal (fila de ProjectClientPortal) — nunca req.user.
async function clientPortalAuth(req, res, next) {
  const header = req.headers.authorization
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' })
  }
  try {
    const token = header.slice(7)
    const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] })
    if (decoded.purpose !== 'client-portal-live') {
      return res.status(401).json({ error: 'Invalid token' })
    }
    const portal = await prisma.projectClientPortal.findUnique({ where: { id: decoded.portalId } })
    if (!portal || !portal.active || portal.slug !== req.params.slug) {
      return res.status(401).json({ error: 'Invalid token' })
    }
    req.clientPortal = portal
    next()
  } catch {
    res.status(401).json({ error: 'Invalid token' })
  }
}

module.exports = { clientPortalAuth }
