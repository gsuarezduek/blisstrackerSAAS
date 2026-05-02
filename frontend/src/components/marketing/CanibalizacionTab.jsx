import { useState, useEffect, useRef } from 'react'
import api from '../../api/client'

const SEVERITY_COLORS = {
  Alta:  'bg-red-100   dark:bg-red-900/30   text-red-700   dark:text-red-400   border-red-200   dark:border-red-700',
  Media: 'bg-amber-100 dark:bg-amber-900/30  text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-700',
  Baja:  'bg-blue-100  dark:bg-blue-900/30   text-blue-700  dark:text-blue-400  border-blue-200  dark:border-blue-700',
}

const SEVERITY_DOT = {
  Alta:  'bg-red-500',
  Media: 'bg-amber-400',
  Baja:  'bg-blue-400',
}

const DATE_RANGE_LABELS = { '30d': '30 días', '90d': '90 días', '180d': '180 días' }

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('es-AR', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function fmtNum(n) {
  if (n == null) return '—'
  return n.toLocaleString('es-AR')
}

function fmtPct(n) {
  if (n == null || n === 0) return '0%'
  return (n * 100).toFixed(1) + '%'
}

function SeverityBadge({ label }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${SEVERITY_COLORS[label] ?? ''}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${SEVERITY_DOT[label] ?? 'bg-gray-400'}`} />
      {label}
    </span>
  )
}

function ConflictCard({ conflict, expanded, onToggle }) {
  const { query, urls, severity, severityScore, totalImpressions, totalClicks, positionSpread } = conflict

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
      {/* Cabecera clickable */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
      >
        <SeverityBadge label={severity} />
        <span className="flex-1 font-medium text-gray-800 dark:text-gray-100 truncate text-sm">
          {query}
        </span>
        <span className="flex-shrink-0 text-xs text-gray-400 dark:text-gray-500 mr-2">
          {urls.length} URLs · {fmtNum(totalImpressions)} imp.
        </span>
        <span className="text-gray-400 dark:text-gray-500 text-sm">{expanded ? '▲' : '▼'}</span>
      </button>

      {/* Detalle expandible */}
      {expanded && (
        <div className="border-t border-gray-200 dark:border-gray-700 p-4 space-y-3">
          <div className="flex flex-wrap gap-4 text-xs text-gray-500 dark:text-gray-400">
            <span>Score: <strong className="text-gray-700 dark:text-gray-300">{severityScore}/100</strong></span>
            <span>Spread posiciones: <strong className="text-gray-700 dark:text-gray-300">{positionSpread}</strong></span>
            <span>Clics totales: <strong className="text-gray-700 dark:text-gray-300">{fmtNum(totalClicks)}</strong></span>
          </div>

          {/* Tabla de URLs */}
          <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-800">
                  <th className="text-left px-3 py-2 font-semibold text-gray-500 dark:text-gray-400">URL</th>
                  <th className="text-right px-3 py-2 font-semibold text-gray-500 dark:text-gray-400">Posición</th>
                  <th className="text-right px-3 py-2 font-semibold text-gray-500 dark:text-gray-400">Impresiones</th>
                  <th className="text-right px-3 py-2 font-semibold text-gray-500 dark:text-gray-400">Clics</th>
                  <th className="text-right px-3 py-2 font-semibold text-gray-500 dark:text-gray-400">CTR</th>
                </tr>
              </thead>
              <tbody>
                {urls.map((u, i) => (
                  <tr key={i} className="border-t border-gray-100 dark:border-gray-700/50 hover:bg-gray-50/50 dark:hover:bg-gray-800/30">
                    <td className="px-3 py-2">
                      <a
                        href={u.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary-600 dark:text-primary-400 hover:underline break-all max-w-xs block"
                      >
                        {u.url.replace(/^https?:\/\/[^/]+/, '') || '/'}
                      </a>
                    </td>
                    <td className="text-right px-3 py-2 font-medium text-gray-700 dark:text-gray-300">
                      {u.position?.toFixed(1) ?? '—'}
                    </td>
                    <td className="text-right px-3 py-2 text-gray-600 dark:text-gray-400">{fmtNum(u.impressions)}</td>
                    <td className="text-right px-3 py-2 text-gray-600 dark:text-gray-400">{fmtNum(u.clicks)}</td>
                    <td className="text-right px-3 py-2 text-gray-600 dark:text-gray-400">{fmtPct(u.ctr)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Recomendación */}
          <p className="text-xs text-gray-500 dark:text-gray-400 italic">
            <strong className="text-gray-600 dark:text-gray-300 not-italic">Acción:</strong>{' '}
            {severity === 'Alta'
              ? 'Definir una URL canónica para esta query y consolidar el contenido. Considerar 301 o canonical tag.'
              : severity === 'Media'
              ? 'Diferenciar el enfoque de contenido entre las URLs o consolidar la de menor rendimiento.'
              : 'Monitorear. Las URLs compiten de forma leve; revisar si hay diferenciación suficiente de contenido.'}
          </p>
        </div>
      )}
    </div>
  )
}

export default function CanibalizacionTab({ projectId }) {
  const [reports,       setReports]       = useState([])
  const [activeReport,  setActiveReport]  = useState(null)
  const [loadingList,   setLoadingList]   = useState(false)
  const [loadingReport, setLoadingReport] = useState(false)
  const [running,       setRunning]       = useState(false)
  const [dateRange,     setDateRange]     = useState('90d')
  const [filter,        setFilter]        = useState('all')   // 'all' | 'Alta' | 'Media' | 'Baja'
  const [search,        setSearch]        = useState('')
  const [expanded,      setExpanded]      = useState(new Set())
  const [deleteModal,   setDeleteModal]   = useState(null)
  const [deleting,      setDeleting]      = useState(false)
  const pollRef = useRef(null)

  // ── Cargar lista de reportes ────────────────────────────────────────────────
  useEffect(() => {
    if (!projectId) return
    loadList()
  }, [projectId])

  async function loadList() {
    setLoadingList(true)
    try {
      const { data } = await api.get(`/marketing/projects/${projectId}/cannibal?limit=10`)
      setReports(data.reports ?? [])
      // Si el más reciente está running/pending → cargar detalles y hacer polling
      const latest = (data.reports ?? [])[0]
      if (latest) {
        if (latest.status === 'running' || latest.status === 'pending') {
          startPolling(latest.id)
        } else if (latest.status === 'completed') {
          loadReport(latest.id)
        }
      }
    } catch { /* ignore */ }
    setLoadingList(false)
  }

  async function loadReport(rid) {
    setLoadingReport(true)
    try {
      const { data } = await api.get(`/marketing/projects/${projectId}/cannibal/${rid}`)
      setActiveReport(data)
      setExpanded(new Set())
    } catch { /* ignore */ }
    setLoadingReport(false)
  }

  // ── Polling ─────────────────────────────────────────────────────────────────
  function startPolling(rid) {
    setRunning(true)
    clearInterval(pollRef.current)
    pollRef.current = setInterval(async () => {
      try {
        const { data } = await api.get(`/marketing/projects/${projectId}/cannibal/${rid}`)
        if (data.status === 'completed' || data.status === 'failed') {
          clearInterval(pollRef.current)
          setRunning(false)
          setActiveReport(data)
          setReports(prev => prev.map(r => r.id === rid ? {
            ...r,
            status:         data.status,
            totalConflicts: data.totalConflicts,
            criticalCount:  data.criticalCount,
            warningCount:   data.warningCount,
            lowCount:       data.lowCount,
            trafficAtRisk:  data.trafficAtRisk,
          } : r))
        }
      } catch { /* ignore */ }
    }, 3000)
  }

  useEffect(() => () => clearInterval(pollRef.current), [])

  // ── Nuevo análisis ──────────────────────────────────────────────────────────
  async function handleRunAnalysis() {
    setRunning(true)
    try {
      const { data } = await api.post(`/marketing/projects/${projectId}/cannibal`, { dateRange })
      setActiveReport(null)
      setReports(prev => [{ id: data.reportId, status: 'pending', dateRange, createdAt: new Date().toISOString() }, ...prev])
      startPolling(data.reportId)
    } catch (err) {
      setRunning(false)
      alert(err.response?.data?.error ?? 'Error al iniciar el análisis')
    }
  }

  // ── Eliminar ────────────────────────────────────────────────────────────────
  async function handleDelete() {
    if (!deleteModal) return
    setDeleting(true)
    try {
      await api.delete(`/marketing/projects/${projectId}/cannibal/${deleteModal.id}`)
      setReports(prev => prev.filter(r => r.id !== deleteModal.id))
      if (activeReport?.id === deleteModal.id) setActiveReport(null)
      setDeleteModal(null)
    } catch (err) {
      alert(err.response?.data?.error ?? 'Error al eliminar')
    }
    setDeleting(false)
  }

  // ── Filtrar conflictos ───────────────────────────────────────────────────────
  const conflicts = activeReport?.conflicts ?? []
  const filteredConflicts = conflicts
    .filter(c => filter === 'all' || c.severity === filter)
    .filter(c => !search || c.query.toLowerCase().includes(search.toLowerCase()))

  // ─────────────────────────────────────────────────────────────────────────────
  //  RENDER
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Cabecera */}
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">
          Detección de Canibalización SEO
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Identifica keywords donde múltiples páginas del sitio compiten entre sí, diluyendo el tráfico orgánico.
        </p>
      </div>

      {/* Panel de control */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600 dark:text-gray-400 font-medium">Período:</label>
          <select
            value={dateRange}
            onChange={e => setDateRange(e.target.value)}
            disabled={running}
            className="text-sm border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-1.5 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50"
          >
            {Object.entries(DATE_RANGE_LABELS).map(([val, lbl]) => (
              <option key={val} value={val}>{lbl}</option>
            ))}
          </select>
        </div>

        <button
          onClick={handleRunAnalysis}
          disabled={running || !projectId}
          className="px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors flex items-center gap-2"
        >
          {running ? (
            <>
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
              </svg>
              Analizando…
            </>
          ) : (
            <>🔍 Nuevo análisis</>
          )}
        </button>

        {/* Historial compacto */}
        {reports.length > 1 && (
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-xs text-gray-500 dark:text-gray-400">Historial:</span>
            <div className="flex gap-1">
              {reports.slice(0, 5).map(r => (
                <button
                  key={r.id}
                  onClick={() => loadReport(r.id)}
                  title={fmtDate(r.createdAt)}
                  className={`w-7 h-7 rounded-full text-xs font-bold transition-colors border ${
                    activeReport?.id === r.id
                      ? 'bg-primary-600 text-white border-primary-600'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-primary-400'
                  }`}
                >
                  {reports.indexOf(r) + 1}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Estado running */}
      {running && !activeReport && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl p-5 flex items-center gap-3">
          <svg className="animate-spin h-5 w-5 text-amber-500 flex-shrink-0" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
          </svg>
          <div>
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">Analizando keywords…</p>
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">Consultando Google Search Console y calculando conflictos. Puede tardar algunos segundos.</p>
          </div>
        </div>
      )}

      {/* Sin datos todavía */}
      {!running && !activeReport && !loadingReport && reports.length === 0 && (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-10 text-center space-y-3">
          <div className="text-5xl">🔍</div>
          <p className="text-gray-600 dark:text-gray-300 font-medium">No hay análisis todavía</p>
          <p className="text-sm text-gray-400 dark:text-gray-500">
            Ejecutá el primer análisis para detectar keywords donde tus páginas compiten entre sí.
          </p>
        </div>
      )}

      {/* Loading detalle */}
      {loadingReport && (
        <div className="flex justify-center py-10">
          <svg className="animate-spin h-8 w-8 text-primary-500" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
          </svg>
        </div>
      )}

      {/* Reporte activo */}
      {activeReport && (
        <div className="space-y-4">
          {/* Resumen */}
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-5">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">
                  {DATE_RANGE_LABELS[activeReport.dateRange] ?? activeReport.dateRange} · {fmtDate(activeReport.createdAt)}
                </p>
                <div className="flex flex-wrap gap-4">
                  {/* KPIs */}
                  <div className="text-center">
                    <p className="text-2xl font-bold text-gray-800 dark:text-white">{fmtNum(activeReport.totalConflicts)}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Conflictos</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-red-600 dark:text-red-400">{fmtNum(activeReport.criticalCount)}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Alta</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{fmtNum(activeReport.warningCount)}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Media</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{fmtNum(activeReport.lowCount)}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Baja</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-gray-700 dark:text-gray-300">{fmtNum(activeReport.trafficAtRisk)}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Imp. en riesgo</p>
                  </div>
                </div>
              </div>

              {/* Botón eliminar */}
              <button
                onClick={() => setDeleteModal({ id: activeReport.id })}
                className="text-xs text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors flex items-center gap-1"
              >
                🗑 Eliminar
              </button>
            </div>

            {/* Resumen IA */}
            {activeReport.resumenGeneral && (
              <div className="mt-4 p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700">
                <p className="text-xs text-gray-400 dark:text-gray-500 mb-1 font-semibold uppercase tracking-wide">Análisis IA</p>
                <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{activeReport.resumenGeneral}</p>
              </div>
            )}

            {/* Sin conflictos */}
            {activeReport.totalConflicts === 0 && activeReport.status === 'completed' && (
              <div className="mt-4 p-4 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 text-center">
                <p className="text-green-700 dark:text-green-400 font-semibold">✅ No se detectaron conflictos de canibalización</p>
                <p className="text-xs text-green-600 dark:text-green-500 mt-1">Cada keyword relevante apunta a una única URL dominante. Excelente trabajo.</p>
              </div>
            )}

            {/* Error */}
            {activeReport.status === 'failed' && (
              <div className="mt-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700">
                <p className="text-sm text-red-700 dark:text-red-400">❌ {activeReport.errorMsg ?? 'El análisis falló. Intentá de nuevo.'}</p>
              </div>
            )}
          </div>

          {/* Filtros y buscador */}
          {(activeReport.totalConflicts ?? 0) > 0 && (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex gap-1">
                  {['all', 'Alta', 'Media', 'Baja'].map(f => (
                    <button
                      key={f}
                      onClick={() => setFilter(f)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors border ${
                        filter === f
                          ? 'bg-primary-600 text-white border-primary-600'
                          : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-primary-400'
                      }`}
                    >
                      {f === 'all' ? 'Todos' : f}
                      {f !== 'all' && (
                        <span className="ml-1 opacity-70">
                          ({f === 'Alta' ? activeReport.criticalCount : f === 'Media' ? activeReport.warningCount : activeReport.lowCount})
                        </span>
                      )}
                    </button>
                  ))}
                </div>

                <input
                  type="text"
                  placeholder="Buscar keyword…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="ml-auto text-sm border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-1.5 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 w-48"
                />
              </div>

              {/* Lista de conflictos */}
              <div className="space-y-2">
                {filteredConflicts.length === 0 ? (
                  <p className="text-center text-sm text-gray-400 dark:text-gray-500 py-8">
                    No hay conflictos que coincidan con el filtro.
                  </p>
                ) : (
                  filteredConflicts.map(conflict => (
                    <ConflictCard
                      key={conflict.query}
                      conflict={conflict}
                      expanded={expanded.has(conflict.query)}
                      onToggle={() => setExpanded(prev => {
                        const next = new Set(prev)
                        next.has(conflict.query) ? next.delete(conflict.query) : next.add(conflict.query)
                        return next
                      })}
                    />
                  ))
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* Modal de confirmación de eliminación */}
      {deleteModal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => !deleting && setDeleteModal(null)}
        >
          <div
            className="bg-white dark:bg-gray-900 rounded-2xl p-6 max-w-sm w-full shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="text-4xl mb-3 text-center">🗑️</div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white text-center mb-2">
              Eliminar análisis
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center mb-5">
              Esta acción es permanente. El reporte se eliminará completamente.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteModal(null)}
                disabled={deleting}
                className="flex-1 px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-semibold transition-colors disabled:opacity-50"
              >
                {deleting ? 'Eliminando…' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
