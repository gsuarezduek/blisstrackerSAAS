/**
 * Script de uso único para dar de alta un token de acceso al servidor MCP
 * (/api/mcp) para una identidad puntual (workspace + usuario). Ver "MCP
 * (Grok) — integración" en backend/CLAUDE.md.
 *
 * El token se genera acá y se muestra UNA sola vez — solo se guarda su hash
 * (sha256) en la tabla McpToken, nunca el valor en claro.
 *
 * Uso:
 *   WORKSPACE_SLUG=<slug> USER_EMAIL=<email> LABEL="Grok - Fulano" node scripts/mcp-create-token.js
 */

require('dotenv').config()
const crypto = require('crypto')
const prisma = require('../src/lib/prisma')

async function main() {
  const slug  = process.env.WORKSPACE_SLUG
  const email = process.env.USER_EMAIL
  const label = process.env.LABEL || null

  if (!slug || !email) {
    console.error('Faltan variables: WORKSPACE_SLUG, USER_EMAIL')
    process.exit(1)
  }

  const workspace = await prisma.workspace.findUnique({ where: { slug }, select: { id: true, name: true } })
  if (!workspace) { console.error(`Workspace "${slug}" no encontrado`); process.exit(1) }

  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, name: true } })
  if (!user) { console.error(`Usuario "${email}" no encontrado`); process.exit(1) }

  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: workspace.id, userId: user.id } },
    select: { active: true, role: true },
  })
  if (!member?.active) { console.error(`${email} no es miembro activo de "${slug}"`); process.exit(1) }

  const token     = crypto.randomBytes(32).toString('hex')
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex')

  const row = await prisma.mcpToken.create({
    data: { workspaceId: workspace.id, userId: user.id, tokenHash, label },
  })

  console.log('Token creado — mostralo una sola vez, no queda guardado en claro:')
  console.log('')
  console.log('  ' + token)
  console.log('')
  console.log(`  id:        ${row.id}`)
  console.log(`  workspace: ${workspace.name} (${slug})`)
  console.log(`  usuario:   ${user.name} <${email}> — rol: ${member.role}`)
  console.log(`  label:     ${label || '(sin label)'}`)
}

main()
  .catch(err => { console.error(err); process.exit(1) })
  .finally(() => prisma.$disconnect())
