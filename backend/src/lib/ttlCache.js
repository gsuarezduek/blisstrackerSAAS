/**
 * Cache in-memory con TTL, pensado para AGREGACIONES ANALÍTICAS caras que hoy se
 * recalculan en cada request (productividad, health-score). NO usar para datos de
 * autorización ni para nada donde el usuario espere ver un cambio al instante.
 *
 * - Por proceso: con varias réplicas cada una tiene su copia → consistencia eventual,
 *   aceptable para datos analíticos (el TTL acota el desfase).
 * - Aislamiento por tenant: la clave SIEMPRE debe incluir el workspaceId.
 * - LRU aproximado con tope de entradas para no crecer sin límite.
 */
function createTtlCache({ ttlMs, max = 500 } = {}) {
  const store = new Map() // key → { value, expires }

  function get(key) {
    const hit = store.get(key)
    if (!hit) return undefined
    if (Date.now() > hit.expires) {
      store.delete(key)
      return undefined
    }
    // Re-inserta para aproximar LRU (el más usado queda al final del Map).
    store.delete(key)
    store.set(key, hit)
    return hit.value
  }

  function set(key, value) {
    if (store.size >= max && !store.has(key)) {
      // Evict del más viejo (primera clave del Map).
      const oldest = store.keys().next().value
      if (oldest !== undefined) store.delete(oldest)
    }
    store.set(key, { value, expires: Date.now() + ttlMs })
    return value
  }

  function del(key) { store.delete(key) }
  function clear() { store.clear() }

  /**
   * Read-through: devuelve el valor cacheado o ejecuta `fn`, cachea SÓLO si resuelve OK
   * (los errores no se cachean) y lo devuelve.
   */
  async function through(key, fn) {
    const cached = get(key)
    if (cached !== undefined) return cached
    const value = await fn()
    set(key, value)
    return value
  }

  return { get, set, del, clear, through }
}

module.exports = { createTtlCache }
