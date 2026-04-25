import { useState, useEffect, useCallback } from 'react'
import api from '../../api/client'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtPos = n => (n != null && n > 0) ? n.toFixed(1) : '—'
const fmtNum = n => (n ?? 0).toLocaleString('es-AR')
const fmtPct = n => `${((n ?? 0) * 100).toFixed(1)}%`

function currentMonthStr() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

// ─── Mini gráfico SVG de posición ─────────────────────────────────────────────

function PositionChart({ rankings }) {
  if (!rankings?.length || rankings.every(r => r.position === 0)) return null

  const validRankings = rankings.filter(r => r.position > 0)
  if (validRankings.length < 2) return null

  const W = 280, H = 80, PAD = 12
  const positions = validRankings.map(r => r.position)
  const minPos = Math.min(...positions)
  const maxPos = Math.max(...positions)
  const range  = maxPos - minPos || 1

  // Eje Y invertido: posición baja (mejor) = arriba
  const toY = pos => PAD + ((pos - minPos) / range) * (H - PAD * 2)
  const toX = i   => PAD + (i / (validRankings.length - 1)) * (W - PAD * 2)

  const pts = validRankings.map((r, i) => `${toX(i)},${toY(r.position)}`).join(' ')

  return (
    <svg width={W} height={H} className="w-full" viewBox={`0 0 ${W} ${H}`}>
      {/* Fondo */}
      <rect width={W} height={H} rx="6" className="fill-gray-50 dark:fill-gray-700/50" />
      {/* Línea */}
      <polyline
        points={pts}
        fill="none"
        className="stroke-primary-500"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {/* Puntos */}
      {validRankings.map((r, i) => (
        <g key={r.month}>
          <circle cx={toX(i)} cy={toY(r.position)} r="3.5" className="fill-primary-500" />
          {/* Etiqueta mes */}
          <text
            x={toX(i)} y={H - 2}
            textAnchor="middle"
            fontSize="8"
            className="fill-gray-400 dark:fill-gray-500"
          >
            {r.month.slice(5)}
          </text>
          {/* Valor posición */}
          <text
            x={toX(i)} y={toY(r.position) - 6}
            textAnchor="middle"
            fontSize="9"
            className="fill-gray-600 dark:fill-gray-300 font-medium"
          >
            {r.position.toFixed(1)}
          </text>
        </g>
      ))}
    </svg>
  )
}

// ─── Badge GEO ────────────────────────────────────────────────────────────────

function GeoBadge({ level }) {
  if (!level) return null
  const map = {
    alto:  { dot: 'bg-green-500',  text: 'text-green-700 dark:text-green-400',  bg: 'bg-green-50 dark:bg-green-900/20',  label: 'Alto' },
    medio: { dot: 'bg-yellow-500', text: 'text-yellow-700 dark:text-yellow-400', bg: 'bg-yellow-50 dark:bg-yellow-900/20', label: 'Medio' },
    bajo:  { dot: 'bg-red-500',    text: 'text-red-700 dark:text-red-400',      bg: 'bg-red-50 dark:bg-red-900/20',      label: 'Bajo' },
  }
  const s = map[level] ?? map.bajo
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${s.bg} ${s.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      GEO {s.label}
    </span>
  )
}

// ─── Panel de análisis IA ────────────────────────────────────────────────────

