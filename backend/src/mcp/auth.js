const prisma = require('../lib/prisma')
const { hashToken } = require('../lib/mcpTokens')

// Autenticación de /api/mcp: NO es el JWT normal de sesión (ver middleware/auth.js).
// Cada token (tabla McpToken, alta/baja vía Preferencias → Agentes IA o los scripts
// backend/scripts/mcp-*-token.js) mapea a UNA identidad fija (workspaceId+userId) —
// las tools ejecutan con el rol real de esa membresía, nunca con privilegios ajenos.
// Soporta N tokens para N personas y, de regalo, N workspaces (cada fila carga su
// propio workspaceId) sin que haga falta un modelo de auth nuevo el día que se sume
// un segundo workspace. Ver "MCP (Grok) — integración" en backend/CLAUDE.md.

// Migración de compatibilidad, una sola vez: la v1 (anterior a McpToken) usaba
// un único token fijo en env vars (MCP_TOKEN/MCP_WORKSPACE_SLUG/MCP_USER_EMAIL).
// Si llega exactamente ese token y todavía no tiene fila en McpToken, se la
// crea acá mismo — así el conector ya configurado en Grok sigue funcionando
// sin que nadie tenga que volver a pegar un token. Noop en cuanto la fila ya
// existe (vía la env var o ya migrada). Borrar las 3 env vars de Railway
// cuando se confirme que todo quedó migrado es limpieza opcional, no urgente.
async function migrateLegacyToken(token, tokenHash) {
  const { MCP_TOKEN, MCP_WORKSPACE_SLUG, MCP_USER_EMAIL } = process.env
  if (!MCP_TOKEN || !MCP_WORKSPACE_SLUG || !MCP_USER_EMAIL || token !== MCP_TOKEN) return null

  const workspace = await prisma.workspace.findUnique({ where: { slug: MCP_WORKSPACE_SLUG }, select: { id: true } })
  const user = await prisma.user.findUnique({ where: { email: MCP_USER_EMAIL }, select: { id: true } })
  if (!workspace || !user) return null

  return prisma.mcpToken.create({
    data: { workspaceId: workspace.id, userId: user.id, tokenHash, label: 'legacy (migrado automáticamente)' },
    include: { workspace: { select: { slug: true } } },
  })
}

async function mcpAuth(req, res, next) {
  const header = req.headers.authorization
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' })
  }

  const token = header.slice(7)
  const tokenHash = hashToken(token)
  let row = await prisma.mcpToken.findUnique({
    where: { tokenHash },
    include: { workspace: { select: { slug: true } } },
  }).catch(() => null)

  if (!row) row = await migrateLegacyToken(token, tokenHash).catch(() => null)

  if (!row || row.revokedAt) {
    return res.status(401).json({ error: 'Invalid token' })
  }

  req.mcpIdentity = { userId: row.userId, workspaceId: row.workspaceId, workspaceSlug: row.workspace.slug }
  // Best-effort, no bloquea la request si falla.
  prisma.mcpToken.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } }).catch(() => {})

  next()
}

module.exports = { mcpAuth }
