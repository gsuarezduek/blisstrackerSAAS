import { useState, useEffect } from 'react'
import api from '../../api/client'

const DATE_RANGES = [
  { value: '7daysAgo',  label: 'Últimos 7 días' },
  { value: '30daysAgo', label: 'Últimos 30 días' },
  { value: '90daysAgo', label: 'Últimos 90 días' },
]

function fmt(n, decimals = 0) {
  if (n == null || n === '') return '—'
  return Number(n).toLocaleString('es-AR', { maximumFractionDigits: decimals })
}

function fmtDuration(seconds) {
  if (!seconds) return '—'
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return `${m}m ${String(s).padStart(2, '0')}s`
}

function MetricCard({ label, value, sub }) {
  return (
    <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4">
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{label}</p>
      <p className="text-2xl font-bold text-gray-900 dark:text-white">{value ?? '—'}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

export default function InformesTab() {
  const [projects,      setProjects]      = useState([])
  const [projectId,     setProjectId]     = useState('')
  const [dateRange,     setDateRange]     = useState('30daysAgo')
  const [analytics,     setAnalytics]     = useState(null)
  const [loading,       setLoading]       = useState(false)
  const [error,         setError]         = useState('')
  const [errorStatus,   setErrorStatus]   = useState(null) // 'no_integration' | 'no_property' | 'error' | 'revoked'

  // Cargar lista de proyectos
  useEffect(() => {
    api.get('/projects').then(r => {
      setProjects(r.data)
      if (r.data.length > 0) setProjectId(String(r.data[0].id))
    }).catch(() => {})
  }, [])

  // Cargar datos de analytics cuando cambia proyecto o período
  useEffect(() => {
    if (!projectId) return
    setLoading(true)
    setError('')
    setErrorStatus(null)
    setAnalytics(null)

    api.get(`/marketing/projects/${projectId}/analytics?dateRange=${dateRange}`)
      .then(r => setAnalytics(r.data))
      .catch(e => {
        const status = e.response?.status
        const body   = e.response?.data

        if (status === 404) {
          setErrorStatus('no_integration')
        } else if (body?.status === 'no_property') {
          setErrorStatus('no_property')
        } else if (body?.code === 'TOKEN_EXPIRED' || body?.status === 'revoked' || body?.status === 'error') {
          setErrorStatus('revoked')
        } else {
          setError(body?.error || 'Error al cargar datos de Analytics')
        }
      })
      .finally(() => setLoading(false))
  }, [projectId, dateRange])

  const overview = analytics?.overview ?? {}

  return (
    <div className="space-y-5">

      {/* Controles */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5 flex flex-wrap gap-4 items-end">
        <div className="flex-1 min-w-[180px]">
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
            Proyecto
          </label>
          <select
            value={projectId}
            onChange={e => setProjectId(e.target.value)}
            className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            {projects.map(p => (
              <option key={p.id} value={String(p.id)}>{p.name}</option>
            ))}
          </select>
        </div>
        <div className="w-[180px]">
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
            Período
          </label>
          <select
            value={dateRange}
            onChange={e => setDateRange(e.target.value)}
            className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            {DATE_RANGES.map(d => (
              <option key={d.value} value={d.value}>{d.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Estados de error / sin integración */}
      {errorStatus === 'no_integration' && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-2xl p-6 text-center">
          <div className="text-3xl mb-2">📊</div>
          <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
            Google Analytics no está conectado para este proyecto
          </p>
          <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
            Conectalo desde <strong>Mis Proyectos → [Proyecto] → Info</strong>
          </p>
        </div>
      )}

      {errorStatus === 'no_property' && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-2xl p-6 text-center">
          <div className="text-3xl mb-2">🔢</div>
          <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
            Falta el GA4 Property ID
          </p>
          <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
            Ingresalo en <strong>Mis Proyectos → [Proyecto] → Info → Integraciones Google</strong>
          </p>
        </div>
      )}

      {errorStatus === 'error' && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-2xl p-6 text-center">
          <div className="text-3xl mb-2">⚠️</div>
          <p className="text-sm font-medium text-red-700 dark:text-red-300">
            La integración con Google Analytics tiene un error
          </p>
          <p className="text-xs text-red-500 dark:text-red-400 mt-1">
            Desconectá y volvé a conectar desde la tab Info del proyecto
          </p>
        </div>
      )}

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 rounded-2xl p-4 text-sm text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-10 text-center">
          <div className="inline-block w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin mb-3" />
          <p className="text-sm text-gray-400">Cargando datos de Google Analytics…</p>
        </div>
      )}

      {/* Datos GA4 */}
      {analytics && !loading && (
        <>
          {/* Métricas principales */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
              <span>📊</span>
              Google Analytics
              <span className="text-xs font-normal text-gray-400">
                · {DATE_RANGES.find(d => d.value === dateRange)?.label}
              </span>
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <MetricCard label="Sesiones"         value={fmt(overview.sessions)} />
              <MetricCard label="Usuarios activos" value={fmt(overview.activeUsers)} />
              <MetricCard label="Nuevos usuarios"  value={fmt(overview.newUsers)} />
              <MetricCard label="Vistas de página" value={fmt(overview.screenPageViews)} />
              <MetricCard
                label="Tasa de rebote"
                value={overview.bounceRate != null
                  ? `${fmt(overview.bounceRate * 100, 1)}%`
                  : '—'}
              />
              <MetricCard
                label="Duración media"
                value={fmtDuration(overview.averageSessionDuration)}
              />
            </div>
          </div>

          {/* Canales de tráfico */}
          {analytics.channels?.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">
                Canales de tráfico
              </h3>
              <div className="space-y-2.5">
                {analytics.channels.map((ch, i) => {
                  const maxSessions = analytics.channels[0]?.sessions || 1
                  const pct = Math.round((ch.sessions / maxSessions) * 100)
                  return (
                    <div key={i}>
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="text-gray-700 dark:text-gray-300">
                          {ch.channel || 'Directo'}
                        </span>
                        <span className="text-gray-500 text-xs">
                          {fmt(ch.sessions)} ses. · {fmt(ch.users)} usr.
                        </span>
                      </div>
                      <div className="h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary-500 rounded-full transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Top páginas */}
          {analytics.topPages?.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">
                Top páginas
              </h3>
              <div className="space-y-3">
                {analytics.topPages.map((page, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <span className="text-xs text-gray-400 w-5 mt-0.5 flex-shrink-0 text-right">
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-mono text-gray-700 dark:text-gray-300 truncate">
                        {page.path}
                      </p>
                      {page.title && page.title !== page.path && (
                        <p className="text-xs text-gray-400 truncate">{page.title}</p>
                      )}
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-xs font-medium text-gray-700 dark:text-gray-300">
                        {fmt(page.pageviews)}
                      </p>
                      <p className="text-xs text-gray-400">vistas</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Timestamp */}
          <p className="text-xs text-gray-400 text-right">
            Datos actualizados: {analytics.fetchedAt
              ? new Date(analytics.fetchedAt).toLocaleString('es-AR')
              : '—'}
          </p>
        </>
      )}

      {/* Placeholder Google Ads */}
      <div className="bg-gray-50 dark:bg-gray-800/50 rounded-2xl border border-dashed border-gray-300 dark:border-gray-600 p-6 text-center">
        <div className="text-2xl mb-2">📣</div>
        <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Google Ads — Próximamente</p>
        <p className="text-xs text-gray-400 mt-1">
          En proceso de configuración del Developer Token con Google.
        </p>
      </div>

    </div>
  )
}
