/**
 * Crea o actualiza el usuario de prueba para verificación de Google OAuth.
 * Uso: DATABASE_URL="..." node scripts/create-test-user.js
 */

require('dotenv').config()
const bcrypt = require('bcryptjs')
const prisma  = require('../src/lib/prisma')

const EMAIL    = 'admin@blissmkt.ar'
const PASSWORD = 'admin123'
const SLUG     = 'monethx10'

async function main() {
  const hash = await bcrypt.hash(PASSWORD, 10)

  // 1. Upsert usuario
  const user = await prisma.user.upsert({
    where:  { email: EMAIL },
    update: { password: hash, name: 'BlissTracker Demo' },
    create: { email: EMAIL, password: hash, name: 'BlissTracker Demo' },
  })
  console.log('Usuario:', user.id, user.email)

  // 2. Buscar workspace
  const workspace = await prisma.workspace.findUnique({ where: { slug: SLUG } })
  if (!workspace) { console.error('Workspace no encontrado:', SLUG); process.exit(1) }
  console.log('Workspace:', workspace.id, workspace.slug)

  // 3. Upsert membresía
  const member = await prisma.workspaceMember.upsert({
    where:  { workspaceId_userId: { userId: user.id, workspaceId: workspace.id } },
    update: { active: true, role: 'member' },
    create: { userId: user.id, workspaceId: workspace.id, role: 'member', active: true },
  })
  console.log('Membresía:', member.role, '| activa:', member.active)
  console.log('Listo. Credenciales: ' + EMAIL + ' / ' + PASSWORD + ' en https://' + SLUG + '.blisstracker.app')
}

main()
  .catch(err => { console.error(err); process.exit(1) })
  .finally(() => prisma.$disconnect())
