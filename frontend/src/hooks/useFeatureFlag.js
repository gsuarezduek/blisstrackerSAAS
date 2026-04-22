import { useState, useEffect } from 'react'
import api from '../api/client'

// Cache en memoria para no repetir el fetch dentro de la misma sesión
const cache = {}

/**
 * Devuelve { enabled: boolean, loading: boolean } para un feature flag dado.
 * Ejemplo: const { enabled } = useFeatureFlag('vacation_requests')
 */
export function useFeatureFlag(key) {
  const [enabled, setEnabled] = useState(cache[key] ?? false)
  const [loading, setLoading] = useState(!(key in cache))

  useEffect(() => {
    if (!key) return
    if (key in cache) { setEnabled(cache[key]); setLoading(false); return }

    api.get(`/feature-flags/${key}`)
      .then(r => { cache[key] = r.data.enabled; setEnabled(r.data.enabled) })
      .catch(() => { cache[key] = false; setEnabled(false) })
      .finally(() => setLoading(false))
  }, [key])

  return { enabled, loading }
}
