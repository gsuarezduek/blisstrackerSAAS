import { Sparkline, DeltaBadge } from './SeoIndicators'
import { fmtNum } from './seoHelpers'

// ─── Keywords con sparklines (siempre visibles) ───────────────────────────────
export default function KeywordsSparklineTable({ kwHistory }) {
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Keywords trackeadas</h3>
        <p className="text-xs text-gray-400 mt-0.5">
          Posición mensual — últimos {kwHistory.months?.length ?? 6} meses
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 dark:border-gray-700">
              <th className="px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400 text-left">Keyword</th>
              <th className="px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400 text-right">Posición actual</th>
              <th className="px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400 text-right">vs mes ant.</th>
              <th className="px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400 text-right">Tendencia</th>
              <th className="px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400 text-right">Clicks</th>
            </tr>
          </thead>
          <tbody>
            {kwHistory.keywords.map(kw => {
              const last  = kw.history[kw.history.length - 1]
              const prev  = kw.history[kw.history.length - 2]
              const delta = last?.position != null && prev?.position != null
                ? parseFloat((prev.position - last.position).toFixed(2))
                : null
              return (
                <tr key={kw.id} className="border-b border-gray-50 dark:border-gray-700/50 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                  <td className="px-4 py-3 text-gray-700 dark:text-gray-300 max-w-[180px] truncate font-medium">{kw.query}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-700 dark:text-gray-300">
                    {last?.position != null ? parseFloat(last.position).toFixed(1) : '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {delta != null
                      ? <DeltaBadge delta={-delta} />
                      : <span className="text-xs text-gray-300 dark:text-gray-600">—</span>
                    }
                  </td>
                  <td className="px-4 py-3 text-right"><Sparkline history={kw.history} /></td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-500">{fmtNum(last?.clicks ?? 0)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
