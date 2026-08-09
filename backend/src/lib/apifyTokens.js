/**
 * Fuente de verdad de qué tokens de Apify están disponibles para scrapear ahora
 * mismo, gestionados desde SuperAdmin → Scraping (modelo `ApifyToken`, cifrado
 * con `lib/encryption.js`). Caché in-memory TTL 60s + invalidación on-write,
 * mismo patrón que `lib/platformSettings.js`.
 *
 * Fallback: si no hay ninguna fila activa en DB (o la DB no responde), se cae a
 * las env vars legacy `APIFY_API_TOKEN`/`2`/`3`/`4` — así el sistema sigue
 * funcionando igual mientras no se cargue nada desde el panel, y permite
 * eventualmente dejar solo `APIFY_API_TOKEN` en Railway como fallback de emergencia.
 */
const prisma = require('./prisma')
const { decrypt } = require('./encryption')

const TTL_MS = 60 * 1000
let cache = null // { value, expiresAt }

function envFallbackTokens() {
  return [
    process.env.APIFY_API_TOKEN,
    process.env.APIFY_API_TOKEN2,
    process.env.APIFY_API_TOKEN3,
    process.env.APIFY_API_TOKEN4,
  ]
    .filter(Boolean)
    .map((token, i) => ({ id: null, label: `ENV #${i + 1}`, token }))
}

/**
 * Devuelve los tokens activos en orden de prioridad, ya desencriptados:
 * [{ id, label, token }]. `id` es `null` para los tokens de fallback por env var.
 */
async function getActiveApifyTokens() {
  const now = Date.now()
  if (cache && cache.expiresAt > now) return cache.value

  let value
  try {
    const rows = await prisma.apifyToken.findMany({
      where:   { active: true },
      orderBy: { order: 'asc' },
    })
    value = rows
      .map(row => {
        try {
          return { id: row.id, label: row.label, token: decrypt(row.token) }
        } catch (err) {
          console.warn(`[apifyTokens] No se pudo descifrar el token #${row.id} ("${row.label}"), se descarta:`, err.message)
          return null
        }
      })
      .filter(Boolean)
  } catch (err) {
    console.error('[apifyTokens] Error leyendo ApifyToken de la DB, usando fallback de env vars:', err.message)
    value = []
  }

  if (value.length === 0) value = envFallbackTokens()

  cache = { value, expiresAt: now + TTL_MS }
  return value
}

function invalidateApifyTokensCache() {
  cache = null
}

/**
 * Actualiza la señal de salud de un token tras usarlo (fire-and-forget, nunca lanza).
 * No-op si `tokenId` es null (caso fallback por env var, sin fila en DB).
 */
async function recordApifyTokenResult(tokenId, { success, errorMsg = null } = {}) {
  if (tokenId == null) return
  try {
    await prisma.apifyToken.update({
      where: { id: tokenId },
      data:  success
        ? { lastUsedAt: new Date() }
        : { lastFailedAt: new Date(), lastErrorMsg: errorMsg ? String(errorMsg).slice(0, 500) : null },
    })
  } catch (err) {
    console.error('[apifyTokens] No se pudo actualizar el estado del token:', err.message)
  }
}

module.exports = {
  getActiveApifyTokens,
  invalidateApifyTokensCache,
  recordApifyTokenResult,
}
