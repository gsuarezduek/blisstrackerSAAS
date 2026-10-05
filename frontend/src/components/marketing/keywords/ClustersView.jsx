import { FolderOpen } from 'lucide-react'
import { Icon } from '../../ui/Icon'
import KeywordRow from './KeywordRow'

// ─── Vista de clusters ────────────────────────────────────────────────────────

export default function ClustersView({ keywords, projectId, expanded, onToggle, onRemove }) {
  const withAnalysis = keywords.filter(kw => kw.hasAnalysis)

  if (withAnalysis.length < 2) {
    return (
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-8 text-center">
        <div className="mb-3"><Icon as={FolderOpen} size={28} className="inline-block text-gray-300 dark:text-gray-600" /></div>
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
