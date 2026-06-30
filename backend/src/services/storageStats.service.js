/**
 * Estadísticas de almacenamiento de la base de datos + limpieza de imágenes
 * sociales huérfanas.
 *
 * El grueso del disco lo ocupa `SocialImage`: cada snapshot mensual y cada
 * refresh manual de RRSS descarga los bytes de las imágenes de los top posts
 * (porque las URLs firmadas de los CDN vencen) y crea una fila nueva. Como el
 * snapshot pasa a apuntar a la fila nueva, las anteriores quedan HUÉRFANAS
 * (ya no las referencia ningún snapshot ni informe) y nunca se borran solas.
 *
 * Una `SocialImage` está "en uso" si su URL (`/api/social-image/<id>`) aparece
 * dentro de algún JSON que la referencia. `collectUsedImageIds()` es la única
 * fuente de verdad de esas referencias — cuando se migren los blobs a object
 * storage, esta detección se reutiliza tal cual; solo cambia el borrado físico.
 */
const prisma = require('../lib/prisma')
const objectStorage = require('./objectStorage.service')

// Fuentes que referencian SocialImage por su URL pública. Cada entrada es
// { model: <nombre del modelo Prisma>, field: <columna JSON/string> }.
// El valor puede ser un JSON (array/objeto) o un string; se serializa y se
// extraen los UUIDs por regex, así es agnóstico al shape exacto del JSON.
const IMAGE_REF_SOURCES = [
  { model: 'instagramSnapshot',  field: 'topPosts' },
  { model: 'facebookSnapshot',   field: 'topPosts' },
  { model: 'linkedinSnapshot',   field: 'topPosts' },
  { model: 'competitorSnapshot', field: 'topPosts' },
  { model: 'tikTokSnapshot',     field: 'topVideos' },
  { model: 'youTubeSnapshot',    field: 'topVideos' },
  { model: 'monthlyReport',      field: 'dataCache' },
]

// UUID v4 que sigue a "/api/social-image/" en cualquier texto serializado.
const SOCIAL_IMAGE_URL_RE = /\/api\/social-image\/([0-9a-fA-F-]{36})/g

/**
 * Recorre todas las fuentes y devuelve el Set de ids de SocialImage que están
 * efectivamente referenciados (en uso). Todo lo que no esté acá es huérfano.
 * @returns {Promise<Set<string>>}
 */
async function collectUsedImageIds() {
  const used = new Set()
  for (const { model, field } of IMAGE_REF_SOURCES) {
    // Sólo trae la columna referenciante (no toda la fila) para no cargar datos de más.
    const rows = await prisma[model].findMany({ select: { [field]: true } })
    for (const row of rows) {
      const val = row[field]
      if (val == null) continue
      const text = typeof val === 'string' ? val : JSON.stringify(val)
      let m
      while ((m = SOCIAL_IMAGE_URL_RE.exec(text)) !== null) used.add(m[1])
    }
    SOCIAL_IMAGE_URL_RE.lastIndex = 0 // reset defensivo (regex global)
  }
  return used
}

/**
 * Tamaño total de la base + top tablas por tamaño en disco (datos + índices +
 * TOAST, que es donde Postgres guarda los Bytes grandes).
 * @param {number} limit — cuántas tablas devolver
 */
async function getDatabaseSize(limit = 12) {
  const [{ bytes }] = await prisma.$queryRawUnsafe(
    `SELECT pg_database_size(current_database())::bigint AS bytes`
  )
  const tables = await prisma.$queryRawUnsafe(
    `
    SELECT
      c.relname                              AS name,
      pg_total_relation_size(c.oid)::bigint  AS bytes,
      c.reltuples::bigint                    AS rows
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'r' AND n.nspname = 'public'
    ORDER BY pg_total_relation_size(c.oid) DESC
    LIMIT $1
    `,
    limit
  )
  return {
    totalBytes: Number(bytes),
    tables: tables.map(t => ({
      name:  t.name,
      bytes: Number(t.bytes),
      rows:  Number(t.rows),
    })),
  }
}

/**
 * Desglose de SocialImage: total vs en uso vs huérfanas (conteo + bytes).
 * Trae el peso de cada fila (octet_length, no la imagen) y lo clasifica contra
 * el set de ids en uso.
 */
