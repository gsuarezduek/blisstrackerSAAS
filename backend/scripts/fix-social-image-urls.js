/**
 * Reescribe las URLs de imágenes que quedaron apuntando DIRECTO al dominio del
 * bucket (cdn.blisstracker.app o pub-*.r2.dev) hacia nuestro endpoint
 * `/api/social-image/:id`, que redirige a R2 según `R2_PUBLIC_BASE`.
 *
 * Por qué: los informes/snapshots generados con el código viejo guardaron la
 * URL pública del bucket directa. Al colisionar `cdn.blisstracker.app` con el
 * wildcard de Vercel, esas imágenes quedaron rotas. Este script las repara SIN
 * regenerar informes, y de paso las desacopla del dominio (quedan igual que las
 * que produce el código nuevo).
 *
 * Recorre las mismas tablas/campos que referencian SocialImage (IMAGE_REF_SOURCES),
 * maneja columnas String y Json, y es idempotente (solo toca lo que cambia).
 *
 * Uso:
 *   DATABASE_URL=... BACKEND_URL=https://blisstrackersaas-production.up.railway.app \
 *   node scripts/fix-social-image-urls.js [--dry-run]
 */
const prisma = require('../src/lib/prisma')
const { IMAGE_REF_SOURCES } = require('../src/services/storageStats.service')

// Matchea una URL directa al bucket y captura el objectKey (ej. social/<uuid>.jpg).
const DIRECT_URL_RE = /https?:\/\/(?:cdn\.blisstracker\.app|pub-[a-z0-9]+\.r2\.dev)\/(social\/[0-9a-fA-F-]{36}\.\w+)/g

function backendBase() {
  return (process.env.BACKEND_URL || 'http://localhost:3001').replace(/\/$/, '')
}

async function main() {
  const dryRun = process.argv.includes('--dry-run')
  const base = backendBase()

  // Map objectKey → id de SocialImage (para traducir la URL directa al endpoint).
  const rows = await prisma.socialImage.findMany({
    where:  { objectKey: { not: null } },
    select: { id: true, objectKey: true },
  })
  const keyToId = new Map(rows.map(r => [r.objectKey, r.id]))
  console.log(`\nSocialImage en R2 con objectKey: ${keyToId.size}${dryRun ? '  (DRY RUN)' : ''}`)

  let totalRowsChanged = 0
  let totalUrlsChanged = 0
  let unmatched = 0

  for (const { model, field } of IMAGE_REF_SOURCES) {
    const items = await prisma[model].findMany({ select: { id: true, [field]: true } })
    let changed = 0
    for (const item of items) {
      const val = item[field]
      if (val == null) continue
      const isObj = typeof val === 'object'
      const text = isObj ? JSON.stringify(val) : String(val)
      if (!text.includes('/social/')) continue

      let hits = 0
      const replaced = text.replace(DIRECT_URL_RE, (m, key) => {
        const id = keyToId.get(key)
        if (!id) { unmatched++; return m } // no encontrada → se deja como está
        hits++
        return `${base}/api/social-image/${id}`
      })

      if (replaced !== text) {
        totalUrlsChanged += hits
        changed++
        if (!dryRun) {
          await prisma[model].update({
            where: { id: item.id },
            data:  { [field]: isObj ? JSON.parse(replaced) : replaced },
          })
        }
      }
    }
    if (changed > 0) console.log(`  ${model}.${field}: ${changed} fila(s) actualizada(s)`)
    totalRowsChanged += changed
  }

  console.log(`\n${dryRun ? '[DRY RUN] ' : ''}Filas cambiadas: ${totalRowsChanged} · URLs reescritas: ${totalUrlsChanged}`)
  if (unmatched > 0) console.log(`⚠ URLs directas sin SocialImage correspondiente (se dejaron intactas): ${unmatched}`)
  if (dryRun) console.log('Corré sin --dry-run para aplicar.')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
