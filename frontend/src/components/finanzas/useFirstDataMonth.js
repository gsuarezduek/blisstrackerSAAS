import { useEffect, useState } from 'react'
import api from '../../api/client'

// Primer mes con datos del workspace ("YYYY-MM" o null) — `source`:
// 'movements' (Ingresos/Egresos) o 'invoices' (Facturas, por emisión).
// Mientras carga (o si falla) devuelve null: el selector muestra solo el mes
// actual, que es el período por defecto de todas formas.
export function useFirstDataMonth(source) {
  const [month, setMonth] = useState(null)
  useEffect(() => {
    let alive = true
    api.get('/finanzas/first-month', { params: { source } })
      .then(res => { if (alive) setMonth(res.data?.month ?? null) })
      .catch(() => {})
    return () => { alive = false }
  }, [source])
  return month
}
