/**
 * Lista los tokens de MCP dados de alta (nunca el valor en claro — eso no se
 * guarda). Ver backend/CLAUDE.md "MCP (Grok) — integración".
 *
 * Uso:
 *   node scripts/mcp-list-tokens.js                  # todos los workspaces
 *   WORKSPACE_SLUG=<slug> node scripts/mcp-list-tokens.js
 */

require('dotenv').config()
const prisma = require('../src/lib/prisma')

async function main() {
  const slug = process.env.WORKSPACE_SLUG
  const where = {}
  if (slug) {
    const workspace = await prisma.workspace.findUnique({ where: { slug }, select: { id: true } })
    if (!workspace) { console.error(`Workspace "${slug}" no encontrado`); process.exit(1) }
    where.workspaceId = workspace.id
  }

  const rows = await prisma.mcpToken.findMany({
    where,
    include: { user: { select: { name: true, email: true } }, workspace: { select: { slug: true } } },
    orderBy: { createdAt: 'asc' },
  })

  if (!rows.length) { console.log('No hay tokens de MCP.'); return }

  for (const r of rows) {
    const estado = r.revokedAt ? `revocado el ${r.revokedAt.toISOString().slice(0, 10)}` : 'activo'
    console.log(`#${r.id} · ${r.workspace.slug} · ${r.user.name} <${r.user.email}> · ${r.label || '(sin label)'} · ${estado} · último uso: ${r.lastUsedAt ? r.lastUsedAt.toISOString() : 'nunca'}`)
  }
}

main()
  .catch(err => { console.error(err); process.exit(1) })
  .finally(() => prisma.$disconnect())
