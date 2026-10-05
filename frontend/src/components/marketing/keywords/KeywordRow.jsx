import { useState, useEffect } from 'react'
import api from '../../../api/client'
import { fmtPos, fmtNum, fmtPct } from './keywordsHelpers'
import { PositionChart } from './KeywordsUI'
import AnalysisPanel from './AnalysisPanel'
import SerpPanel from './SerpPanel'

// ─── Fila expandible de keyword ───────────────────────────────────────────────

export default function KeywordRow({ kw, serpSnap, isExpanded, onToggle, onRemove, onAddKeyword }) {
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
            ? <span className="text-xs font-semibold bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 px-2 py-0.5 rounded-full">Featured</span>
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
