import AiTrafficSection from './AiTrafficSection'
import ComponentCard from './ComponentCard'
import { COMPONENTS_META, SEVERITY_LABELS, SEVERITY_COLORS, scoreRing, scoreColor, scoreLabel, fmtDate } from './geoHelpers'
import { STATUS_LABEL, STATUS_CLASS } from '../../../utils/taskStatus'

function openTask(task) {
  window.dispatchEvent(new CustomEvent('bliss:open-task', { detail: task }))
}

// ─── Resultados de la auditoría GEO completada ────────────────────────────────
// Los botones de Generar llms.txt / JSON-LD / Imprimir viven en la barra de
// "Analizar" de GeoTab.jsx (misma fila, para aprovechar el espacio) — acá solo
// queda el score y el contenido del análisis.

export default function GeoAuditResults({
  activeAudit, sortedFindings, negativeSignals, projectId, onCreateTask,
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
              {activeAudit.pagesCrawled ? ` · ${activeAudit.pagesCrawled} página${activeAudit.pagesCrawled === 1 ? '' : 's'} analizada${activeAudit.pagesCrawled === 1 ? '' : 's'}` : ''}
              {activeAudit.tokensUsed ? ` · ${activeAudit.tokensUsed.toLocaleString()} tokens` : ''}
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Este puntaje refleja qué tan bien está optimizado tu sitio para aparecer en respuestas de motores de búsqueda con IA como ChatGPT, Perplexity y Claude.
            </p>
          </div>
        </div>
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
                {f.taskId ? (
                  <button
                    onClick={() => openTask(f.task)}
                    title="Ver la tarea creada para este ítem"
                    className={`flex-shrink-0 text-xs font-medium rounded-lg px-2 py-0.5 transition-all hover:opacity-80 ${STATUS_CLASS[f.task?.status] ?? STATUS_CLASS.PENDING}`}
                  >
                    {STATUS_LABEL[f.task?.status] ?? 'Ver tarea'}
                  </button>
                ) : (
                  <button
                    onClick={() => onCreateTask({ title: f.action || f.title, auditId: activeAudit.id, itemIndex: f.itemIndex })}
                    title="Crear tarea a partir de este ítem"
                    className="flex-shrink-0 text-xs text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 border border-gray-200 dark:border-gray-600 hover:border-primary-400 rounded-lg px-2 py-0.5 transition-all"
                  >
                    + tarea
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  )
}
