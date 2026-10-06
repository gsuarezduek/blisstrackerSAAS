import { useState } from 'react'
import api from '../../../api/client'
import { fmtNum, fmtPos, fmtPct } from './seoHelpers'

// ─── Fila de query expandible ─────────────────────────────────────────────────
export default function QueryRow({ row, comparison, startDate, endDate, projectId }) {
  const [expanded, setExpanded] = useState(false)
  const [pages,    setPages]    = useState(null)
  const [loading,  setLoading]  = useState(false)

  async function toggle() {
    if (!expanded && pages === null) {
      setLoading(true)
      try {
        const { data } = await api.get(
          `/marketing/projects/${projectId}/search-console/query-pages`,
          { params: { query: row.query, startDate, endDate } }
        )
        setPages(data.pages)
      } catch { setPages([]) }
      finally { setLoading(false) }
    }
    setExpanded(e => !e)
  }

  const comp    = comparison?.find(c => c.query === row.query)
  const hasDrop = comp?.positionDelta != null && comp.positionDelta > 3
  const hasGain = comp?.positionDelta != null && comp.positionDelta < -3

  return (
    <>
      <tr onClick={toggle}
        className="border-b border-gray-50 dark:border-gray-700/50 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors cursor-pointer">
        <td className="px-4 py-2.5 text-gray-700 dark:text-gray-300 max-w-[200px] truncate">
          <span className="flex items-center gap-1.5">
            <span className="text-gray-400 text-[10px]">{expanded ? '▼' : '▶'}</span>
            {row.query}
          </span>
        </td>
        <td className="px-4 py-2.5 text-right tabular-nums text-sm text-gray-700 dark:text-gray-300">{fmtNum(row.clicks)}</td>
        <td className="px-4 py-2.5 text-right tabular-nums text-sm text-gray-700 dark:text-gray-300">{fmtNum(row.impressions)}</td>
        <td className="px-4 py-2.5 text-right tabular-nums text-sm text-gray-700 dark:text-gray-300">
          {fmtPos(row.position)}
          {hasDrop && <span className="ml-1.5 text-[10px] font-semibold text-red-500 bg-red-50 dark:bg-red-900/30 px-1.5 py-0.5 rounded-full">↓ {comp.positionDelta.toFixed(1)}</span>}
          {hasGain && <span className="ml-1.5 text-[10px] font-semibold text-green-600 bg-green-50 dark:bg-green-900/30 px-1.5 py-0.5 rounded-full">↑ {Math.abs(comp.positionDelta).toFixed(1)}</span>}
        </td>
        <td className="px-4 py-2.5 text-right tabular-nums text-sm text-gray-700 dark:text-gray-300">{fmtPct(row.ctr)}</td>
      </tr>
      {expanded && (
        <tr className="border-b border-gray-50 dark:border-gray-700/50 bg-gray-50/50 dark:bg-gray-700/20">
          <td colSpan={5} className="px-6 py-3">
            {loading
              ? <div className="flex items-center gap-2 text-xs text-gray-400"><div className="w-3 h-3 border-2 border-primary-400 border-t-transparent rounded-full animate-spin" />Cargando páginas…</div>
              : pages?.length > 0
              ? (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-gray-400">
                      <th className="text-left pb-1 font-medium">Página</th>
                      <th className="text-right pb-1 font-medium w-16">Clicks</th>
                      <th className="text-right pb-1 font-medium w-16">Pos.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pages.map((p, i) => (
                      <tr key={i}>
                        <td className="pr-4 py-1 text-primary-600 dark:text-primary-400 font-mono truncate max-w-[280px]">{p.page}</td>
                        <td className="py-1 text-right tabular-nums text-gray-600 dark:text-gray-400">{fmtNum(p.clicks)}</td>
                        <td className="py-1 text-right tabular-nums text-gray-600 dark:text-gray-400">{fmtPos(p.position)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
              : <p className="text-xs text-gray-400">Sin datos de páginas para esta query.</p>
            }
          </td>
        </tr>
      )}
    </>
  )
}