function AnalysisPanel({ analysis, loading, onGenerate, updatedAt }) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 py-4">
        <div className="w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
        Analizando con IA…
      </div>
    )
  }

  if (!analysis) {
    return (
      <button
        onClick={onGenerate}
        className="mt-2 px-4 py-2 text-sm bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-xl transition-colors"
      >
        Analizar con IA →
      </button>
    )
  }

  const intentLabels = {
    informacional:  { label: 'Informacional',  color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
    navegacional:   { label: 'Navegacional',   color: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300' },
    comercial:      { label: 'Comercial',      color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' },
    transaccional:  { label: 'Transaccional',  color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' },
  }
  const intent = intentLabels[analysis.intencion] ?? intentLabels.informacional

  return (
    <div className="mt-3 space-y-4">
      {/* Métricas principales */}
      <div className="flex flex-wrap gap-2 items-center">
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${intent.color}`}>
          {intent.label}
        </span>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          Dificultad: <span className="font-semibold text-gray-700 dark:text-gray-200">{analysis.dificultad}/100</span>
        </span>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          Opportunity: <span className="font-semibold text-primary-600 dark:text-primary-400">{Number(analysis.opportunityScore).toFixed(1)}</span>
        </span>
        <GeoBadge level={analysis.potencialGeo} />
      </div>

      {/* Resumen */}
      <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
        {analysis.resumen}
      </p>

      {/* Motivo GEO */}
      {analysis.motivoGeo && (
        <p className="text-xs text-gray-500 dark:text-gray-400 italic">
          GEO: {analysis.motivoGeo}
        </p>
      )}

      {/* Tipo contenido */}
      {analysis.tipoContenido && (
        <p className="text-xs text-gray-600 dark:text-gray-400">
          Tipo de contenido recomendado: <span className="font-medium capitalize">{analysis.tipoContenido}</span>
        </p>
      )}

      {/* Long-tail */}
      {analysis.longTail?.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Variantes long-tail</p>
          <ul className="space-y-0.5">
            {analysis.longTail.map((v, i) => (
              <li key={i} className="text-xs text-gray-600 dark:text-gray-300 flex items-start gap-1">
                <span className="text-gray-400 mt-0.5">·</span> {v}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Topic Cluster */}
      {analysis.topicCluster && (
        <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-3 space-y-1.5">
          <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">Topic Cluster</p>
          <p className="text-xs text-gray-800 dark:text-gray-200 font-medium">
            Pilar: {analysis.topicCluster.pillar}
          </p>
          {analysis.topicCluster.clusters?.map((c, i) => (
            <p key={i} className="text-xs text-gray-600 dark:text-gray-400 pl-3 before:content-['·'] before:mr-1">
              {c}
            </p>
          ))}
        </div>
      )}

      {/* Recomendaciones */}
      {analysis.recomendaciones?.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Recomendaciones</p>
          <ul className="space-y-1">
            {analysis.recomendaciones.map((r, i) => (
              <li key={i} className="text-xs text-gray-700 dark:text-gray-300 flex items-start gap-1.5">
                <span className="text-primary-500 mt-0.5 shrink-0">✓</span> {r}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Actualizar */}
      <div className="flex items-center justify-between pt-1">
        {updatedAt && (
          <p className="text-[10px] text-gray-400">
            Análisis del {new Date(updatedAt).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })}
          </p>
        )}
        <button
          onClick={onGenerate}
          className="text-xs text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
        >
          Actualizar análisis
        </button>
      </div>
    </div>
  )
}

// ─── Fila expandible de keyword ───────────────────────────────────────────────

function KeywordRow({ kw, isExpanded, onToggle, onRemove }) {
  const [history,         setHistory]         = useState(null)
  const [historyLoading,  setHistoryLoading]  = useState(false)
  const [analysis,        setAnalysis]        = useState(null)
  const [analysisLoading, setAnalysisLoading] = useState(false)
  const [analysisError,   setAnalysisError]   = useState('')

  useEffect(() => {
    if (!isExpanded || history) return
    setHistoryLoading(true)
    api.get(`/marketing/projects/${kw.projectId}/keywords/${kw.id}/history`)
      .then(r => {
        setHistory(r.data)
        if (r.data.analysisContent) setAnalysis(r.data.analysisContent)
      })
      .catch(() => {})
      .finally(() => setHistoryLoading(false))
  }, [isExpanded]) // eslint-disable-line

  async function handleGenerateAnalysis() {
    setAnalysisLoading(true)
    setAnalysisError('')
    try {
      const r = await api.post(`/marketing/projects/${kw.projectId}/keywords/${kw.id}/analysis`)
      setAnalysis(r.data.analysis)
    } catch (err) {
      const msg = err.response?.data?.error ?? 'Error al generar análisis'
      setAnalysisError(msg)
    } finally {
      setAnalysisLoading(false)
    }
  }

  const deltaColor = kw.delta == null
    ? 'text-gray-400'
    : kw.delta > 0
      ? 'text-green-600 dark:text-green-400'
      : 'text-red-500 dark:text-red-400'

  const deltaLabel = kw.delta == null
    ? '—'
    : kw.delta > 0
      ? `↑ ${kw.delta.toFixed(1)}`
      : `↓ ${Math.abs(kw.delta).toFixed(1)}`

  return (
    <>
      <tr
        onClick={onToggle}
        className={`border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 cursor-pointer transition-colors ${isExpanded ? 'bg-primary-50/30 dark:bg-primary-900/10' : ''}`}
      >
        <td className="px-4 py-3 text-sm text-gray-800 dark:text-gray-200 max-w-[200px] truncate font-medium">
          {kw.query}
        </td>
        <td className="px-4 py-3 text-sm text-right tabular-nums text-gray-700 dark:text-gray-300">
          {fmtPos(kw.currentPosition)}
        </td>
        <td className={`px-4 py-3 text-sm text-right tabular-nums font-medium ${deltaColor}`}>
          {deltaLabel}
        </td>
        <td className="px-4 py-3 text-sm text-right tabular-nums text-gray-600 dark:text-gray-400">
          {fmtNum(kw.clicks)}
        </td>
        <td className="px-4 py-3 text-sm text-right tabular-nums text-gray-600 dark:text-gray-400">
          {fmtNum(kw.impressions)}
        </td>
        <td className="px-2 py-3 text-right">
          <button
            onClick={e => { e.stopPropagation(); onRemove(kw.id) }}
            className="text-gray-300 hover:text-red-500 dark:text-gray-600 dark:hover:text-red-400 transition-colors text-lg leading-none"
            title="Dejar de rastrear"
          >
            ×
          </button>
        </td>
      </tr>

      {isExpanded && (
        <tr>
          <td colSpan={6} className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-4">
            {historyLoading ? (
              <div className="flex items-center gap-2 text-sm text-gray-400 py-4">
                <div className="w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
                Cargando historial…
              </div>
            ) : (
              <div className="space-y-4">
                {/* Gráfico */}
                {history?.rankings?.length > 1 && (
                  <PositionChart rankings={history.rankings} />
                )}

                {/* Tabla historial */}
                {history?.rankings?.length > 0 ? (
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-gray-400 dark:text-gray-500">
                        <th className="text-left pb-1 font-medium">Mes</th>
                        <th className="text-right pb-1 font-medium">Posición</th>
                        <th className="text-right pb-1 font-medium">Clicks</th>
                        <th className="text-right pb-1 font-medium">Impresiones</th>
                        <th className="text-right pb-1 font-medium">CTR</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...history.rankings].reverse().map(r => (
                        <tr key={r.month} className="border-t border-gray-100 dark:border-gray-700/50">
                          <td className="py-1.5 text-gray-600 dark:text-gray-400">{r.month}</td>
                          <td className="py-1.5 text-right tabular-nums text-gray-700 dark:text-gray-300">{fmtPos(r.position)}</td>
                          <td className="py-1.5 text-right tabular-nums text-gray-600 dark:text-gray-400">{fmtNum(r.clicks)}</td>
                          <td className="py-1.5 text-right tabular-nums text-gray-600 dark:text-gray-400">{fmtNum(r.impressions)}</td>
                          <td className="py-1.5 text-right tabular-nums text-gray-600 dark:text-gray-400">{fmtPct(r.ctr)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="text-xs text-gray-400 italic">
                    Aún no hay datos históricos. El ranking se guardará automáticamente a fin de mes.
                  </p>
                )}

                {/* Error análisis */}
                {analysisError && (
                  <p className="text-xs text-red-500 dark:text-red-400">{analysisError}</p>
                )}

                {/* Panel IA */}
                <div className="border-t border-gray-100 dark:border-gray-700/50 pt-3">
                  <AnalysisPanel
                    analysis={analysis}
                    loading={analysisLoading}
                    onGenerate={handleGenerateAnalysis}
                    updatedAt={history?.analysisUpdatedAt}
                  />
                </div>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  )
}

// ─── Modal "Agregar keywords" ─────────────────────────────────────────────────

function SuggestModal({ projectId, onClose, onAdded }) {
  const [suggestions, setSuggestions] = useState([])
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState('')
  const [selected,    setSelected]    = useState(new Set())
  const [saving,      setSaving]      = useState(false)

  useEffect(() => {
    api.get(`/marketing/projects/${projectId}/keywords/suggest`)
      .then(r => setSuggestions(r.data.queries ?? []))
      .catch(err => setError(err.response?.data?.error ?? 'Error al cargar sugerencias'))
      .finally(() => setLoading(false))
  }, [projectId])

  function toggleSelect(query) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(query) ? next.delete(query) : next.add(query)
      return next
    })
  }

  async function handleAdd() {
    if (!selected.size) return
    setSaving(true)
    try {
      await Promise.all(
        [...selected].map(query => api.post(`/marketing/projects/${projectId}/keywords`, { query }))
      )
      onAdded()
      onClose()
    } catch (err) {
      setError(err.response?.data?.error ?? 'Error al agregar keywords')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-white">Agregar keywords desde GSC</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-xl leading-none">×</button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-3">
          {loading && (
            <div className="flex items-center justify-center py-10">
              <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}
          {error && (
            <p className="text-sm text-red-500 dark:text-red-400 py-4">{error}</p>
          )}
          {!loading && !error && suggestions.length === 0 && (
            <p className="text-sm text-gray-400 py-4 text-center">
              No se encontraron queries en Search Console para este mes.
            </p>
          )}
          {!loading && suggestions.map(s => (
            <label
              key={s.query}
              className={`flex items-center gap-3 py-2.5 border-b border-gray-50 dark:border-gray-700/50 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors ${s.alreadyTracked ? 'opacity-50 cursor-default' : ''}`}
            >
              <input
                type="checkbox"
                disabled={s.alreadyTracked}
                checked={s.alreadyTracked || selected.has(s.query)}
                onChange={() => !s.alreadyTracked && toggleSelect(s.query)}
                className="accent-primary-600 w-3.5 h-3.5 shrink-0"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-800 dark:text-gray-200 truncate">{s.query}</p>
                <p className="text-xs text-gray-400">{fmtNum(s.impressions)} impres. · pos. {s.position.toFixed(1)}</p>
              </div>
              {s.alreadyTracked && (
                <span className="text-[10px] bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 px-1.5 py-0.5 rounded-full shrink-0">
                  Rastreada
                </span>
              )}
            </label>
          ))}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between gap-3">
          <p className="text-xs text-gray-400">{selected.size} seleccionada{selected.size !== 1 ? 's' : ''}</p>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
              Cancelar
            </button>
            <button
              onClick={handleAdd}
              disabled={!selected.size || saving}
              className="px-4 py-2 text-sm bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white font-medium rounded-xl transition-colors"
            >
              {saving ? 'Agregando…' : `Agregar (${selected.size})`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function KeywordsTab({ projectId, projects }) {
  const [keywords,     setKeywords]     = useState([])
  const [loading,      setLoading]      = useState(false)
  const [error,        setError]        = useState('')
  const [expanded,     setExpanded]     = useState(null)
  const [suggestOpen,  setSuggestOpen]  = useState(false)

  const selectedProject = projects.find(p => String(p.id) === String(projectId))

  const loadKeywords = useCallback(() => {
    if (!projectId) return
    setLoading(true)
    setError('')
    api.get(`/marketing/projects/${projectId}/keywords`)
      .then(r => setKeywords(r.data))
      .catch(err => setError(err.response?.data?.error ?? 'Error al cargar keywords'))
      .finally(() => setLoading(false))
  }, [projectId])

  useEffect(() => { loadKeywords() }, [loadKeywords])

  async function handleRemove(kwId) {
    if (!window.confirm('¿Dejar de rastrear esta keyword? Se borrarán todos sus datos históricos.')) return
    try {
      await api.delete(`/marketing/projects/${projectId}/keywords/${kwId}`)
      setKeywords(prev => prev.filter(k => k.id !== kwId))
      if (expanded === kwId) setExpanded(null)
    } catch (err) {
      alert(err.response?.data?.error ?? 'Error al eliminar')
    }
  }

  // ── Estado vacío: sin proyecto ──────────────────────────────────────────────
  if (!projectId) {
    return (
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-10 text-center">
        <div className="text-4xl mb-3">🔑</div>
        <p className="text-sm text-gray-500 dark:text-gray-400">Seleccioná un proyecto arriba para rastrear keywords</p>
      </div>
    )
  }

  // ── Loading inicial ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  // ── Error ───────────────────────────────────────────────────────────────────
  if (error) {
    const noGsc = error.toLowerCase().includes('search console') || error.toLowerCase().includes('no conectado')
    return (
      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl px-4 py-4 text-sm text-red-600 dark:text-red-400">
        {noGsc
          ? <>Conectá Google Search Console en <strong>Proyectos → Info → Integraciones Google</strong> para rastrear keywords.</>
          : error
        }
      </div>
    )
  }

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-800 dark:text-white">
            Palabras clave rastreadas
            {keywords.length > 0 && (
              <span className="ml-2 text-xs font-normal text-gray-400">({keywords.length})</span>
            )}
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Período actual: {currentMonthStr()}
            {selectedProject?.name && ` · ${selectedProject.name}`}
          </p>
        </div>
        <button
          onClick={() => setSuggestOpen(true)}
          className="flex items-center gap-1.5 px-3 py-2 text-sm bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-xl transition-colors"
        >
          <span className="text-base leading-none">+</span>
          Agregar
        </button>
      </div>

      {/* Lista vacía */}
      {keywords.length === 0 && (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-10 text-center">
          <div className="text-3xl mb-3">🔍</div>
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Todavía no rastreás ninguna keyword
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">
            Hacé click en <strong>+ Agregar</strong> para elegir palabras clave desde Search Console.
          </p>
          <button
            onClick={() => setSuggestOpen(true)}
            className="px-4 py-2 text-sm bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-xl transition-colors"
          >
            + Agregar keywords
          </button>
        </div>
      )}

      {/* Tabla de keywords */}
      {keywords.length > 0 && (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-700">
                <th className="px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 text-left">Keyword</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 text-right">Posición</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 text-right">Cambio</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 text-right">Clicks</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 text-right">Impres.</th>
                <th className="px-2 py-3" />
              </tr>
            </thead>
            <tbody>
              {keywords.map(kw => (
                <KeywordRow
                  key={kw.id}
                  kw={{ ...kw, projectId }}
                  isExpanded={expanded === kw.id}
                  onToggle={() => setExpanded(expanded === kw.id ? null : kw.id)}
                  onRemove={handleRemove}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-gray-400 mt-3 text-right">
        Rankings guardados automáticamente el 1° de cada mes · Datos de Google Search Console
      </p>

      {/* Modal sugerencias */}
      {suggestOpen && (
        <SuggestModal
          projectId={projectId}
          onClose={() => setSuggestOpen(false)}
          onAdded={loadKeywords}
        />
      )}
    </>
  )
}
