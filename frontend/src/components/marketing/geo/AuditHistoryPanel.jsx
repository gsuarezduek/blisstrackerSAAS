import ScoreTimeline from './ScoreTimeline'
import { scoreColor, fmtDate } from './geoHelpers'

// ─── Historial de audits ───────────────────────────────────────────────────────

export default function AuditHistoryPanel({ audits, loadingAudits, onSelectAudit, onDeleteAudit }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">
        Historial de análisis
      </h3>
      <ScoreTimeline audits={audits} />
      {loadingAudits ? (
        <p className="text-sm text-gray-400">Cargando…</p>
      ) : (
        <div className="divide-y divide-gray-100 dark:divide-gray-700">
          {audits.map(a => (
            <div
              key={a.id}
              className="py-3 flex items-center justify-between gap-4 group"
            >
              <div
                className={`flex-1 min-w-0 flex items-center justify-between gap-4 ${
                  a.status === 'completed' ? 'cursor-pointer' : ''
                }`}
                onClick={() => a.status === 'completed' && onSelectAudit(a.id)}
              >
                <div className="min-w-0">
                  <p className="text-sm text-gray-700 dark:text-gray-300 truncate">{a.url}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{fmtDate(a.createdAt)}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {a.status === 'completed' && a.score != null && (
                    <span className={`text-sm font-bold ${scoreColor(a.score)}`}>{a.score}/100</span>
                  )}
                  <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${
                    a.status === 'completed' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' :
                    a.status === 'running'   ? 'bg-blue-100  dark:bg-blue-900/30  text-blue-700  dark:text-blue-400'  :
                    a.status === 'failed'    ? 'bg-red-100   dark:bg-red-900/30   text-red-700   dark:text-red-400'   :
                                               'bg-gray-100  dark:bg-gray-700     text-gray-500  dark:text-gray-400'
                  }`}>
                    {a.status === 'completed' ? 'completado' : a.status === 'running' ? 'analizando…' : a.status === 'failed' ? 'falló' : 'pendiente'}
                  </span>
                </div>
              </div>
              <button
                onClick={e => { e.stopPropagation(); onDeleteAudit({ id: a.id, score: a.score, date: a.createdAt }) }}
                disabled={a.status === 'running'}
                title="Eliminar análisis"
                className="flex-shrink-0 text-gray-200 dark:text-gray-700 hover:text-red-500 dark:hover:text-red-400 transition-colors text-xl leading-none disabled:opacity-30 disabled:cursor-not-allowed opacity-0 group-hover:opacity-100"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
