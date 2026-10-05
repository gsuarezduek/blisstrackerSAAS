import { GeoBadge } from './KeywordsUI'

// ─── Panel de análisis IA ─────────────────────────────────────────────────────

export default function AnalysisPanel({ analysis, loading, onGenerate, updatedAt }) {
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
