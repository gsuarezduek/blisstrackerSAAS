/**
 * Migra las imágenes sociales que hoy viven como bytes en la DB hacia
 * Cloudflare R2 (object storage).
 *
 * Por cada fila con `imageData` y sin `objectKey`: sube el blob al bucket,
 * guarda `objectKey` + `sizeBytes`, y pone `imageData = NULL`. Idempotente:
 * las ya migradas se saltean. Las URLs `/api/social-image/:id` ya horneadas en
 * snapshots/informes siguen funcionando (el endpoint redirige al CDN), así que
 * NO hace falta reescribir ningún JSON.
 *
 * Al terminar corre VACUUM FULL para devolver el disco al sistema.
 *
 * Uso:
 *   DATABASE_URL=... R2_ACCOUNT_ID=... R2_ACCESS_KEY_ID=... R2_SECRET_ACCESS_KEY=... \
 *   R2_BUCKET=... R2_PUBLIC_BASE=... node scripts/migrate-social-images-to-r2.js [--dry-run]
 */
const prisma = require('../src/lib/prisma')
const objectStorage = require('../src/services/objectStorage.service')

async function main() {
  if (!objectStorage.isConfigured()) {
    console.error('✗ R2 no configurado. Faltan env vars: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_BASE')
    process.exit(1)
  }
  const dryRun = process.argv.includes('--dry-run')

  const where = { imageData: { not: null }, objectKey: null }
  const total = await prisma.socialImage.count({ where })
  console.log(`\nImágenes a migrar a R2: ${total}${dryRun ? '  (DRY RUN — no se modifica nada)' : ''}\n`)
  if (total === 0 || dryRun) {
    if (dryRun && total > 0) console.log('Corré sin --dry-run para ejecutar la migración.')
    return
  }

  let migrated = 0
  let failed = 0
  const PAGE = 50
  // El where excluye las ya migradas (objectKey != null), así cada findMany avanza.
  while (true) {
    const batch = await prisma.socialImage.findMany({
      where,
      select: { id: true, imageData: true, mimeType: true },
      take: PAGE,
    })
    if (batch.length === 0) break

    for (const img of batch) {
      try {
        const buffer = Buffer.from(img.imageData)
        const { key, size } = await objectStorage.putObject(buffer, img.mimeType, { prefix: 'social' })
        await prisma.socialImage.update({
          where: { id: img.id },
          data:  { objectKey: key, sizeBytes: size, imageData: null },
        })
        migrated++
      } catch (err) {
        failed++
        console.warn(`  ✗ ${img.id}: ${err.message}`)
      }
    }
    console.log(`  ${migrated}/${total} migradas…`)
  }

  console.log(`\n✓ Migradas: ${migrated} · Fallidas: ${failed}`)

  if (migrated > 0) {
    console.log('Corriendo VACUUM FULL "SocialImage" para recuperar disco físico…')
    try {
      await prisma.$executeRawUnsafe(`VACUUM (FULL, ANALYZE) "SocialImage"`)
      console.log('✓ VACUUM completado')
    } catch (e) {
      console.warn('VACUUM falló (la migración sí se aplicó):', e.message)
    }
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
