const prisma = require('./prisma')
const os = require('os')

// Identidad única de este proceso/instancia. Con varias réplicas en Railway, cada
// una tiene un OWNER distinto → sólo una puede sostener la lease de un cron dado.
const OWNER = `${os.hostname()}:${process.pid}`

// Exclusión mutua DENTRO de este proceso (evita solapamiento si un job dura más que
// su intervalo). La exclusión ENTRE instancias la da la lease en DB (CronLock).
const running = new Set()

/**
 * Intenta tomar la lease del cron `name` por `ttlMs`. Atómico (un solo statement):
 * gana si la fila no existe o si su lease venció. Devuelve true si este proceso la tomó.
 *
 * Se usa una lease con TTL en vez de pg_advisory_lock porque, con el connection pool de
 * Prisma, un advisory lock (session-scoped) se toma en una conexión y podría intentar
 * liberarse en OTRA → quedaría colgado hasta reiniciar el proceso. La lease no depende
 * de qué conexión del pool se use y se auto-libera al vencer si la instancia se cae.
 */
async function acquireLease(name, ttlMs) {
  const now = new Date()
  const expiresAt = new Date(now.getTime() + ttlMs)
  const rows = await prisma.$queryRaw`
    INSERT INTO "CronLock" ("name", "lockedAt", "expiresAt", "owner")
    VALUES (${name}, ${now}, ${expiresAt}, ${OWNER})
    ON CONFLICT ("name") DO UPDATE
      SET "lockedAt"  = EXCLUDED."lockedAt",
          "expiresAt" = EXCLUDED."expiresAt",
          "owner"     = EXCLUDED."owner"
      WHERE "CronLock"."expiresAt" < ${now}
    RETURNING "owner"`
  return rows.length > 0 && rows[0].owner === OWNER
}

async function releaseLease(name) {
  await prisma.$executeRaw`DELETE FROM "CronLock" WHERE "name" = ${name} AND "owner" = ${OWNER}`
}

/**
 * Corre `fn` con exclusión mutua dentro del proceso (Set) y entre instancias (lease en DB).
 * Si otra instancia tiene la lease vigente, o el job ya corre en este proceso, se omite.
 * `ttlMs` debe superar la duración máxima esperada del job (si se cae la instancia, la
 * lease se libera sola al vencer y otra la toma en el próximo tick).
 *
 * @param {string} name  identificador estable del cron (clave de la lease)
 * @param {number} ttlMs vida de la lease en ms
 * @param {() => Promise<void>} fn
 */
async function runCron(name, ttlMs, fn) {
  if (running.has(name)) {
    console.log(`[cron:${name}] ya corriendo en esta instancia — se omite`)
    return
  }
  running.add(name)
  let held = false
  try {
    try {
      held = await acquireLease(name, ttlMs)
    } catch (err) {
      // Ante error de DB no corremos (mejor perder un tick que duplicar el trabajo).
      console.error(`[cron:${name}] error adquiriendo lease — se omite este tick:`, err.message)
      return
    }
    if (!held) {
      console.log(`[cron:${name}] tomado por otra instancia — se omite`)
      return
    }
    await fn()
  } finally {
    running.delete(name)
    if (held) {
      await releaseLease(name).catch(err =>
        console.error(`[cron:${name}] error liberando lease (vencerá sola):`, err.message))
    }
  }
}

module.exports = { runCron, OWNER }
