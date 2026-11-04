const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcryptjs')

const prisma = new PrismaClient()

const DEFAULT_ROLES = [
  { name: 'ADMIN',             label: 'Administrador' },
  { name: 'DESIGNER',          label: 'Diseñador' },
  { name: 'CM',                label: 'Community Manager' },
  { name: 'ACCOUNT_EXECUTIVE', label: 'Ejecutivo de Cuentas' },
  { name: 'ANALYST',           label: 'Analista' },
  { name: 'WEB_DEVELOPER',     label: 'Desarrollador Web' },
]

const WORKSPACE_SLUG = 'bliss'
const ADMIN_EMAIL = 'admin@blissmkt.ar'

async function main() {
  // Guarda: nunca correr accidentalmente contra producción (pisaría datos / crearía
  // un admin con credencial conocida). Requiere ALLOW_SEED=true para forzarlo.
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_SEED !== 'true') {
    console.error('[seed] Bloqueado en producción. Seteá ALLOW_SEED=true si realmente querés correrlo.')
    process.exit(1)
  }

  // Password del admin de seed: por env (recomendado) o el default de desarrollo.
  const seedPassword = process.env.SEED_ADMIN_PASSWORD || 'admin123'

  // El workspace va PRIMERO: desde la reescritura multi-tenant todo lo demás cuelga de
  // él (los roles son por workspace, y al admin lo liga un WorkspaceMember, no un campo
  // en User). `status: 'active'` porque el workspace `bliss` está exento de billing.
  const workspace = await prisma.workspace.upsert({
    where: { slug: WORKSPACE_SLUG },
    update: {},
    create: { name: 'Bliss', slug: WORKSPACE_SLUG, status: 'active' },
  })

  // Roles por workspace: el único índice es (workspaceId, name).
  for (const r of DEFAULT_ROLES) {
    await prisma.userRole.upsert({
      where: { workspaceId_name: { workspaceId: workspace.id, name: r.name } },
      update: { label: r.label },
      create: { ...r, workspaceId: workspace.id },
    })
  }

  const hashedPassword = await bcrypt.hash(seedPassword, 10)
  const admin = await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: {},
    create: { name: 'Administrador', email: ADMIN_EMAIL, password: hashedPassword },
  })

  // La membresía es la que le da permisos: `role` es el del workspace (owner > admin >
  // member) y `teamRole` referencia UserRole.name.
  await prisma.workspaceMember.upsert({
    where: { workspaceId_userId: { workspaceId: workspace.id, userId: admin.id } },
    update: { role: 'owner', teamRole: 'ADMIN', active: true },
    create: { workspaceId: workspace.id, userId: admin.id, role: 'owner', teamRole: 'ADMIN' },
  })

  const project = await prisma.project.upsert({
    where: { workspaceId_name: { workspaceId: workspace.id, name: 'Bliss' } },
    update: {},
    create: { workspaceId: workspace.id, name: 'Bliss' },
  })

  console.log('Seed completed:')
  console.log('  Workspace:', workspace.name, `(slug: ${workspace.slug})`)
  console.log('  Roles:', DEFAULT_ROLES.map(r => r.name).join(', '))
  console.log('  Admin:', admin.email, '/ password:', process.env.SEED_ADMIN_PASSWORD ? '(SEED_ADMIN_PASSWORD)' : 'admin123 (DEFAULT — cambialo)')
  console.log('  Project:', project.name)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
