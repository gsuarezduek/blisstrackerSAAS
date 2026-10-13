/**
 * Revoca un token de MCP por id (soft-revoke: la fila queda para historial,
 * deja de aceptarse en /api/mcp). Ver backend/CLAUDE.md "MCP (Grok) — integración".
 *
 * Uso:
 *   TOKEN_ID=<id> node scripts/mcp-revoke-token.js
 */

require('dotenv').config()
const prisma = require('../src/lib/prisma')

async function main() {
  const id = Number(process.env.TOKEN_ID)
  if (!id) { console.error('Falta TOKEN_ID (ver scripts/mcp-list-tokens.js para los ids)'); process.exit(1) }

  const row = await prisma.mcpToken.findUnique({ where: { id }, include: { user: { select: { email: true } } } })
  if (!row) { console.error(`Token #${id} no encontrado`); process.exit(1) }
  if (row.revokedAt) { console.log(`El token #${id} (${row.user.email}) ya estaba revocado.`); return }

  await prisma.mcpToken.update({ where: { id }, data: { revokedAt: new Date() } })
  console.log(`Token #${id} (${row.user.email}) revocado.`)
}

main()
  .catch(err => { console.error(err); process.exit(1) })
  .finally(() => prisma.$disconnect())
