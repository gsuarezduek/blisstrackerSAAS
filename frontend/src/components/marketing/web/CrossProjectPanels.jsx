import { useState, useEffect } from 'react'
import { ChartColumn, Monitor, Smartphone, Zap } from 'lucide-react'
import { Icon } from '../../ui/Icon'
import api from '../../../api/client'
import { fmtK, fmtSnapshotDate } from './webTabHelpers'

export function ScoreBar({ score }) {
  const color = score >= 90 ? 'bg-emerald-500' : score >= 50 ? 'bg-amber-400' : 'bg-red-500'
  return (
    <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-1.5">
      <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${score}%` }} />
    </div>
  )
}

export function CrossProjectAnalyticsPanel({ onSelectProject }) {
  const [data,       setData]       = useState(null)
  const [loading,    setLoading]    = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [flash,      setFlash]      = useState(null) // { ok, disconnected, error }

  const load = () =>
    api.get('/marketing/summary/analytics')
      .then(r => setData(r.data))
      .catch(() => setData([]))

  useEffect(() => { load().finally(() => setLoading(false)) }, [])

  const refreshAll = async () => {
    setRefreshing(true)
    setFlash(null)
    try {
      const { data: res } = await api.post('/marketing/summary/analytics/refresh')
      const disconnected = res.results.filter(r => r.status === 'disconnected').length
      const error        = res.results.filter(r => r.status === 'error').length
      setFlash({ ok: res.refreshed, disconnected, error })
      await load()
    } catch {
      setFlash({ ok: 0, disconnected: 0, error: -1 }) // -1 = falló la request entera
    } finally {
      setRefreshing(false)
    }
  }

  if (loading) return (
    <div className="flex justify-center py-12"><div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" /></div>
  )
  if (!data?.length) return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-10 text-center">
      <div className="mb-3"><Icon as={ChartColumn} size={32} className="inline-block text-gray-300 dark:text-gray-600" /></div>
      <p className="text-sm text-gray-500 dark:text-gray-400">Todavía no hay snapshots de Analytics. Seleccioná un proyecto para empezar.</p>
    </div>
  )

  const maxSessions = Math.max(...data.map(p => p.sessions), 1)

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
          Tráfico web por proyecto ({data.length}) <span className="font-normal text-gray-400">· último snapshot disponible</span>
        </h3>
        <button
          onClick={refreshAll}
          disabled={refreshing}
          className="flex-shrink-0 inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors"
        >
          {refreshing
            ? <><span className="w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" /> Actualizando…</>
            : <>Actualizar todo</>}
        </button>
      </div>

      {flash && (
        <div className={`mb-4 text-xs rounded-lg px-3 py-2 border ${
          flash.error
            ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300'
            : 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300'
        }`}>
          {flash.error === -1
            ? 'No se pudo ejecutar la actualización. Reintentá en unos segundos.'
            : <>
                {flash.ok} proyecto(s) actualizado(s).
                {flash.disconnected > 0 && <span className="text-red-600 dark:text-red-400"> · {flash.disconnected} desconectado(s)</span>}
                {flash.error > 0       && <span className="text-red-600 dark:text-red-400"> · {flash.error} con error</span>}
              </>}
        </div>
      )}

      <div className="space-y-3">
        {data.map(p => {
          const down = p.integrationStatus && p.integrationStatus !== 'active'
          return (
          <div key={p.projectId} className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <button
                  onClick={() => onSelectProject?.(String(p.projectId))}
                  className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate hover:text-primary-600 dark:hover:text-primary-400 transition-colors text-left"
                >
                  {p.projectName}
                </button>
                <div className="flex items-center gap-3 flex-shrink-0 ml-2">
                  {down && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300" title="La integración de Google Analytics se desconectó o venció. Reconectala desde el proyecto para poder actualizar.">
                      {p.integrationStatus === 'missing' ? 'Sin integración' : 'Desconectado'}
                    </span>
                  )}
                  {!p.hasData
                    ? <span className="text-xs text-gray-400">sin datos</span>
                    : <span className="text-xs text-gray-400" title={p.updatedAt ? `Capturado el ${fmtSnapshotDate(p.updatedAt)}` : undefined}>
                        {p.month}
                        {p.updatedAt && <span className="text-gray-300 dark:text-gray-500"> · {fmtSnapshotDate(p.updatedAt)}</span>}
                      </span>}
                  <span className="text-sm font-bold text-gray-900 dark:text-white tabular-nums">{p.hasData ? `${fmtK(p.sessions)} sesiones` : '—'}</span>
                </div>
              </div>
              <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-1.5">
                <div className={`h-1.5 rounded-full ${down ? 'bg-red-400' : 'bg-primary-500'}`} style={{ width: `${Math.round((p.sessions / maxSessions) * 100)}%` }} />
              </div>
              {p.hasData && (
                <div className="flex gap-3 mt-1 text-xs text-gray-400">
                  <span>{fmtK(p.activeUsers)} usuarios</span>
                  <span>{fmtK(p.pageviews)} vistas</span>
                  {p.conversions > 0 && <span>{fmtK(p.conversions)} conv.</span>}
                </div>
              )}
            </div>
          </div>
          )
        })}
      </div>
    </div>
  )
}

export function CrossProjectPerformancePanel({ onSelectProject }) {
  const [data,     setData]     = useState(null)
  const [loading,  setLoading]  = useState(true)
  const [strategy, setStrategy] = useState('mobile')

  useEffect(() => {
    setLoading(true)
    api.get(`/marketing/summary/performance?strategy=${strategy}`)
      .then(r => setData(r.data))
      .catch(() => setData([]))
      .finally(() => setLoading(false))
  }, [strategy])

  function scoreLabel(s) {
    if (s >= 90) return { text: 'Excelente', cls: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20' }
    if (s >= 50) return { text: 'Mejorable',  cls: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20' }
    return              { text: 'Crítico',    cls: 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20' }
  }

  const strategyToggle = (
    <div className="flex gap-1 bg-gray-100 dark:bg-gray-900 rounded-lg p-0.5">
      {['mobile', 'desktop'].map(s => (
        <button
          key={s}
          onClick={() => setStrategy(s)}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium capitalize transition-colors ${
            strategy === s
              ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
              : 'text-gray-500 dark:text-gray-400'
          }`}
        >
          <Icon as={s === 'mobile' ? Smartphone : Monitor} size={14} />{s}
        </button>
      ))}
    </div>
  )

  if (loading) return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Performance por proyecto</h3>
        {strategyToggle}
      </div>
      <div className="flex justify-center py-8"><div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" /></div>
    </div>
  )
  if (!data?.length) return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Performance por proyecto</h3>
        {strategyToggle}
      </div>
      <div className="text-center py-6">
        <div className="mb-3"><Icon as={Zap} size={32} className="inline-block text-gray-300 dark:text-gray-600" /></div>
        <p className="text-sm text-gray-500 dark:text-gray-400">Todavía no hay análisis de Performance ({strategy}). Seleccioná un proyecto para empezar.</p>
      </div>
    </div>
  )

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
          Performance por proyecto ({data.length}) <span className="font-normal text-gray-400">· último análisis {strategy}</span>
        </h3>
        {strategyToggle}
      </div>
      <div className="space-y-3">
        {data.map(p => {
          const { text, cls } = scoreLabel(p.performanceScore)
          return (
            <div key={p.projectId} className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <button
                    onClick={() => onSelectProject?.(String(p.projectId))}
                    className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate hover:text-primary-600 dark:hover:text-primary-400 transition-colors text-left"
                  >
                    {p.projectName}
                  </button>
                  <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                    <span className="text-sm font-bold text-gray-900 dark:text-white">{p.performanceScore}/100</span>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${cls}`}>{text}</span>
                  </div>
                </div>
                <ScoreBar score={p.performanceScore} />
                {(p.lcp || p.cls) && (
                  <div className="flex gap-3 mt-1 text-xs text-gray-400">
                    {p.lcp && <span>LCP {p.lcp}</span>}
                    {p.cls && <span>CLS {p.cls}</span>}
                    {p.fcp && <span>FCP {p.fcp}</span>}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