async function getSocialImageStats() {
  const used = await collectUsedImageIds()
  // Peso por fila (sizeBytes, válido esté en DB o en R2; fallback al tamaño real
  // del blob legacy) + dónde vive (objectKey != null → R2).
  const rows = await prisma.$queryRawUnsafe(
    `SELECT id,
            COALESCE("sizeBytes", octet_length("imageData"), 0)::bigint AS bytes,
            ("objectKey" IS NOT NULL) AS in_r2
     FROM "SocialImage"`
  )

  const inUse  = { count: 0, bytes: 0 }
  const orphan = { count: 0, bytes: 0 }
  const r2     = { count: 0, bytes: 0 } // en object storage (no pesan en la DB)
  const db     = { count: 0, bytes: 0 } // legacy: bytes en Postgres
  for (const r of rows) {
    const b = Number(r.bytes || 0)
    const useBucket = used.has(r.id) ? inUse : orphan
    useBucket.count += 1
    useBucket.bytes += b
    const locBucket = r.in_r2 ? r2 : db
    locBucket.count += 1
    locBucket.bytes += b
  }
  return {
    total:    { count: rows.length, bytes: inUse.bytes + orphan.bytes },
    inUse,
    orphan,
    location: { r2, db }, // db = lo que todavía pesa en Postgres
  }
}

/**
 * Calcula los ids de SocialImage huérfanos, opcionalmente sólo los creados hace
 * más de `olderThanDays` días (guard contra borrar imágenes recién cacheadas
 * que todavía se están enganchando a un snapshot/informe en curso).
 * @returns {Promise<string[]>}
 */
async function findOrphanImageIds({ olderThanDays = 0 } = {}) {
  const used = await collectUsedImageIds()
  const where = {}
  if (olderThanDays > 0) {
    where.createdAt = { lt: new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000) }
  }
  const rows = await prisma.socialImage.findMany({ where, select: { id: true } })
  return rows.filter(r => !used.has(r.id)).map(r => r.id)
}

/**
 * Borra las imágenes huérfanas y (opcionalmente) corre VACUUM FULL para
 * devolver el espacio físico al disco — un DELETE en Postgres solo marca las
 * filas como reutilizables, no achica el archivo.
 *
 * VACUUM FULL toma un lock exclusivo sobre la tabla por unos segundos (durante
 * los cuales servir imágenes espera) y necesita espacio temporal del tamaño de
 * la tabla *resultante* (chica, tras borrar). Lo usamos en la limpieza manual;
 * el cron semanal borra sin VACUUM FULL (el hueco se reutiliza con las nuevas).
 *
 * @param {object} opts
 * @param {number} opts.olderThanDays — guard de antigüedad (default 0 = todas)
 * @param {boolean} opts.vacuum       — correr VACUUM FULL después (default true)
 * @returns {Promise<{ deleted: number, vacuumed: boolean }>}
 */
async function cleanupOrphanImages({ olderThanDays = 0, vacuum = true } = {}) {
  const ids = await findOrphanImageIds({ olderThanDays })
  if (ids.length === 0) return { deleted: 0, vacuumed: false, r2Deleted: 0 }

  // Borrar en lotes para no armar un IN (...) gigantesco.
  let deleted = 0
  let r2Deleted = 0
  const BATCH = 500
  for (let i = 0; i < ids.length; i += BATCH) {
    const slice = ids.slice(i, i + BATCH)
    // Primero borrar del bucket las que viven en R2 (las legacy no tienen objectKey).
    const inR2 = await prisma.socialImage.findMany({
      where:  { id: { in: slice }, objectKey: { not: null } },
      select: { objectKey: true },
    })
    if (inR2.length > 0) {
      const { deleted: n } = await objectStorage.deleteObjects(inR2.map(r => r.objectKey))
      r2Deleted += n
    }
    const { count } = await prisma.socialImage.deleteMany({ where: { id: { in: slice } } })
    deleted += count
  }

  let vacuumed = false
  if (vacuum && deleted > 0) {
    // VACUUM no puede correr dentro de una transacción; $executeRawUnsafe lo
    // ejecuta directo. Aislado para que un fallo de VACUUM no pierda el borrado.
    try {
      await prisma.$executeRawUnsafe(`VACUUM (FULL, ANALYZE) "SocialImage"`)
      vacuumed = true
    } catch (err) {
      console.warn('[storageStats] VACUUM FULL falló (el borrado sí se aplicó):', err.message)
    }
  }
  return { deleted, vacuumed, r2Deleted }
}

module.exports = {
  collectUsedImageIds,
  getDatabaseSize,
  getSocialImageStats,
  findOrphanImageIds,
  cleanupOrphanImages,
  IMAGE_REF_SOURCES,
}
