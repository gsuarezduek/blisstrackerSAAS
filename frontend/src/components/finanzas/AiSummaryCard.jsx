import { useEffect, useState } from 'react'
import { Sparkles, RefreshCw } from 'lucide-react'
import { Icon } from '../ui/Icon'
import api from '../../api/client'

function fmtDateTime(iso) {
  return new Date(iso).toLocaleString('es-AR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

// "Resumen de la semana" (sección 4.6): la IA solo redacta sobre datos ya
// calculados por el motor de reglas (backend) — nunca inventa números.
// Cacheado, "Actualizar" tiene cooldown de 1h (ver aiSummary.controller.js).
export default function AiSummaryCard() {
  const [summary, setSummary] = useState(undefined) // undefined = cargando, null = nunca generado
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { api.get('/finanzas/ai-summary').then(res => setSummary(res.data)) }, [])

  async function handleRefresh() {
    setRefreshing(true); setError('')
    try {
      const res = await api.post('/finanzas/ai-summary/refresh')
      setSummary(res.data)
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo actualizar')
    } finally { setRefreshing(false) }
  }

  return (
    <div className="bg-gray-900 dark:bg-black text-white rounded-2xl p-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-amber-400 uppercase tracking-wide flex items-center gap-1.5">
          <Icon as={Sparkles} size={13} /> Resumen de la semana
        </p>
        <button onClick={handleRefresh} disabled={refreshing} title="Actualizar" className="text-gray-400 hover:text-white disabled:opacity-40">
          <Icon as={RefreshCw} size={14} className={refreshing ? 'animate-spin' : ''} />
        </button>
      </div>

      {summary === undefined ? (
        <p className="text-sm text-gray-400">Cargando…</p>
      ) : summary === null ? (
        <p className="text-sm text-gray-300">Sin resumen todavía — tocá actualizar para generar uno.</p>
      ) : (
        <>
          <p className="text-sm text-gray-100">{summary.content}</p>
          <p className="text-[11px] text-gray-500 mt-2">{fmtDateTime(summary.generatedAt)}</p>
        </>
      )}
      {error && <p className="text-xs text-amber-400 mt-2">{error}</p>}
    </div>
  )
}
