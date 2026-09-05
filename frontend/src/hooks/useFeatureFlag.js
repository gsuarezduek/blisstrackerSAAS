import { useState, useEffect } from 'react'
import api from '../api/client'

// Cache en memoria con TTL: evita repetir el fetch en cada mount, pero revalida
// periódicamente para que revocar un flag desde SuperAdmin (o un opt-out del
// admin del workspace) tenga efecto en sesiones ya abiertas sin necesitar un F5.
const cache = {}
const TTL_MS = 5 * 60 * 1000

// Cualquier hook montado que use la key invalidada refetchea al toque, en vez de
// esperar el TTL — necesario para el propio admin que togglea un módulo (desde
// Preferencias o el wizard de onboarding) y espera ver el efecto ya mismo, no
// hasta 5 minutos después (ver invalidateFeatureFlag más abajo).
const listeners = new Set()

function isFresh(entry) {
  return !!entry && (Date.now() - entry.ts) < TTL_MS
}

/**
 * Devuelve { enabled: boolean, loading: boolean } para un feature flag dado.
 * Ejemplo: const { enabled } = useFeatureFlag('vacation_requests')
 */
export function useFeatureFlag(key) {
  const cached = cache[key]
  const [enabled, setEnabled] = useState(cached?.value ?? false)
  const [loading, setLoading] = useState(!isFresh(cached))

  useEffect(() => {
    if (!key) return
    let cancelled = false

    function load() {
      setLoading(true)
      api.get(`/feature-flags/${key}`)
        .then(r => {
          cache[key] = { value: r.data.enabled, ts: Date.now() }
          if (!cancelled) setEnabled(r.data.enabled)
        })
        .catch(() => {
          cache[key] = { value: false, ts: Date.now() }
          if (!cancelled) setEnabled(false)
        })
        .finally(() => { if (!cancelled) setLoading(false) })
    }

    if (isFresh(cache[key])) {
      setEnabled(cache[key].value)
      setLoading(false)
    } else {
      load()
    }

    const onInvalidate = (changedKey) => {
      if (!changedKey || changedKey === key) load()
    }
    listeners.add(onInvalidate)
    return () => { cancelled = true; listeners.delete(onInvalidate) }
  }, [key])

  return { enabled, loading }
}

/**
 * Invalida la caché de un flag (o de todos, sin argumento) y hace que todo
 * `useFeatureFlag` montado ahora mismo refetchee al instante. Llamar después de
 * un PATCH /workspaces/current/features/:key exitoso (Preferencias, wizard de
 * onboarding) — sin esto, el propio admin que togglea un módulo sigue viendo el
 * estado viejo (ej. el link de Ventas en el Navbar) hasta que expire el TTL.
 */
export function invalidateFeatureFlag(key) {
  if (key) delete cache[key]
  else Object.keys(cache).forEach(k => delete cache[k])
  listeners.forEach(fn => fn(key))
}
