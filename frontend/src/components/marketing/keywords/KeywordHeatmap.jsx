import { useState, useEffect } from 'react'
import api from '../../../api/client'
import { heatmapColor } from './keywordsHelpers'

// ─── Heatmap de keywords ──────────────────────────────────────────────────────

export default function KeywordHeatmap({ projectId }) {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!projectId) return
    setLoading(true)
    api.get(`/marketing/projects/${projectId}/keywords/heatmap`)
      .then(r => setData(r.data.keywords))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [projectId])

  if (loading) return (
    <div className="flex justify-center py-12"><div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" /></div>
  )
  if (!data?.length) return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-8 text-center text-sm text-gray-400">
      Sin datos de keywords para mostrar el heatmap.
    </div>
  )

  // Obtener todos los meses únicos y tomar los últimos 6
  const allMonths = [...new Set(data.flatMap(kw => kw.rankings.map(r => r.month)))].sort().slice(-6)

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Heatmap de posiciones</h3>
          <p className="text-xs text-gray-400 mt-0.5">Últimos {allMonths.length} meses</p>
        </div>
        <div className="flex items-center gap-2 text-[10px]">
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-green-500" /> 1-3</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-blue-500" /> 4-10</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-yellow-400" /> 11-20</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-red-400" /> 21+</span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-100 dark:border-gray-700">
              <th className="px-4 py-2 text-left text-gray-500 dark:text-gray-400 font-medium min-w-[160px]">Keyword</th>
              {allMonths.map(m => (
                <th key={m} className="px-2 py-2 text-center text-gray-400 font-medium min-w-[60px]">
                  {m.slice(5)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map(kw => {
              const rankMap = {}
              kw.rankings.forEach(r => { rankMap[r.month] = r.position })
              return (
                <tr key={kw.id} className="border-b border-gray-50 dark:border-gray-700/50 last:border-0">
                  <td className="px-4 py-2 text-gray-700 dark:text-gray-300 max-w-[160px] truncate font-medium">
                    {kw.query}
                  </td>
                  {allMonths.map(m => {
                    const pos = rankMap[m]
                    return (
                      <td key={m} className="px-2 py-2 text-center">
                        <span
                          title={pos != null && pos > 0 ? `Pos. ${pos.toFixed(1)}` : 'Sin dato'}
                          className={`inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded min-w-[36px] ${heatmapColor(pos)}`}
                        >
                          {pos != null && pos > 0 ? pos.toFixed(1) : '—'}
                        </span>
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
