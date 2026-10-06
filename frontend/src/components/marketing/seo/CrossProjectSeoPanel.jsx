import { useState, useEffect } from 'react'
import api from '../../../api/client'
import { Search } from 'lucide-react'
import { Icon } from '../../ui/Icon'
import { drBand } from './seoHelpers'

// Lista cross-proyecto: todos los sitios ordenados por Domain Rating (vista sin proyecto)
export default function CrossProjectSeoPanel({ onSelectProject }) {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/marketing/summary/seo')
      .then(r => setData(r.data))
      .catch(() => setData([]))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="flex justify-center py-12"><div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" /></div>
  )
  if (!data?.length) return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-10 text-center">
      <div className="mb-3"><Icon as={Search} size={32} className="inline-block text-gray-300 dark:text-gray-600" /></div>
      <p className="text-sm text-gray-500 dark:text-gray-400">No hay sitios web cargados. Agregá la URL del sitio en la tab Info de un proyecto y seleccionalo para ver los datos de Search Console.</p>
    </div>
  )

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">
        Sitios por Domain Rating ({data.length}) <span className="font-normal text-gray-400">· Ahrefs</span>
      </h3>
      <div className="space-y-3">
        {data.map(p => {
          const band = drBand(p.domainRating)
          return (
            <div key={p.projectId} className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <button
                    onClick={() => onSelectProject?.(String(p.projectId))}
                    className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate hover:text-primary-600 dark:hover:text-primary-400 transition-colors text-left"
                  >
                    {p.projectName}
                  </button>
                  <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                    <span className={`text-sm font-bold ${band.text}`}>{p.domainRating != null ? Math.round(p.domainRating) : '—'}</span>
                    <span className="text-xs text-gray-400">/100</span>
                  </div>
                </div>
                <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-1.5">
                  <div className={`h-1.5 rounded-full ${band.bg}`} style={{ width: `${p.domainRating != null ? Math.min(p.domainRating, 100) : 0}%` }} />
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
