import AiTrafficSection from './AiTrafficSection'
import ComponentCard from './ComponentCard'
import { printGeoAudit } from './printGeoAudit'
import { COMPONENTS_META, SEVERITY_LABELS, SEVERITY_COLORS, scoreRing, scoreColor, scoreLabel, fmtDate } from './geoHelpers'

// ─── Resultados de la auditoría GEO completada ────────────────────────────────

export default function GeoAuditResults({
  activeAudit, sortedFindings, negativeSignals, selectedProject, projectId,
  hasLlmsFinding, schemaScoreLow, onGenerateLlmsTxt, onGenerateSchema, onCreateTask,
}) {
  return (
    <>
      {/* Score global */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex flex-col sm:flex-row items-center gap-6">
          {/* Gauge */}
          <div className={`w-32 h-32 rounded-full border-8 ${scoreRing(activeAudit.score)} flex flex-col items-center justify-center flex-shrink-0`}>
            <span className={`text-4xl font-bold ${scoreColor(activeAudit.score)}`}>
              {activeAudit.score ?? '—'}
            </span>
            <span className="text-xs text-gray-400">/100</span>
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
              Score GEO: <span className={scoreColor(activeAudit.score)}>{scoreLabel(activeAudit.score)}</span>
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Analizado el {fmtDate(activeAudit.createdAt)}
              {activeAudit.tokensUsed ? ` · ${activeAudit.tokensUsed.toLocaleString()} tokens` : ''}
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Este puntaje refleja qué tan bien está optimizado tu sitio para aparecer en respuestas de motores de búsqueda con IA como ChatGPT, Perplexity y Claude.
            </p>
          </div>
        </div>
      </div>

      {/* Herramientas de generación + impresión */}
      <div className="flex flex-wrap gap-2">
        {hasLlmsFinding && (
          <button onClick={onGenerateLlmsTxt}
            className="px-3 py-1.5 text-xs font-medium bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-700 rounded-xl hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors">
            Generar llms.txt
          </button>
        )}
        {schemaScoreLow && (
          <button onClick={onGenerateSchema}
            className="px-3 py-1.5 text-xs font-medium bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 border border-purple-200 dark:border-purple-700 rounded-xl hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-colors">
            Generar JSON-LD
          </button>
        )}
        <button
          onClick={() => printGeoAudit(activeAudit, sortedFindings, negativeSignals, selectedProject?.name ?? activeAudit.url)}
          title="Imprimir / Exportar PDF"
          className="px-3 py-1.5 text-xs font-medium bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-600 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors flex items-center gap-1.5"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
            <path fillRule="evenodd" d="M5 2.75C5 1.784 5.784 1 6.75 1h6.5c.966 0 1.75.784 1.75 1.75v3.552c.377.046.752.097 1.126.153A2.212 2.212 0 0 1 18 8.653v4.097A2.25 2.25 0 0 1 15.75 15h-.241l.305 1.984A1.75 1.75 0 0 1 14.084 19H5.915a1.75 1.75 0 0 1-1.73-2.016L4.49 15H4.25A2.25 2.25 0 0 1 2 12.75V8.653c0-1.082.775-2.034 1.874-2.198.374-.056.749-.107 1.126-.153V2.75Zm4.5 13.5h1l-.307-2H9.807l-.307 2Zm1.997 0h.258l.527-3.44A.75.75 0 0 0 11.54 12H8.46a.75.75 0 0 0-.743.81L8.244 16.25h.258Zm-5.99-10.337c.966-.099 1.94-.17 2.923-.213L8.25 5.25a.75.75 0 0 1 .75.75v.313l.5-.063L10 5.25a.75.75 0 0 1 .75.75v.25l.5.063V6a.75.75 0 0 1 .75-.75h.5a.75.75 0 0 1 .75.75v.245c.984.043 1.96.114 2.925.213A.75.75 0 0 0 16.5 5.5v-2.75a.25.25 0 0 0-.25-.25h-6.5a.25.25 0 0 0-.25.25V5.5a.75.75 0 0 0-.743.663Z" clipRule="evenodd" />
          </svg>
          Imprimir
        </button>
      </div>

      {/* Tráfico desde IAs */}
      <AiTrafficSection projectId={projectId} />

      {/* 6 componentes */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Componentes</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {COMPONENTS_META.map(meta => (
            <ComponentCard key={meta.key} meta={meta} score={activeAudit[meta.key]} />
          ))}
        </div>
      </div>

      {/* Señales negativas */}
      {negativeSignals.length > 0 && (
        <div className="bg-red-50 dark:bg-red-900/10 rounded-2xl border border-red-200 dark:border-red-800/50 p-5">
          <h3 className="text-sm font-semibold text-red-700 dark:text-red-400 mb-3 flex items-center gap-2">
            Señales negativas ({negativeSignals.length})
            <span className="text-xs font-normal text-red-500 dark:text-red-500">— reducen la citabilidad en IA</span>
          </h3>
          <div className="space-y-3">
            {negativeSignals.map((s, i) => (
              <div key={i}>
                <p className="text-sm font-medium text-red-800 dark:text-red-300">{s.title}</p>
                {s.description && (
                  <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">{s.description}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Items unificados */}
      {sortedFindings.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">
            Análisis detallado ({sortedFindings.length})
          </h3>
          <div className="space-y-4">
            {sortedFindings.map((f, i) => (
              <div key={i} className="flex gap-3 items-start">
                <span className={`mt-0.5 px-2 py-0.5 text-xs font-medium rounded-full flex-shrink-0 ${SEVERITY_COLORS[f.severity] ?? SEVERITY_COLORS.low}`}>
                  {SEVERITY_LABELS[f.severity] ?? f.severity}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{f.title}</p>
                  {f.description && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{f.description}</p>
                  )}
                  {f.action && (
                    <div className="mt-2 flex items-start gap-1.5">
                      <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium flex-shrink-0">→</span>
                      <p className="text-xs text-emerald-700 dark:text-emerald-300">{f.action}</p>
                    </div>
                  )}
                  {f.impact && (
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 italic">{f.impact}</p>
                  )}
                </div>
                <button
                  onClick={() => onCreateTask({ title: f.action || f.title })}
                  title="Crear tarea a partir de este ítem"
                  className="flex-shrink-0 text-xs text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 border border-gray-200 dark:border-gray-600 hover:border-primary-400 rounded-lg px-2 py-0.5 transition-all"
                >
                  + tarea
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  )
}
