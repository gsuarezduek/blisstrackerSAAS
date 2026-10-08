/**
 * Siembra las categorías default de Finanzas en workspaces YA EXISTENTES (los
 * nuevos ya las reciben automáticamente vía seedDefaults, ver
 * src/services/workspaceSeed.service.js). Idempotente — correrlo de nuevo no
 * duplica nada.
 *
 * Uso:
 *   DATABASE_URL="..." node scripts/seed-finance-categories.js            # todos los workspaces
 *   DATABASE_URL="..." node scripts/seed-finance-categories.js <slug>     # uno solo
 */
require('dotenv').config()
const prisma = require('../src/lib/prisma')
const { seedFinanceCategories } = require('../src/services/financeSeed.service')

async function main() {
  const slug = process.argv[2] || null
  const workspaces = await prisma.workspace.findMany({
    where: slug ? { slug } : {},
    select: { id: true, slug: true, name: true },
  })
  if (slug && workspaces.length === 0) {
    console.error(`No existe el workspace "${slug}"`)
    process.exitCode = 1
    return
  }

  for (const ws of workspaces) {
    await seedFinanceCategories(ws.id)
    console.log(`✓ ${ws.slug} (${ws.name})`)
  }
  console.log(`\nListo — ${workspaces.length} workspace(s) procesados.`)
}

main()
  .catch((err) => { console.error(err); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
