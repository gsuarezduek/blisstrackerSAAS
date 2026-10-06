import { useState, useEffect } from 'react'
import api from '../../../api/client'
import { Bot } from 'lucide-react'
import { Icon } from '../../ui/Icon'

// ─── Benchmark cross-proyecto ─────────────────────────────────────────────────

export default function CrossProjectPanel({ onSelectProject }) {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/marketing/geo/audits?summary=true')
      .then(r => setData(r.data))
      .catch(() => setData([]))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="flex justify-center py-12"><div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" /></div>
  )
  if (!data?.length) return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-10 text-center">
      <div className="mb-3"><Icon as={Bot} size={32} className="inline-block text-gray-300 dark:text-gray-600" /></div>
      <p className="text-sm text-gray-500 dark:text-gray-400">Todavía no hay auditorías GEO completadas. Seleccioná un proyecto para empezar.</p>
    </div>
  )

  const BAND_COLORS = {
    Excelente: 'bg-emerald-500',
    Bueno:     'bg-green-500',
    Base:      'bg-amber-400',
    Crítico:   'bg-red-500',
  }
  const BAND_TEXT = {
    Excelente: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20',
    Bueno:     'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20',
    Base:      'text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20',
    Crítico:   'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20',
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">
        Salud GEO por proyecto ({data.length})
      </h3>
      <div className="space-y-3">
        {data.sort((a, b) => b.score - a.score).map(p => (
          <div key={p.projectId} className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <button
                  onClick={() => onSelectProject?.(String(p.projectId))}
                  className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate hover:text-primary-600 dark:hover:text-primary-400 transition-colors text-left"
                  title="Ver último análisis"
                >{p.projectName}</button>
                <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                  <span className="text-sm font-bold text-gray-900 dark:text-white">{p.score}/100</span>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${BAND_TEXT[p.band] ?? ''}`}>{p.band}</span>
                </div>
              </div>
              <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-1.5">
                <div className={`h-1.5 rounded-full ${BAND_COLORS[p.band] ?? 'bg-gray-400'}`} style={{ width: `${p.score}%` }} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
