import { useState } from 'react'
import { Monitor, Smartphone } from 'lucide-react'
import { Icon } from '../../ui/Icon'
import CreateTaskModal from './CreateTaskModal'
import { PS_SCORE_COLOR, PS_SCORE_BG, RATING_DOT, METRIC_LABELS } from './webTabHelpers'

export default function PageSpeedSection({ websiteUrl, strategy, onStrategyChange, result, history, running, onRun, projectId, projectName }) {
  const metrics       = result?.metrics       ?? {}
  const opportunities = result?.opportunities ?? []
  const diagnostics   = result?.diagnostics   ?? []
  const score         = result?.performanceScore
  const [taskModal, setTaskModal] = useState(null)

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-5 space-y-5">

      {/* Cabecera */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
            Performance
          </h3>
          {websiteUrl && (
            <p className="text-xs text-gray-400 mt-0.5 font-mono truncate max-w-[240px]">
              {websiteUrl}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Toggle mobile/desktop */}
          <div className="flex rounded-lg border border-gray-200 dark:border-gray-600 overflow-hidden text-xs">
            {['mobile', 'desktop'].map(s => (
              <button
                key={s}
                onClick={() => onStrategyChange(s)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 capitalize transition-colors ${
                  strategy === s
                    ? 'bg-primary-600 text-white'
                    : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
              >
                <Icon as={s === 'mobile' ? Smartphone : Monitor} size={14} />{s}
              </button>
            ))}
          </div>
          <button
            onClick={onRun}
            disabled={running}
            className="px-3 py-1.5 text-xs bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white font-medium rounded-lg transition-colors flex items-center gap-1.5"
          >
            {running
              ? <><span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> Analizando…</>
              : '▶ Analizar'}
          </button>
        </div>
      </div>

      {/* Historial de scores */}
      {history.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-400">Historial:</span>
          {history.map((h, i) => (
            <span
              key={h.id}
              title={new Date(h.createdAt).toLocaleString('es-AR')}
              className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${
                i === 0 ? 'ring-2 ring-primary-400' : 'opacity-60'
              } ${PS_SCORE_BG(h.performanceScore)}`}
            >
              <span className={PS_SCORE_COLOR(h.performanceScore)}>{h.performanceScore ?? '?'}</span>
            </span>
          ))}
        </div>
      )}

      {/* Loading */}
      {running && !result && (
        <div className="flex items-center gap-3 text-sm text-gray-400 py-4">
          <div className="w-5 h-5 border-2 border-primary-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
          Analizando performance con PageSpeed Insights… puede tardar hasta 30 segundos.
        </div>
      )}

      {/* Resultado */}
      {result && result.status === 'done' && (
        <>
          {/* Score + métricas */}
          <div className="flex flex-wrap gap-4 items-start">
            {/* Score grande */}
            <div className={`flex-shrink-0 rounded-2xl border p-5 text-center min-w-[110px] ${PS_SCORE_BG(score)}`}>
              <p className={`text-5xl font-black leading-none ${PS_SCORE_COLOR(score)}`}>
                {score ?? '—'}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">Performance</p>
              <p className="text-[10px] text-gray-400 capitalize mt-0.5">{result.strategy}</p>
            </div>

            {/* Métricas CWV */}
            <div className="flex-1 min-w-[220px] grid grid-cols-2 gap-2">
              {Object.entries(METRIC_LABELS).map(([key, { label, title }]) => {
                const m = metrics[key]
                if (!m) return null
                return (
                  <div key={key} className="flex items-center gap-2 bg-gray-50 dark:bg-gray-700/50 rounded-xl px-3 py-2">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${RATING_DOT(m.rating)}`} />
                    <div className="min-w-0">
                      <p className="text-[10px] text-gray-400 font-medium" title={title}>{label}</p>
                      <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 truncate">
                        {m.displayValue ?? '—'}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Leyenda de colores */}
          <div className="flex items-center gap-4 text-[11px] text-gray-400">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Bueno</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400" /> Mejorar</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" /> Crítico</span>
          </div>

          {/* Oportunidades + Diagnósticos */}
          {(opportunities.length > 0 || diagnostics.length > 0) && (
            <div className="space-y-4">
              {opportunities.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                    Oportunidades de mejora
                  </p>
                  <div className="space-y-2">
                    {opportunities.map((op, i) => (
                      <div key={i} className="flex items-start justify-between gap-3 p-3 bg-gray-50 dark:bg-gray-700/40 rounded-xl">
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-gray-700 dark:text-gray-300">{op.title}</p>
                          {op.description && (
                            <p className="text-[11px] text-gray-400 mt-0.5 line-clamp-2">{op.description}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {op.savingsMs > 0 && (
                            <span className="text-xs font-semibold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 px-2 py-0.5 rounded-full">
                              ~{op.savingsMs >= 1000 ? `${(op.savingsMs / 1000).toFixed(1)}s` : `${op.savingsMs}ms`}
                            </span>
                          )}
                          <button
                            onClick={() => setTaskModal({ title: op.title })}
                            title="Crear tarea"
                            className="flex-shrink-0 text-xs text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 border border-gray-200 dark:border-gray-600 hover:border-primary-400 rounded-lg px-2 py-0.5 transition-all"
                          >
                            + tarea
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {diagnostics.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                    Diagnósticos
                  </p>
                  <div className="space-y-2">
                    {diagnostics.map((d, i) => (
                      <div key={i} className="flex items-start justify-between gap-3 p-3 bg-gray-50 dark:bg-gray-700/40 rounded-xl">
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-gray-700 dark:text-gray-300">{d.title}</p>
                          {d.description && (
                            <p className="text-[11px] text-gray-400 mt-0.5 line-clamp-2">{d.description}</p>
                          )}
                        </div>
                        <button
                          onClick={() => setTaskModal({ title: d.title })}
                          title="Crear tarea"
                          className="flex-shrink-0 text-xs text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 border border-gray-200 dark:border-gray-600 hover:border-primary-400 rounded-lg px-2 py-0.5 transition-all"
                        >
                          + tarea
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <p className="text-[11px] text-gray-400 text-right">
            Analizado: {new Date(result.createdAt).toLocaleString('es-AR')}
          </p>
        </>
      )}

      {result?.status === 'error' && (
        <p className="text-sm text-red-500">{result.errorMsg || 'Error al analizar'}</p>
      )}

      {!result && !running && (
        <p className="text-xs text-gray-400">
          Hacé click en "Analizar" para obtener el score de performance, métricas Core Web Vitals y oportunidades de mejora de {websiteUrl || 'la URL del proyecto'}.
        </p>
      )}

      {taskModal && (
        <CreateTaskModal
          title={taskModal.title}
          projectId={projectId}
          projectName={projectName}
          onClose={() => setTaskModal(null)}
        />
      )}
    </div>
  )
}
