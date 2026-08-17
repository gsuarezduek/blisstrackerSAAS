/**
 * Backfill único: copia el banner del informe (MonthlyReport.bannerData, ahora
 * deprecado — el hero pasó a ser un banner propio del portal de cliente) al
 * nuevo ProjectClientPortal.bannerData, para que los proyectos que ya tenían
 * una imagen cargada no tengan que volver a subirla.
 *
 * Por cada ProjectClientPortal SIN banner propio: busca el MonthlyReport más
 * reciente (por mes desc) del mismo proyecto que sí tenga bannerData, y copia
 * bytes + mimeType. Idempotente: un portal que ya tiene banner se saltea, así
 * que correrlo de nuevo no pisa nada.
 *
 * Uso:
 *   DATABASE_URL=... node scripts/migrate-report-banners-to-portal.js [--dry-run]
 */
const prisma = require('../src/lib/prisma')

async function main() {
  const dryRun = process.argv.includes('--dry-run')

  const portals = await prisma.projectClientPortal.findMany({
    where:  { bannerData: null },
    select: { id: true, projectId: true, slug: true },
  })
  console.log(`\nPortales sin banner propio: ${portals.length}${dryRun ? '  (DRY RUN — no se modifica nada)' : ''}\n`)

  let migrated = 0
  let skippedNoSource = 0

  for (const portal of portals) {
    const sourceReport = await prisma.monthlyReport.findFirst({
      where:   { projectId: portal.projectId, bannerData: { not: null } },
      orderBy: { month: 'desc' },
      select:  { month: true, bannerData: true, bannerMimeType: true },
    })

    if (!sourceReport) {
      skippedNoSource++
      continue
    }

    console.log(`${dryRun ? '[dry-run] ' : ''}portal "${portal.slug}" ← banner del informe ${sourceReport.month}`)
    if (!dryRun) {
      await prisma.projectClientPortal.update({
        where: { id: portal.id },
        data:  { bannerData: sourceReport.bannerData, bannerMimeType: sourceReport.bannerMimeType },
      })
    }
    migrated++
  }

  console.log(`\n${dryRun ? 'Migrarían' : 'Migrados'}: ${migrated}`)
  console.log(`Sin informe con banner para heredar: ${skippedNoSource}`)
  if (dryRun && migrated > 0) console.log('\nCorré sin --dry-run para aplicar.')
}

main()
  .catch((err) => { console.error(err); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
