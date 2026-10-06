import { useState, useEffect } from 'react'
import api from '../../../api/client'
import { AI_META } from './geoHelpers'

// ─── AI Traffic ───────────────────────────────────────────────────────────────

// Mini gráfico de barras SVG para el histórico
function AiBarChart({ history }) {
  if (!history?.length) return null

  // Calcular totales por mes
  const months = history.map(h => {
    const total = Object.entries(h)
      .filter(([k]) => k !== 'month')
      .reduce((s, [, v]) => s + (v || 0), 0)
    return { month: h.month, total }
  })

  const maxVal = Math.max(...months.map(m => m.total), 1)
  const W = 400
  const H = 80
  const barW = Math.max(Math.floor((W - 20) / months.length) - 4, 8)

  return (
    <svg viewBox={`0 0 ${W} ${H + 20}`} className="w-full" preserveAspectRatio="none">
      {months.map((m, i) => {
        const x    = 10 + i * ((W - 20) / months.length)
        const barH = Math.max(Math.round((m.total / maxVal) * H), 2)
        const y    = H - barH
        const label = m.month.slice(5) // "MM"
        return (
          <g key={m.month}>
            <rect x={x} y={y} width={barW} height={barH} rx="2" className="fill-primary-400 dark:fill-primary-500 opacity-80" />
            <text x={x + barW / 2} y={H + 14} textAnchor="middle" fontSize="7" className="fill-gray-400 dark:fill-gray-500">
              {label}
            </text>
            {m.total > 0 && (
              <text x={x + barW / 2} y={y - 3} textAnchor="middle" fontSize="7" className="fill-gray-500 dark:fill-gray-400">
                {m.total}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

export default function AiTrafficSection({ projectId }) {
  const [data,    setData]    = useState(null)   // { live, history }
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

  useEffect(() => {
    if (!projectId) return
    setLoading(true)
    setError(null)
    api.get(`/marketing/projects/${projectId}/ai-traffic`)
      .then(r => setData(r.data))
      .catch(err => {
        const code = err.response?.data?.code
        if (code !== 'NO_INTEGRATION') setError(err.response?.data?.error ?? 'Error al cargar tráfico de IAs')
        // Si no tiene GA4 conectado → simplemente no mostrar la sección
        setData(null)
      })
      .finally(() => setLoading(false))
  }, [projectId])

  if (loading) return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
      <div className="flex items-center gap-2 text-sm text-gray-400">
        <span className="w-4 h-4 border-2 border-primary-400 border-t-transparent rounded-full animate-spin inline-block" />
        Cargando tráfico desde IAs…
      </div>
    </div>
  )

  if (!data || error) return null   // Sin GA4 o error → no renderizar

  const live    = data.live    ?? {}
  const history = data.history ?? []

  // Filtrar fuentes con sesiones > 0
  const activeSources = Object.entries(live)
    .filter(([, v]) => v > 0)
    .sort(([, a], [, b]) => b - a)

  const totalLive = activeSources.reduce((s, [, v]) => s + v, 0)

  if (totalLive === 0 && history.length === 0) return null

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
          Tráfico desde IAs
        </h3>
        <span className="text-xs text-gray-400 dark:text-gray-500">Últimos 30 días</span>
      </div>

      {/* Tarjetas live (solo fuentes con > 0 sesiones) */}
      {activeSources.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {activeSources.map(([key, sessions]) => {
            const meta = AI_META[key] ?? { label: key, color: 'bg-gray-400' }
            const pct  = totalLive > 0 ? Math.round((sessions / totalLive) * 100) : 0
            return (
              <div key={key} className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-3 flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${meta.color}`} />
                  <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">{meta.label}</span>
                </div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white leading-tight">
                  {sessions.toLocaleString('es-AR')}
                </p>
                <div className="flex items-center gap-1">
                  <div className="flex-1 bg-gray-200 dark:bg-gray-600 rounded-full h-1">
                    <div className={`h-1 rounded-full ${meta.color}`} style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-xs text-gray-400 dark:text-gray-500">{pct}%</span>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <p className="text-sm text-gray-400 dark:text-gray-500 italic">
          Sin visitas desde IAs en los últimos 30 días.
        </p>
      )}

      {/* Total */}
      {totalLive > 0 && (
        <p className="text-xs text-gray-400 dark:text-gray-500">
          Total: <strong className="text-gray-600 dark:text-gray-300">{totalLive.toLocaleString('es-AR')} sesiones</strong> referidas desde IAs en los últimos 30 días.
        </p>
      )}

      {/* Histórico */}
      {history.length >= 2 && (
        <div className="border-t border-gray-100 dark:border-gray-700 pt-3">
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-2">Evolución mensual (sesiones totales desde IAs)</p>
          <AiBarChart history={history} />
        </div>
      )}
    </div>
  )
}
