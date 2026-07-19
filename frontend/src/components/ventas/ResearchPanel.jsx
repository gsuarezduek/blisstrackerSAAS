import { useState, useEffect, useRef, useCallback } from 'react'
import api from '../../api/client'

const card = 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-5'

// Campos del resultado estructurado de la investigación IA (orden de render).
const FIELDS = [
  { key: 'description',   label: 'Descripción',          type: 'text' },
  { key: 'services',      label: 'Servicios / productos', type: 'list' },
  { key: 'market',        label: 'Mercado',              type: 'text' },
  { key: 'socialMedia',   label: 'Redes sociales',       type: 'text' },
  { key: 'website',       label: 'Sitio web',            type: 'text' },
  { key: 'seo',           label: 'SEO',                  type: 'text' },
  { key: 'ads',           label: 'Publicidad',           type: 'text' },
  { key: 'needs',         label: 'Posibles necesidades', type: 'list' },
  { key: 'opportunities', label: 'Oportunidades comerciales', type: 'list' },
]

export default function ResearchPanel({ leadId, onChanged }) {
  const [research, setResearch] = useState(null)
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState('')
  const pollRef = useRef(null)

  const fetchLatest = useCallback(async () => {
    const { data } = await api.get(`/ventas/leads/${leadId}/research`)
    setResearch(data)
    setLoading(false)
    return data
  }, [leadId])

  // Polling mientras la investigación corre.
  useEffect(() => {
    fetchLatest().then(r => { if (r && (r.status === 'pending' || r.status === 'running')) startPolling() })
    return () => clearInterval(pollRef.current)
  }, [fetchLatest])

  function startPolling() {
    clearInterval(pollRef.current)
    pollRef.current = setInterval(async () => {
      const r = await fetchLatest()
      if (!r || (r.status !== 'pending' && r.status !== 'running')) { clearInterval(pollRef.current); onChanged?.() }
    }, 3000)
  }

  async function run() {
    setStarting(true); setError('')
    try {
      await api.post(`/ventas/leads/${leadId}/research`)
      await fetchLatest()
      startPolling()
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo iniciar la investigación')
    } finally {
      setStarting(false)
    }
  }

  const running = research && (research.status === 'pending' || research.status === 'running')

  return (
    <div className={card}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">🔎 Investigación de la empresa (IA)</h3>
        <button onClick={run} disabled={starting || running}
          className="bg-primary-600 hover:bg-primary-700 disabled:opacity-60 text-white rounded-lg px-3 py-1.5 text-xs font-semibold">
          {running ? 'Investigando…' : starting ? 'Iniciando…' : (research ? 'Investigar de nuevo' : 'Investigar empresa')}
        </button>
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2 mb-3">{error}</p>}

      {loading ? (
        <p className="text-sm text-gray-400">Cargando…</p>
      ) : !research ? (
        <p className="text-sm text-gray-400">Todavía no se investigó esta empresa. La IA (Claude) analiza el sitio y arma un resumen comercial con posibles necesidades y oportunidades.</p>
      ) : running ? (
        <p className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2">
          <span className="inline-block w-3 h-3 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
          {research.errorMsg || 'Procesando…'}
        </p>
      ) : research.status === 'failed' ? (
        <p className="text-sm text-red-600 dark:text-red-400">Falló: {research.errorMsg || 'error desconocido'}</p>
      ) : (
        <div className="space-y-3">
          {FIELDS.map(f => {
            const v = research.result?.[f.key]
            if (v == null || (Array.isArray(v) && v.length === 0) || v === '') return null
            return (
              <div key={f.key}>
                <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-0.5">{f.label}</div>
                {f.type === 'list'
                  ? <ul className="list-disc list-inside text-sm text-gray-800 dark:text-gray-200 space-y-0.5">{v.map((x, i) => <li key={i}>{x}</li>)}</ul>
                  : <p className="text-sm text-gray-800 dark:text-gray-200">{v}</p>}
              </div>
            )
          })}
          {research.createdBy && (
            <p className="text-xs text-gray-400 pt-1">Generado por {research.createdBy.name} · {new Date(research.updatedAt).toLocaleString('es-AR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
          )}
        </div>
      )}
    </div>
  )
}
