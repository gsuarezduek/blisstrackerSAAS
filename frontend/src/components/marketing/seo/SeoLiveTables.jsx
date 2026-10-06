import QueryRow from './QueryRow'
import { fmtNum, fmtPos, fmtPct } from './seoHelpers'

// ─── Top consultas ──────────────────────────────────────────────────────────────
export function TopQueriesTable({ topQueries, topQueriesComparison, startDate, endDate, projectId }) {
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Top consultas</h3>
        <span className="text-[10px] text-gray-400">Click en una fila para ver páginas</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 dark:border-gray-700">
              {['Consulta', 'Clicks', 'Impres.', 'Posición', 'CTR'].map((h, i) => (
                <th key={h} className={`px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400 ${i > 0 ? 'text-right' : 'text-left'}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {topQueries.map((row, i) => (
              <QueryRow key={i} row={row} comparison={topQueriesComparison}
                startDate={startDate} endDate={endDate} projectId={projectId} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Oportunidades de CTR ───────────────────────────────────────────────────────
export function OpportunityPagesTable({ opportunityPages, onCreateTask }) {
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Oportunidades de CTR</h3>
        <p className="text-xs text-gray-400 mt-0.5">Páginas con muchas impresiones y CTR bajo (&lt;5%)</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 dark:border-gray-700">
              {['Página', 'Impresiones', 'CTR actual', 'Posición', ''].map((h, i) => (
                <th key={i} className={`px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400 ${i === 0 ? 'text-left' : 'text-right'}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {opportunityPages.map((row, i) => (
              <tr key={i} className="border-b border-gray-50 dark:border-gray-700/50 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                <td className="px-4 py-2.5 font-mono text-xs text-gray-700 dark:text-gray-300 max-w-[200px] truncate">{row.page}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-gray-700 dark:text-gray-300">{fmtNum(row.impressions)}</td>
                <td className={`px-4 py-2.5 text-right tabular-nums font-semibold ${row.ctr < 0.03 ? 'text-red-500' : 'text-orange-500'}`}>{fmtPct(row.ctr)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-gray-500">{fmtPos(row.position)}</td>
                <td className="px-4 py-2.5 text-right">
                  <button onClick={() => onCreateTask({ title: `Mejorar title/meta de ${row.page}` })}
                    className="text-xs text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 border border-gray-200 dark:border-gray-600 hover:border-primary-400 rounded-lg px-2 py-0.5 transition-all">
                    + tarea
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Top páginas ─────────────────────────────────────────────────────────────────
export function TopPagesTable({ topPages }) {
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Top páginas</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 dark:border-gray-700">
              {['Página', 'Clicks', 'Impres.', 'CTR', 'Posición'].map((h, i) => (
                <th key={h} className={`px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400 ${i === 0 ? 'text-left' : 'text-right'}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {topPages.map((row, i) => (
              <tr key={i} className="border-b border-gray-50 dark:border-gray-700/50 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                <td className="px-4 py-2.5 font-mono text-xs text-gray-700 dark:text-gray-300 max-w-[220px] truncate">{row.page}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-gray-700 dark:text-gray-300">{fmtNum(row.clicks)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-gray-700 dark:text-gray-300">{fmtNum(row.impressions)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-gray-700 dark:text-gray-300">{fmtPct(row.ctr)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-gray-700 dark:text-gray-300">{fmtPos(row.position)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Top países ───────────────────────────────────────────────────────────────
export function TopCountriesTable({ countries }) {
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Top países</h3>
      </div>
      <table className="w-full text-sm">
        <tbody>
          {countries.map((row, i) => (
            <tr key={i} className="border-b border-gray-50 dark:border-gray-700/50 last:border-0">
              <td className="px-4 py-2.5 text-gray-700 dark:text-gray-300 uppercase text-xs font-medium">{row.country}</td>
              <td className="px-4 py-2.5 text-right tabular-nums text-gray-600 dark:text-gray-400">{fmtNum(row.clicks)} clicks</td>
              <td className="px-4 py-2.5 text-right tabular-nums text-gray-400">{fmtNum(row.impressions)} impres.</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
