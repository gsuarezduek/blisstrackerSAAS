import { useState, useEffect, useCallback } from 'react'
import api from '../../api/client'
import ConfirmModal from '../ConfirmModal'
import ObjectiveProgressBars from './ObjectiveProgressBars'
import useObjectiveProgress from './useObjectiveProgress'
import OportunidadesTab from './OportunidadesTab'

// ─── Países disponibles (ISO 3166-1 alpha-3 lowercase) ────────────────────────

const COUNTRIES = [
  { code: 'arg', label: 'Argentina' },
  { code: 'mex', label: 'México' },
  { code: 'col', label: 'Colombia' },
  { code: 'esp', label: 'España' },
  { code: 'chl', label: 'Chile' },
  { code: 'per', label: 'Perú' },
  { code: 'ury', label: 'Uruguay' },
  { code: 'bra', label: 'Brasil' },
  { code: 'usa', label: 'EE.UU.' },
  { code: 'all', label: 'Global (todos)' },
]

const countryLabel = code => COUNTRIES.find(c => c.code === code)?.label ?? code.toUpperCase()

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtPos = n => (n != null && n > 0) ? n.toFixed(1) : '—'
const fmtNum = n => (n ?? 0).toLocaleString('es-AR')
const fmtPct = n => `${((n ?? 0) * 100).toFixed(1)}%`

function currentMonthStr() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

// ─── SERP Features ────────────────────────────────────────────────────────────

