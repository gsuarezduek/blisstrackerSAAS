import { useState, useEffect } from 'react'
import api from '../api/client'

// Cache a nivel de módulo (config del formulario de legajo del workspace).
// Se invalida con clearLegajoFieldsCache() cuando un admin guarda cambios.
let cache = null            // { fields, legajoEnabled }
let cachePromise = null

export function clearLegajoFieldsCache() {
  cache = null
  cachePromise = null
}

export default function useLegajoFields() {
  const [data, setData]       = useState(cache)
  const [loading, setLoading] = useState(!cache)

  useEffect(() => {
    if (cache) { setData(cache); setLoading(false); return }
    if (!cachePromise) {
      cachePromise = api.get('/legajo/fields')
        .then(r => { cache = r.data; return r.data })
        .catch(() => { cachePromise = null; return null })
    }
    let alive = true
    cachePromise.then(d => { if (alive && d) { setData(d); setLoading(false) } })
    return () => { alive = false }
  }, [])

  return {
    fields: data?.fields ?? [],
    legajoEnabled: data?.legajoEnabled !== false,
    loading,
  }
}
