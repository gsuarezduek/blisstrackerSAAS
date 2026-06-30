/**
 * Desglose de SocialImage por mes de creación.
 *
 * Muestra, por cada mes, cuántas imágenes hay y cuánto ocupan. Sirve para
 * elegir un punto de corte de antigüedad antes de limpiar (las imágenes de
 * meses recientes siguen referenciadas por informes que el cliente puede abrir;
 * las viejas ya tienen la URL del CDN vencida y casi no se miran).
 *
 * Uso:
 *   DATABASE_URL=postgresql://... node scripts/social-image-breakdown.js
 */
const prisma = require('../src/lib/prisma')

async function main() {
  const rows = await prisma.$queryRawUnsafe(`
    SELECT
      to_char(date_trunc('month', "createdAt"), 'YYYY-MM')   AS mes,
      count(*)                                                 AS imagenes,
      pg_size_pretty(sum(octet_length("imageData")))           AS peso,
      sum(octet_length("imageData"))                           AS bytes
    FROM "SocialImage"
    GROUP BY 1
    ORDER BY 1
  `)

  console.log('\nMES        IMÁGENES   PESO')
  console.log('─'.repeat(40))
  let acumBytes = 0n
  let acumImgs = 0
  for (const r of rows) {
    console.log(
      String(r.mes).padEnd(11) +
        String(r.imagenes).padEnd(11) +
        r.peso
    )
    acumBytes += BigInt(r.bytes)
    acumImgs += Number(r.imagenes)
  }
  console.log('─'.repeat(40))
  console.log(`TOTAL      ${String(acumImgs).padEnd(11)}${(Number(acumBytes) / 1024 / 1024).toFixed(1)} MB\n`)

  // Cuánto se borraría / conservaría según distintos cortes de antigüedad
  console.log('Si conservás solo los últimos N meses se borraría:')
  for (const months of [3, 6, 9, 12]) {
    const cutoff = new Date()
    cutoff.setMonth(cutoff.getMonth() - months)
    const [{ borrar, peso }] = await prisma.$queryRawUnsafe(
      `SELECT count(*) AS borrar, pg_size_pretty(coalesce(sum(octet_length("imageData")),0)) AS peso
       FROM "SocialImage" WHERE "createdAt" < $1`,
      cutoff
    )
    console.log(`  últimos ${String(months).padStart(2)} meses → borra ${String(borrar).padStart(5)} imágenes (${peso})`)
  }
  console.log('')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
