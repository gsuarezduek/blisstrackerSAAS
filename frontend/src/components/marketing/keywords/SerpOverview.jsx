import { useState, useEffect } from 'react'
import api from '../../../api/client'
import { SerpFeatureBadge } from './KeywordsUI'

// ─── Vista: SERP Overview ─────────────────────────────────────────────────────

export default function SerpOverview({ projectId, keywords, onAddKeyword }) {
  const [snapshots, setSnapshots] = useState({})
  const [loading,   setLoading]   = useState(false)

  useEffect(() => {
    if (!projectId) return
    setLoading(true)
    api.get(`/marketing/projects/${projectId}/keywords/serp-batch`)
      .then(r => setSnapshots(r.data.snapshots ?? {}))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [projectId])

  if (loading) return (
    <div className="flex justify-center py-12">
      <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  const sorted = [...keywords].sort((a, b) => {
    const pa = snapshots[a.id]?.position ?? 999
    const pb = snapshots[b.id]?.position ?? 999
    return pa - pb
  })

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">SERP Live — Resumen</h3>
        <p className="text-xs text-gray-400 mt-0.5">Snapshots de los últimos 7 días · Actualización automática cada lunes</p>
      </div>
      <table className="w-full">
        <thead>
          <tr className="border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/30">
            <th className="px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400 text-left">Keyword</th>
            <th className="px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400 text-center">Pos. SERP</th>
            <th className="px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400 text-left">Features</th>
            <th className="px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400 text-right">Actualizado</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map(kw => {
            const snap = snapshots[kw.id]
            return (
              <tr key={kw.id} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/20">
                <td className="px-4 py-2.5 text-sm text-gray-800 dark:text-gray-200 font-medium">
                  {kw.query}
                </td>
                <td className="px-4 py-2.5 text-center">
                  {snap
                    ? snap.position != null
                      ? <span className={`text-sm font-bold tabular-nums ${snap.position <= 3 ? 'text-green-600 dark:text-green-400' : snap.position <= 10 ? 'text-blue-600 dark:text-blue-400' : 'text-gray-600 dark:text-gray-400'}`}>
                          #{snap.position}
                        </span>
                      : <span className="text-xs text-gray-400 italic">no aparece</span>
                    : <span className="text-xs text-gray-300 dark:text-gray-600">—</span>
                  }
                </td>
                <td className="px-4 py-2.5">
                  {snap?.serpFeatures?.length > 0
                    ? <div className="flex flex-wrap gap-1">
                        {snap.serpFeatures.slice(0, 3).map(f => <SerpFeatureBadge key={f} feature={f} />)}
                        {snap.serpFeatures.length > 3 && (
                          <span className="text-xs text-gray-400">+{snap.serpFeatures.length - 3}</span>
                        )}
                      </div>
                    : snap
                      ? <span className="text-xs text-gray-400">—</span>
                      : <span className="text-xs text-gray-300 dark:text-gray-600">Sin datos</span>
                  }
                </td>
                <td className="px-4 py-2.5 text-right text-xs text-gray-400">
                  {snap
                    ? new Date(snap.capturedAt).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })
                    : '—'
                  }
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {keywords.length === 0 && (
        <div className="px-4 py-8 text-center text-sm text-gray-400">
          No hay keywords rastreadas aún.
        </div>
      )}
    </div>
  )
}
