/**
 * Reporte de tamaño de la base de datos.
 *
 * Muestra el tamaño total de la DB y el desglose por tabla (datos + índices +
 * TOAST, que es donde Postgres guarda los campos grandes como los `Bytes` de
 * imágenes). Útil para diagnosticar qué tabla está llenando el volumen.
 *
 * Uso:
 *   DATABASE_URL=postgresql://... node scripts/db-size-report.js
 */
const prisma = require('../src/lib/prisma')

async function main() {
  const [{ db_size }] = await prisma.$queryRawUnsafe(
    `SELECT pg_size_pretty(pg_database_size(current_database())) AS db_size`
  )
  console.log(`\n📦 Tamaño total de la base: ${db_size}\n`)

  // Tamaño por tabla (incluye TOAST = donde viven los Bytes grandes) + nº de filas estimado
  const rows = await prisma.$queryRawUnsafe(`
    SELECT
      c.relname                                              AS tabla,
      pg_size_pretty(pg_total_relation_size(c.oid))          AS total,
      pg_size_pretty(pg_relation_size(c.oid))                AS solo_datos,
      pg_size_pretty(pg_total_relation_size(c.oid)
                     - pg_relation_size(c.oid))              AS indices_y_toast,
      c.reltuples::bigint                                    AS filas_aprox,
      pg_total_relation_size(c.oid)                          AS bytes
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'r'
      AND n.nspname = 'public'
    ORDER BY pg_total_relation_size(c.oid) DESC
    LIMIT 30
  `)

  const fmt = (v) => String(v).padEnd(11)
  console.log(
    fmt('TOTAL') + fmt('DATOS') + fmt('IDX+TOAST') + 'FILAS'.padEnd(12) + 'TABLA'
  )
  console.log('─'.repeat(70))
  for (const r of rows) {
    console.log(
      fmt(r.total) +
        fmt(r.solo_datos) +
        fmt(r.indices_y_toast) +
        String(r.filas_aprox).padEnd(12) +
        r.tabla
    )
  }
  console.log('')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
