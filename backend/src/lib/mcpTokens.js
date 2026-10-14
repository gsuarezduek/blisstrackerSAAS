const crypto = require('crypto')

// Hash/generación de tokens de McpToken — compartido entre mcp/auth.js (verificar),
// los scripts de ops (mcp-create-token.js) y el alta self-service (mcpTokens.controller.js).
function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex')
}

function generateToken() {
  const token = crypto.randomBytes(32).toString('hex')
  return { token, tokenHash: hashToken(token) }
}

module.exports = { hashToken, generateToken }
