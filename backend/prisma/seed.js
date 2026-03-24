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

async function main() {
  // Seed default roles
  for (const r of DEFAULT_ROLES) {
    await prisma.userRole.upsert({
      where: { name: r.name },
      update: { label: r.label },
      create: r,
    })
  }

  // Create default admin user
  const hashedPassword = await bcrypt.hash('admin123', 10)
  const admin = await prisma.user.upsert({
    where: { email: 'admin@blissmkt.ar' },
    update: {},
    create: {
      name: 'Administrador',
      email: 'admin@blissmkt.ar',
      password: hashedPassword,
      role: 'ADMIN',
    },
  })

  // Create default "Bliss" project
  const bliss = await prisma.project.upsert({
    where: { name: 'Bliss' },
    update: {},
    create: { name: 'Bliss' },
  })

  console.log('Seed completed:')
  console.log('  Roles:', DEFAULT_ROLES.map(r => r.name).join(', '))
  console.log('  Admin:', admin.email, '/ password: admin123')
  console.log('  Project:', bliss.name)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