const SERP_FEATURE_LABELS = {
  featured_snippet: { label: 'Featured Snippet', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300' },
  ai_overview:      { label: 'AI Overview',       color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300' },
  local_pack:       { label: 'Local Pack',         color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' },
  shopping_results: { label: 'Shopping',           color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' },
  knowledge_graph:  { label: 'Knowledge Graph',   color: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300' },
  people_also_ask:  { label: 'People Also Ask',   color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300' },
  top_stories:      { label: 'Noticias',           color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300' },
  images:           { label: 'Imágenes',           color: 'bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-300' },
  videos:           { label: 'Videos',             color: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300' },
  site_links:       { label: 'Sitelinks',          color: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300' },
}

function SerpFeatureBadge({ feature }) {
  const meta = SERP_FEATURE_LABELS[feature]
  if (!meta) return null
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${meta.color}`}>
      {meta.label}
    </span>
  )
}

// ─── SerpPanel ────────────────────────────────────────────────────────────────

function SerpPanel({ projectId, kwId, onAddKeyword }) {
  const [snapshot,  setSnapshot]  = useState(null)
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [waitMins,  setWaitMins]  = useState(null)

  useEffect(() => {
    setLoading(true)
    setError('')
    api.get(`/marketing/projects/${projectId}/keywords/${kwId}/serp`)
      .then(r => setSnapshot(r.data.snapshot))
      .catch(err => setError(err.response?.data?.error ?? 'Error al cargar datos SERP'))
      .finally(() => setLoading(false))
  }, [projectId, kwId])

  async function handleRefresh() {
    setRefreshing(true)
    setError('')
    setWaitMins(null)
    try {
      const r = await api.post(`/marketing/projects/${projectId}/keywords/${kwId}/serp/refresh`)
      setSnapshot(r.data.snapshot)
    } catch (err) {
      const data = err.response?.data
      if (err.response?.status === 429) {
        setWaitMins(data?.waitMins ?? 15)
      } else {
        setError(data?.error ?? 'Error al actualizar')
      }
    } finally {
      setRefreshing(false)
    }
  }

  if (loading) return (
    <div className="flex items-center gap-2 text-sm text-gray-400 py-3">
      <div className="w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
      Consultando SerpAPI…
    </div>
  )

  if (error) return (
    <div className="text-sm text-red-500 dark:text-red-400 py-2">{error}</div>
  )

  if (!snapshot) return null

  const capturedDate = new Date(snapshot.capturedAt).toLocaleString('es-AR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })

  return (
    <div className="space-y-4">
      {/* Posición + URL */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 dark:text-gray-400">Posición SERP:</span>
          {snapshot.position != null
            ? <span className={`text-2xl font-bold tabular-nums ${snapshot.position <= 3 ? 'text-green-600 dark:text-green-400' : snapshot.position <= 10 ? 'text-blue-600 dark:text-blue-400' : 'text-gray-700 dark:text-gray-300'}`}>
                #{snapshot.position}
              </span>
            : <span className="text-sm text-gray-400 italic">No aparece en top 100</span>
          }
        </div>
        {snapshot.resultUrl && (
          <a
            href={snapshot.resultUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary-600 dark:text-primary-400 hover:underline truncate max-w-xs"
          >
            {snapshot.resultUrl}
          </a>
        )}
      </div>

      {/* Features SERP */}
      {snapshot.serpFeatures?.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Features en este SERP</p>
          <div className="flex flex-wrap gap-1.5">
            {snapshot.serpFeatures.map(f => <SerpFeatureBadge key={f} feature={f} />)}
          </div>
        </div>
      )}

      {/* Competidores */}
      {snapshot.competitors?.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Competidores orgánicos (top 10)</p>
          <div className="rounded-lg border border-gray-100 dark:border-gray-700 overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 dark:bg-gray-700/50">
                <tr>
                  <th className="px-3 py-2 text-left text-gray-500 dark:text-gray-400 font-medium w-10">#</th>
                  <th className="px-3 py-2 text-left text-gray-500 dark:text-gray-400 font-medium">Dominio</th>
                  <th className="px-3 py-2 text-left text-gray-500 dark:text-gray-400 font-medium hidden sm:table-cell">Título</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.competitors.map((c, i) => (
                  <tr key={i} className="border-t border-gray-100 dark:border-gray-700/50">
                    <td className="px-3 py-2 text-gray-500 dark:text-gray-400 tabular-nums">{c.position}</td>
                    <td className="px-3 py-2">
                      <a href={c.url} target="_blank" rel="noopener noreferrer"
                        className="text-primary-600 dark:text-primary-400 hover:underline font-medium">
                        {c.domain}
                      </a>
                    </td>
                    <td className="px-3 py-2 text-gray-600 dark:text-gray-400 hidden sm:table-cell truncate max-w-[240px]">
                      {c.title}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* People Also Ask */}
      {snapshot.peopleAlsoAsk?.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">People Also Ask</p>
          <ul className="space-y-1">
            {snapshot.peopleAlsoAsk.map((q, i) => (
              <li key={i} className="flex items-center justify-between gap-2 py-1 border-b border-gray-100 dark:border-gray-700/50 last:border-0">
                <span className="text-xs text-gray-700 dark:text-gray-300">{q}</span>
                <button
                  onClick={() => onAddKeyword(q)}
                  className="shrink-0 text-xs px-2 py-0.5 rounded-lg bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400 hover:bg-primary-100 dark:hover:bg-primary-900/40 transition-colors"
                >
                  + Rastrear
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Related Searches */}
      {snapshot.relatedSearches?.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Búsquedas relacionadas</p>
          <div className="flex flex-wrap gap-2">
            {snapshot.relatedSearches.map((q, i) => (
              <button
                key={i}
                onClick={() => onAddKeyword(q)}
                className="text-xs px-2.5 py-1 rounded-xl border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 hover:border-primary-300 hover:text-primary-600 transition-colors"
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Footer: timestamp + actualizar */}
      <div className="flex items-center justify-between pt-1 border-t border-gray-100 dark:border-gray-700/50">
        <span className="text-xs text-gray-400">Datos capturados: {capturedDate}</span>
        <div className="flex items-center gap-2">
          {waitMins && (
            <span className="text-xs text-orange-500">Disponible en {waitMins} min</span>
          )}
          <button
            onClick={handleRefresh}
            disabled={refreshing || !!waitMins}
            className="text-xs px-3 py-1 rounded-lg border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors"
          >
            {refreshing ? 'Actualizando…' : '↻ Actualizar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Heatmap de keywords ──────────────────────────────────────────────────────

const HM_COLORS = {
  top3:   'bg-green-500 text-white',
  top10:  'bg-blue-500 text-white',
  top20:  'bg-yellow-400 text-gray-900',
  below:  'bg-red-400 text-white',
  noData: 'bg-gray-100 dark:bg-gray-700 text-gray-400',
}

function heatmapColor(position) {
  if (position == null || position <= 0) return HM_COLORS.noData
  if (position <= 3)  return HM_COLORS.top3
  if (position <= 10) return HM_COLORS.top10
  if (position <= 20) return HM_COLORS.top20
  return HM_COLORS.below
}

function KeywordHeatmap({ projectId }) {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!projectId) return
    setLoading(true)
    api.get(`/marketing/projects/${projectId}/keywords/heatmap`)
      .then(r => setData(r.data.keywords))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [projectId])

  if (loading) return (
    <div className="flex justify-center py-12"><div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" /></div>
  )
  if (!data?.length) return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-8 text-center text-sm text-gray-400">
      Sin datos de keywords para mostrar el heatmap.
    </div>
  )

  // Obtener todos los meses únicos y tomar los últimos 6
  const allMonths = [...new Set(data.flatMap(kw => kw.rankings.map(r => r.month)))].sort().slice(-6)

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Heatmap de posiciones</h3>
          <p className="text-xs text-gray-400 mt-0.5">Últimos {allMonths.length} meses</p>
        </div>
        <div className="flex items-center gap-2 text-[10px]">
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-green-500" /> 1-3</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-blue-500" /> 4-10</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-yellow-400" /> 11-20</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-red-400" /> 21+</span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-100 dark:border-gray-700">
              <th className="px-4 py-2 text-left text-gray-500 dark:text-gray-400 font-medium min-w-[160px]">Keyword</th>
              {allMonths.map(m => (
                <th key={m} className="px-2 py-2 text-center text-gray-400 font-medium min-w-[60px]">
                  {m.slice(5)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map(kw => {
              const rankMap = {}
              kw.rankings.forEach(r => { rankMap[r.month] = r.position })
              return (
                <tr key={kw.id} className="border-b border-gray-50 dark:border-gray-700/50 last:border-0">
                  <td className="px-4 py-2 text-gray-700 dark:text-gray-300 max-w-[160px] truncate font-medium">
                    {kw.query}
                  </td>
                  {allMonths.map(m => {
                    const pos = rankMap[m]
                    return (
                      <td key={m} className="px-2 py-2 text-center">
                        <span
                          title={pos != null && pos > 0 ? `Pos. ${pos.toFixed(1)}` : 'Sin dato'}
                          className={`inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded min-w-[36px] ${heatmapColor(pos)}`}
                        >
                          {pos != null && pos > 0 ? pos.toFixed(1) : '—'}
                        </span>
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Vista de clusters ────────────────────────────────────────────────────────

function ClustersView({ keywords, projectId, expanded, onToggle, onRemove }) {
  const withAnalysis = keywords.filter(kw => kw.hasAnalysis)

  if (withAnalysis.length < 2) {
    return (
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-8 text-center">
        <div className="text-3xl mb-3">🗂️</div>
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Clusters no disponibles</p>
        <p className="text-xs text-gray-400">Analizá al menos 2 keywords con IA para ver los topic clusters.</p>
      </div>
    )
  }

  // Agrupar por topic cluster pillar (requiere que el análisis esté cacheado en kw)
  // Como no tenemos el analysisContent en la lista, agrupamos por hasAnalysis vs no
  const withCluster = withAnalysis
  const noCluster   = keywords.filter(kw => !kw.hasAnalysis)

  return (
    <div className="space-y-4">
      {withCluster.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
            Keywords con análisis IA
          </p>
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
                {withCluster.map(kw => (
                  <KeywordRow key={kw.id} kw={{ ...kw, projectId }} isExpanded={expanded === kw.id} onToggle={() => onToggle(kw.id)} onRemove={onRemove} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {noCluster.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
            Sin clasificar
          </p>
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden opacity-70">
            <table className="w-full">
              <tbody>
                {noCluster.map(kw => (
                  <KeywordRow key={kw.id} kw={{ ...kw, projectId }} isExpanded={expanded === kw.id} onToggle={() => onToggle(kw.id)} onRemove={onRemove} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
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
      <rect width={W} height={H} rx="6" className="fill-gray-50 dark:fill-gray-700/50" />
      <polyline
        points={pts}
        fill="none"
        className="stroke-primary-500"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {validRankings.map((r, i) => (
        <g key={r.month}>
          <circle cx={toX(i)} cy={toY(r.position)} r="3.5" className="fill-primary-500" />
          <text x={toX(i)} y={H - 2} textAnchor="middle" fontSize="8" className="fill-gray-400 dark:fill-gray-500">
            {r.month.slice(5)}
          </text>
          <text x={toX(i)} y={toY(r.position) - 6} textAnchor="middle" fontSize="9" className="fill-gray-600 dark:fill-gray-300 font-medium">
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
    alto:  { dot: 'bg-green-500',  text: 'text-green-700 dark:text-green-400',   bg: 'bg-green-50 dark:bg-green-900/20',   label: 'Alto' },
    medio: { dot: 'bg-yellow-500', text: 'text-yellow-700 dark:text-yellow-400', bg: 'bg-yellow-50 dark:bg-yellow-900/20', label: 'Medio' },
    bajo:  { dot: 'bg-red-500',    text: 'text-red-700 dark:text-red-400',       bg: 'bg-red-50 dark:bg-red-900/20',       label: 'Bajo' },
  }
  const s = map[level] ?? map.bajo
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${s.bg} ${s.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      GEO {s.label}
    </span>
  )
}

// ─── Panel de análisis IA ─────────────────────────────────────────────────────

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

      <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{analysis.resumen}</p>

      {analysis.motivoGeo && (
        <p className="text-xs text-gray-500 dark:text-gray-400 italic">GEO: {analysis.motivoGeo}</p>
      )}

      {analysis.tipoContenido && (
        <p className="text-xs text-gray-600 dark:text-gray-400">
          Tipo de contenido recomendado: <span className="font-medium capitalize">{analysis.tipoContenido}</span>
        </p>
      )}

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

      {analysis.topicCluster && (
        <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-3 space-y-1.5">
          <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">Topic Cluster</p>
          <p className="text-xs text-gray-800 dark:text-gray-200 font-medium">Pilar: {analysis.topicCluster.pillar}</p>
          {analysis.topicCluster.clusters?.map((c, i) => (
            <p key={i} className="text-xs text-gray-600 dark:text-gray-400 pl-3 before:content-['·'] before:mr-1">{c}</p>
          ))}
        </div>
      )}

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

function KeywordRow({ kw, serpSnap, isExpanded, onToggle, onRemove, onAddKeyword }) {
  const [history,         setHistory]         = useState(null)
  const [historyLoading,  setHistoryLoading]  = useState(false)
  const [analysis,        setAnalysis]        = useState(null)
  const [analysisLoading, setAnalysisLoading] = useState(false)
  const [analysisError,   setAnalysisError]   = useState('')
  const [innerTab,        setInnerTab]        = useState('gsc') // 'gsc' | 'ia' | 'serp'

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
    : kw.delta > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'

  const deltaLabel = kw.delta == null
    ? '—'
    : kw.delta > 0 ? `↑ ${kw.delta.toFixed(1)}` : `↓ ${Math.abs(kw.delta).toFixed(1)}`

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
          {kw.currentPosition != null && kw.currentPosition > 0 && kw.currentPosition < 1.0
            ? <span className="text-xs font-semibold bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 px-2 py-0.5 rounded-full">⭐ Featured</span>
            : fmtPos(kw.currentPosition)
          }
        </td>
        <td className="px-4 py-3 text-sm text-right tabular-nums">
          {serpSnap
            ? serpSnap.position != null
              ? <span className={`font-semibold ${serpSnap.position <= 3 ? 'text-green-600 dark:text-green-400' : serpSnap.position <= 10 ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400'}`}>
                  #{serpSnap.position}
                </span>
              : <span className="text-xs text-gray-400 italic">—</span>
            : <span className="text-xs text-gray-300 dark:text-gray-600">·</span>
          }
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
          <td colSpan={7} className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-4">
            {/* Tabs internos */}
            <div className="flex gap-1 mb-4 border-b border-gray-100 dark:border-gray-700">
              {[
                { id: 'gsc',  label: 'Historial GSC' },
                { id: 'ia',   label: 'Análisis IA' },
                { id: 'serp', label: 'SERP Live' },
              ].map(t => (
                <button
                  key={t.id}
                  onClick={() => setInnerTab(t.id)}
                  className={`px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors ${
                    innerTab === t.id
                      ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                      : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Tab: Historial GSC */}
            {innerTab === 'gsc' && (
              historyLoading ? (
                <div className="flex items-center gap-2 text-sm text-gray-400 py-4">
                  <div className="w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
                  Cargando historial…
                </div>
              ) : (
                <div className="space-y-4">
                  {history?.rankings?.length > 1 && <PositionChart rankings={history.rankings} />}

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
                </div>
              )
            )}

            {/* Tab: Análisis IA */}
            {innerTab === 'ia' && (
              <div className="space-y-3">
                {analysisError && (
                  <p className="text-xs text-red-500 dark:text-red-400">{analysisError}</p>
                )}
                <AnalysisPanel
                  analysis={analysis}
                  loading={analysisLoading}
                  onGenerate={handleGenerateAnalysis}
                  updatedAt={history?.analysisUpdatedAt}
                />
              </div>
            )}

            {/* Tab: SERP Live */}
            {innerTab === 'serp' && (
              <SerpPanel
                projectId={kw.projectId}
                kwId={kw.id}
                onAddKeyword={q => onAddKeyword(q)}
              />
            )}
          </td>
        </tr>
      )}
    </>
  )
}

// ─── Vista: SERP Overview ─────────────────────────────────────────────────────

function SerpOverview({ projectId, keywords, onAddKeyword }) {
  const [snapshots, setSnapshots] = useState({})
  const [loading,   setLoading]   = useState(false)

  useEffect(() => {
    if (!projectId) return
    setLoading(true)
    api.get(`/marketing/projects/${projectId}/keywords/serp-batch`)
      .then(r => setSnapshots(r.data.snapshots ?? {}))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [projectId])

  if (loading) return (
    <div className="flex justify-center py-12">
      <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  const sorted = [...keywords].sort((a, b) => {
    const pa = snapshots[a.id]?.position ?? 999
    const pb = snapshots[b.id]?.position ?? 999
    return pa - pb
  })

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">SERP Live — Resumen</h3>
        <p className="text-xs text-gray-400 mt-0.5">Snapshots de los últimos 7 días · Actualización automática cada lunes</p>
      </div>
      <table className="w-full">
        <thead>
          <tr className="border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/30">
            <th className="px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400 text-left">Keyword</th>
            <th className="px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400 text-center">Pos. SERP</th>
            <th className="px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400 text-left">Features</th>
            <th className="px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400 text-right">Actualizado</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map(kw => {
            const snap = snapshots[kw.id]
            return (
              <tr key={kw.id} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/20">
                <td className="px-4 py-2.5 text-sm text-gray-800 dark:text-gray-200 font-medium">
                  {kw.query}
                </td>
                <td className="px-4 py-2.5 text-center">
                  {snap
                    ? snap.position != null
                      ? <span className={`text-sm font-bold tabular-nums ${snap.position <= 3 ? 'text-green-600 dark:text-green-400' : snap.position <= 10 ? 'text-blue-600 dark:text-blue-400' : 'text-gray-600 dark:text-gray-400'}`}>
                          #{snap.position}
                        </span>
                      : <span className="text-xs text-gray-400 italic">no aparece</span>
                    : <span className="text-xs text-gray-300 dark:text-gray-600">—</span>
                  }
                </td>
                <td className="px-4 py-2.5">
                  {snap?.serpFeatures?.length > 0
                    ? <div className="flex flex-wrap gap-1">
                        {snap.serpFeatures.slice(0, 3).map(f => <SerpFeatureBadge key={f} feature={f} />)}
                        {snap.serpFeatures.length > 3 && (
                          <span className="text-xs text-gray-400">+{snap.serpFeatures.length - 3}</span>
                        )}
                      </div>
                    : snap
                      ? <span className="text-xs text-gray-400">—</span>
                      : <span className="text-xs text-gray-300 dark:text-gray-600">Sin datos</span>
                  }
                </td>
                <td className="px-4 py-2.5 text-right text-xs text-gray-400">
                  {snap
                    ? new Date(snap.capturedAt).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })
                    : '—'
                  }
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {keywords.length === 0 && (
        <div className="px-4 py-8 text-center text-sm text-gray-400">
          No hay keywords rastreadas aún.
        </div>
      )}
    </div>
  )
}

// ─── Modal "Agregar keywords" ─────────────────────────────────────────────────

function SuggestModal({ projectId, country, onClose, onAdded }) {
  const [manualInput,  setManualInput]  = useState('')
  const [manualError,  setManualError]  = useState('')
  const [addingManual, setAddingManual] = useState(false)

  const [suggestions,  setSuggestions]  = useState([])
  const [suggestLoad,  setSuggestLoad]  = useState(true)
  const [suggestError, setSuggestError] = useState('')
  const [selected,     setSelected]     = useState(new Set())
  const [saving,       setSaving]       = useState(false)

  useEffect(() => {
    const params = country && country !== 'arg' ? `?country=${country}` : ''
    api.get(`/marketing/projects/${projectId}/keywords/suggest${params}`)
      .then(r => setSuggestions(r.data.queries ?? []))
      .catch(err => {
        // Si GSC no está conectado o no hay datos, no es error crítico — la entrada manual sigue disponible
        const msg = err.response?.data?.error ?? ''
        if (!msg.toLowerCase().includes('no conectado') && !msg.toLowerCase().includes('no integration')) {
          setSuggestError(msg || 'No se pudieron cargar sugerencias de Search Console.')
        }
      })
      .finally(() => setSuggestLoad(false))
  }, [projectId, country])

  async function handleAddManual(e) {
    e.preventDefault()
    const query = manualInput.trim().toLowerCase()
    if (!query) return
    setManualError('')
    setAddingManual(true)
    try {
      await api.post(`/marketing/projects/${projectId}/keywords`, { query })
      onAdded()
      setManualInput('')
      // Marcar como ya rastreada en las sugerencias si aparece
      setSuggestions(prev => prev.map(s =>
        s.query.toLowerCase() === query ? { ...s, alreadyTracked: true } : s
      ))
    } catch (err) {
      setManualError(err.response?.data?.error ?? 'Error al agregar la keyword')
    } finally {
      setAddingManual(false)
    }
  }

  function toggleSelect(query) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(query) ? next.delete(query) : next.add(query)
      return next
    })
  }

  async function handleAddSelected() {
    if (!selected.size) return
    setSaving(true)
    try {
      await Promise.all(
        [...selected].map(query => api.post(`/marketing/projects/${projectId}/keywords`, { query }))
      )
      onAdded()
      setSelected(new Set())
      setSuggestions(prev => prev.map(s =>
        selected.has(s.query) ? { ...s, alreadyTracked: true } : s
      ))
    } catch (err) {
      setSuggestError(err.response?.data?.error ?? 'Error al agregar keywords')
    } finally {
      setSaving(false)
    }
  }

  const availableSuggestions = suggestions.filter(s => !s.alreadyTracked)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md max-h-[85vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-white">Agregar keywords</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-xl leading-none">×</button>
        </div>

        <div className="flex-1 overflow-y-auto">

          {/* ── Entrada manual ────────────────────────────────────────────── */}
          <div className="px-5 pt-4 pb-3">
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
              Agregar manualmente
            </p>
            <form onSubmit={handleAddManual} className="flex gap-2">
              <input
                type="text"
                autoFocus
                value={manualInput}
                onChange={e => { setManualInput(e.target.value); setManualError('') }}
                placeholder="ej: agencia de marketing digital"
                className="flex-1 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
              <button
                type="submit"
                disabled={!manualInput.trim() || addingManual}
                className="px-3 py-2 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap"
              >
                {addingManual ? '…' : '+ Agregar'}
              </button>
            </form>
            {manualError && (
              <p className="text-xs text-red-500 mt-1.5">{manualError}</p>
            )}
          </div>

          {/* ── Sugerencias desde GSC ─────────────────────────────────────── */}
          <div className="px-5 pb-3">
            <div className="flex items-center gap-3 my-3">
              <div className="flex-1 h-px bg-gray-100 dark:bg-gray-700" />
              <p className="text-xs text-gray-400 dark:text-gray-500 shrink-0">
                O elegí desde Search Console
                {country && <span className="ml-1">· {countryLabel(country)}</span>}
              </p>
              <div className="flex-1 h-px bg-gray-100 dark:bg-gray-700" />
            </div>

            {suggestLoad && (
              <div className="flex items-center justify-center py-6">
                <div className="w-5 h-5 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
              </div>
            )}

            {!suggestLoad && suggestError && (
              <p className="text-xs text-gray-400 dark:text-gray-500 py-2 text-center">{suggestError}</p>
            )}

            {!suggestLoad && !suggestError && suggestions.length === 0 && (
              <p className="text-xs text-gray-400 dark:text-gray-500 py-2 text-center">
                No hay datos disponibles en Search Console para este mes.
              </p>
            )}

            {!suggestLoad && suggestions.length > 0 && (() => {
              const maxOpp = Math.max(...availableSuggestions.map(s => s.impressions / Math.max(s.position, 1)), 1)
              const withOpp = suggestions
                .map(s => ({ ...s, opp: s.impressions / Math.max(s.position, 1) }))
                .sort((a, b) => b.opp - a.opp)

              return withOpp.map(s => {
                const score    = (s.opp / maxOpp)
                const oppBadge = !s.alreadyTracked
                  ? score > 0.6 ? { label: 'Alta oportunidad', cls: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' }
                  : score > 0.3 ? { label: 'Media',            cls: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400' }
                  : null
                  : null

                return (
                  <label
                    key={s.query}
                    className={`flex items-center gap-3 py-2.5 border-b border-gray-50 dark:border-gray-700/50 last:border-0 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors ${s.alreadyTracked ? 'opacity-40 cursor-default' : ''}`}
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
                    {oppBadge && (
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0 ${oppBadge.cls}`}>
                        {oppBadge.label}
                      </span>
                    )}
                    {s.alreadyTracked && (
                      <span className="text-[10px] bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 px-1.5 py-0.5 rounded-full shrink-0">
                        Rastreada
                      </span>
                    )}
                  </label>
                )
              })
            })()}
          </div>
        </div>

        {/* Footer — solo si hay selección de GSC */}
        {selected.size > 0 && (
          <div className="px-5 py-4 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between gap-3">
            <p className="text-xs text-gray-400">{selected.size} seleccionada{selected.size !== 1 ? 's' : ''} de GSC</p>
            <button
              onClick={handleAddSelected}
              disabled={saving}
              className="px-4 py-2 text-sm bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white font-medium rounded-xl transition-colors"
            >
              {saving ? 'Agregando…' : `Agregar (${selected.size})`}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Selector de país ─────────────────────────────────────────────────────────

function CountrySelector({ country, integrationCountry, onChange, onSaveDefault, savingDefault }) {
  const isLive = country !== integrationCountry

  return (
    <div className="flex items-center gap-2">
      <select
        value={country}
        onChange={e => onChange(e.target.value)}
        className="text-xs border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary-500"
      >
        {COUNTRIES.map(c => (
          <option key={c.code} value={c.code}>{c.label}</option>
        ))}
      </select>

      {isLive && (
        <>
          <span className="text-[10px] font-medium bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 px-1.5 py-0.5 rounded-full">
            En vivo
          </span>
          <button
            onClick={onSaveDefault}
            disabled={savingDefault}
            className="text-xs text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors disabled:opacity-50 whitespace-nowrap"
            title={`Guardar ${countryLabel(country)} como país predeterminado`}
          >
            {savingDefault ? 'Guardando…' : 'Guardar como predeterminado'}
          </button>
        </>
      )}

      {!isLive && (
        <span className="text-[10px] text-gray-400 dark:text-gray-500">
          predeterminado
        </span>
      )}
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

function exportCsv(keywords) {
  const header = 'query,posición,delta,clicks,impresiones,CTR'
  const rows   = keywords.map(kw => [
    `"${kw.query}"`,
    kw.currentPosition != null ? kw.currentPosition.toFixed(1) : '',
    kw.delta != null ? kw.delta.toFixed(1) : '',
    kw.clicks ?? 0,
    kw.impressions ?? 0,
    kw.ctr != null ? `${(kw.ctr * 100).toFixed(1)}%` : '',
  ].join(','))
  const csv  = [header, ...rows].join('\n')
  const url  = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `keywords-${new Date().toISOString().slice(0, 10)}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

export default function KeywordsTab({ projectId, projects }) {
  const objectives = useObjectiveProgress(projectId).filter(o => o.metric === 'posicionamiento')
  const [keywords,          setKeywords]          = useState([])
  const [loading,           setLoading]           = useState(false)
  const [error,             setError]             = useState('')
  const [expanded,          setExpanded]          = useState(null)
  const [suggestOpen,       setSuggestOpen]       = useState(false)
  const [view,              setView]              = useState('tabla') // 'tabla' | 'heatmap' | 'clusters' | 'serp'
  const [country,           setCountry]           = useState('arg')
  const [integrationCountry, setIntegrationCountry] = useState('arg')
  const [liveMode,          setLiveMode]          = useState(false)
  const [savingDefault,     setSavingDefault]     = useState(false)
  const [serpBatch,         setSerpBatch]         = useState({}) // { [kwId]: { position, serpFeatures, capturedAt } }
  const [kwToRemove,        setKwToRemove]        = useState(null) // keyword | null
  const [removingKw,        setRemovingKw]        = useState(false)

  const selectedProject = projects.find(p => String(p.id) === String(projectId))

  const loadSerpBatch = useCallback((pid) => {
    const id = pid ?? projectId
    if (!id) return
    api.get(`/marketing/projects/${id}/keywords/serp-batch`)
      .then(r => setSerpBatch(r.data.snapshots ?? {}))
      .catch(() => {})
  }, [projectId]) // eslint-disable-line

  const loadKeywords = useCallback((overrideCountry) => {
    if (!projectId) return
    const c = overrideCountry ?? country
    setLoading(true)
    setError('')
    const params = c ? `?country=${c}` : ''
    api.get(`/marketing/projects/${projectId}/keywords${params}`)
      .then(r => {
        const data = r.data
        setKeywords(data.keywords ?? [])
        setLiveMode(data.liveMode ?? false)
        if (data.integrationCountry) {
          setIntegrationCountry(data.integrationCountry)
          // Solo setea el country inicial desde la integración en la primera carga
          if (overrideCountry === undefined && !liveMode) {
            setCountry(data.integrationCountry)
          }
        }
      })
      .catch(err => setError(err.response?.data?.error ?? 'Error al cargar keywords'))
      .finally(() => setLoading(false))
  }, [projectId, country]) // eslint-disable-line

  // Carga inicial y cuando cambia el proyecto
  useEffect(() => {
    setCountry('arg')
    setIntegrationCountry('arg')
    setLiveMode(false)
    setExpanded(null)
    setSerpBatch({})
    loadKeywords('arg')
    loadSerpBatch(projectId)
  }, [projectId]) // eslint-disable-line

  function handleCountryChange(newCountry) {
    setCountry(newCountry)
    setExpanded(null)
    loadKeywords(newCountry)
  }

  async function handleSaveDefault() {
    setSavingDefault(true)
    try {
      await api.patch(`/marketing/projects/${projectId}/integrations/google_search_console`, { country })
      setIntegrationCountry(country)
      setLiveMode(false)
    } catch (err) {
      alert(err.response?.data?.error ?? 'Error al guardar el país predeterminado')
    } finally {
      setSavingDefault(false)
    }
  }

  function handleRemove(kwId) {
    setKwToRemove(keywords.find(k => k.id === kwId) || { id: kwId })
  }

  async function confirmRemoveKeyword() {
    if (!kwToRemove) return
    setRemovingKw(true)
    try {
      await api.delete(`/marketing/projects/${projectId}/keywords/${kwToRemove.id}`)
      setKeywords(prev => prev.filter(k => k.id !== kwToRemove.id))
      if (expanded === kwToRemove.id) setExpanded(null)
    } catch (err) {
      alert(err.response?.data?.error ?? 'Error al eliminar')
    } finally {
      setRemovingKw(false)
      setKwToRemove(null)
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
      <div className="flex items-start justify-between mb-4 gap-3 flex-wrap">
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
        <div className="flex items-center gap-3 flex-wrap">
          <CountrySelector
            country={country}
            integrationCountry={integrationCountry}
            onChange={handleCountryChange}
            onSaveDefault={handleSaveDefault}
            savingDefault={savingDefault}
          />
          {/* Toggle de vista */}
          <div className="flex rounded-xl border border-gray-200 dark:border-gray-600 overflow-hidden text-xs">
            {[
              { id: 'tabla',    label: 'Tabla' },
              { id: 'heatmap',  label: 'Heatmap' },
              { id: 'clusters', label: 'Clusters' },
              { id: 'serp',     label: 'SERP Live' },
            ].map(v => (
              <button key={v.id} onClick={() => setView(v.id)}
                className={`px-3 py-2 transition-colors ${
                  view === v.id
                    ? 'bg-primary-600 text-white'
                    : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}>
                {v.label}
              </button>
            ))}
          </div>
          {keywords.length > 0 && (
            <button
              onClick={() => exportCsv(keywords)}
              className="px-3 py-2 text-xs border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-xl transition-colors"
              title="Exportar a CSV"
            >
              ↓ CSV
            </button>
          )}
          <button
            onClick={() => setSuggestOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-sm bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-xl transition-colors"
          >
            <span className="text-base leading-none">+</span>
            Agregar
          </button>
        </div>
      </div>

      {/* Objetivos de posicionamiento del proyecto */}
      {objectives.length > 0 && (
        <div className="mb-4">
          <ObjectiveProgressBars objectives={objectives} title="🎯 Objetivos de posicionamiento" />
        </div>
      )}

      {/* Aviso modo en vivo */}
      {liveMode && (
        <div className="mb-4 flex items-start gap-2 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-xl px-4 py-3">
          <span className="text-orange-500 mt-0.5 shrink-0">ℹ</span>
          <p className="text-xs text-orange-700 dark:text-orange-300">
            Mostrando datos en vivo de <strong>{countryLabel(country)}</strong> desde Search Console. Los rankings
            guardados mensualmente son de <strong>{countryLabel(integrationCountry)}</strong>.
            {' '}El historial y el delta solo están disponibles para el país predeterminado.
          </p>
        </div>
      )}

      {/* Lista vacía */}
      {keywords.length === 0 && (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-10 text-center">
          <div className="text-3xl mb-3">🔍</div>
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Todavía no rastreás ninguna keyword
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">
            Hacé click en <strong>+ Agregar</strong> para escribir cualquier palabra clave o elegir desde Search Console.
          </p>
          <button
            onClick={() => setSuggestOpen(true)}
            className="px-4 py-2 text-sm bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-xl transition-colors"
          >
            + Agregar keywords
          </button>
        </div>
      )}

      {/* Vistas de keywords */}
      {keywords.length > 0 && view === 'tabla' && (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-700">
                <th className="px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 text-left">Keyword</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 text-right">GSC ↕</th>
                <th className="px-4 py-3 text-xs font-medium text-purple-400 dark:text-purple-400 text-right">SERP</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 text-right">
                  {liveMode ? <span className="text-orange-500">Cambio</span> : 'Cambio'}
                </th>
                <th className="px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 text-right">Clicks</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 text-right">Impres. ↓</th>
                <th className="px-2 py-3" />
              </tr>
            </thead>
            <tbody>
              {[...keywords]
                .sort((a, b) => (b.impressions ?? 0) - (a.impressions ?? 0))
                .map(kw => (
                  <KeywordRow
                    key={kw.id}
                    kw={{ ...kw, projectId }}
                    serpSnap={serpBatch[kw.id] ?? null}
                    isExpanded={expanded === kw.id}
                    onToggle={() => setExpanded(expanded === kw.id ? null : kw.id)}
                    onRemove={handleRemove}
                    onAddKeyword={async q => {
                      await api.post(`/marketing/projects/${projectId}/keywords`, { query: q }).catch(() => {})
                      loadKeywords(country)
                    }}
                  />
                ))
              }
            </tbody>
          </table>
        </div>
      )}

      {view === 'heatmap' && (
        <KeywordHeatmap projectId={projectId} />
      )}

      {keywords.length > 0 && view === 'clusters' && (
        <ClustersView
          keywords={keywords}
          projectId={projectId}
          expanded={expanded}
          onToggle={id => setExpanded(expanded === id ? null : id)}
          onRemove={handleRemove}
        />
      )}

      {view === 'serp' && (
        <SerpOverview
          projectId={projectId}
          keywords={keywords}
          onAddKeyword={async q => {
            await api.post(`/marketing/projects/${projectId}/keywords`, { query: q }).catch(() => {})
            loadKeywords(country)
          }}
        />
      )}

      <p className="text-xs text-gray-400 mt-3 text-right">
        Rankings guardados automáticamente el 1° de cada mes · {countryLabel(integrationCountry)} · Google Search Console
      </p>

      {/* Oportunidades SEO (striking distance, CTR bajo, content decay) */}
      <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
        <h2 className="text-sm font-semibold text-gray-800 dark:text-white mb-3">🎯 Oportunidades</h2>
        <OportunidadesTab projectId={projectId} projects={projects} />
      </div>

      {/* Modal sugerencias */}
      {suggestOpen && (
        <SuggestModal
          projectId={projectId}
          country={country}
          onClose={() => setSuggestOpen(false)}
          onAdded={() => loadKeywords(country)}
        />
      )}

      <ConfirmModal
        open={!!kwToRemove}
        title="Dejar de rastrear keyword"
        message={kwToRemove?.query ? `Se borrarán todos los datos históricos de "${kwToRemove.query}".` : 'Se borrarán todos sus datos históricos.'}
        confirmLabel="Dejar de rastrear"
        loading={removingKw}
        onConfirm={confirmRemoveKeyword}
        onCancel={() => setKwToRemove(null)}
      />
    </>
  )
}
