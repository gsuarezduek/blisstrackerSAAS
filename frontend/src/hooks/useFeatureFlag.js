import { useState, useEffect } from 'react'
import api from '../api/client'

// Cache en memoria con TTL: evita repetir el fetch en cada mount, pero revalida
// periódicamente para que revocar un flag desde SuperAdmin (o un opt-out del
// admin del workspace) tenga efecto en sesiones ya abiertas sin necesitar un F5.
const cache = {}
const TTL_MS = 5 * 60 * 1000

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
    if (isFresh(cache[key])) { setEnabled(cache[key].value); setLoading(false); return }

    api.get(`/feature-flags/${key}`)
      .then(r => { cache[key] = { value: r.data.enabled, ts: Date.now() }; setEnabled(r.data.enabled) })
      .catch(() => { cache[key] = { value: false, ts: Date.now() }; setEnabled(false) })
      .finally(() => setLoading(false))
  }, [key])

  return { enabled, loading }
}
