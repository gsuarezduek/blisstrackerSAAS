const crypto = require('crypto')

// Autenticación de /api/mcp: NO es el JWT normal de sesión (ver middleware/auth.js).
// Es un secreto estático único (MCP_TOKEN) que le damos al cliente MCP (Grok) para
// pegarle a este workspace. Alcance v1: un solo token, un solo workspace — ver
// "MCP (Grok) — integración" en backend/CLAUDE.md.
function timingSafeEqual(a, b) {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return crypto.timingSafeEqual(bufA, bufB)
}

function mcpAuth(req, res, next) {
  const expected = process.env.MCP_TOKEN
  if (!expected) {
    return res.status(503).json({ error: 'MCP no configurado (falta MCP_TOKEN)' })
  }

  const header = req.headers.authorization
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' })
  }

  const token = header.slice(7)
  if (!timingSafeEqual(token, expected)) {
    return res.status(401).json({ error: 'Invalid token' })
  }

  next()
}

module.exports = { mcpAuth }
