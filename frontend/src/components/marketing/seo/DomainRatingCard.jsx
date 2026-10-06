import { useState, useEffect } from 'react'
import api from '../../../api/client'
import SetupHintCard from '../../SetupHintCard'
import { Globe } from 'lucide-react'
import { drBand, fmtDateShort } from './seoHelpers'

// Card de Domain Rating con botón de refresh (vista de proyecto)
export default function DomainRatingCard({ projectId }) {
  const [data,       setData]       = useState(null)
  const [loading,    setLoading]    = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error,      setError]      = useState(null)

  useEffect(() => {
    if (!projectId) return
    const ctrl = new AbortController()
    setLoading(true)
    api.get(`/marketing/projects/${projectId}/domain-rating`, { signal: ctrl.signal })
      .then(r => setData(r.data))
      .catch(err => { if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return })
      .finally(() => setLoading(false))
    return () => ctrl.abort()
  }, [projectId])

  async function refresh() {
    setRefreshing(true)
    setError(null)
    try {
      const { data: r } = await api.post(`/marketing/projects/${projectId}/domain-rating/refresh`)
      setData(d => ({ ...d, ...r }))
    } catch (err) {
      setError(err.response?.data?.error ?? 'No se pudo actualizar el Domain Rating.')
    } finally { setRefreshing(false) }
  }

  if (loading) return null

  // Sin URL configurada: no hay Domain Rating posible → invitación a completarla.
  if (data && !data.hasUrl) return (
    <SetupHintCard
      icon={Globe}
      label="Domain Rating no disponible"
      hint="Agregá la URL del sitio para medir el Domain Rating (autoridad del dominio según Ahrefs)."
      to={`/my-projects/${projectId}?infoTab=info`}
      ctaLabel="Agregar URL en Info →"
    />
  )

  const dr   = data?.domainRating
  const band = drBand(dr)

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex flex-col">
            <span className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">Domain Rating</span>
            <div className="flex items-baseline gap-2">
              <span className={`text-3xl font-bold ${band.text}`}>{dr != null ? Math.round(dr) : '—'}</span>
              <span className="text-xs text-gray-400">/100 · {band.label}</span>
            </div>
          </div>
          <div className="hidden sm:block w-32">
            <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-2">
              <div className={`h-2 rounded-full ${band.bg}`} style={{ width: `${dr != null ? Math.min(dr, 100) : 0}%` }} />
            </div>
            <p className="text-[10px] text-gray-400 mt-1">Fuerza del perfil de backlinks (Ahrefs)</p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <button
            onClick={refresh}
            disabled={refreshing || !data?.hasUrl}
            title={!data?.hasUrl ? 'El proyecto no tiene URL configurada' : ''}
            className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {refreshing ? 'Actualizando…' : 'Actualizar DR'}
          </button>
          {data?.domainRatingAt && (
            <span className="text-[10px] text-gray-400">Actualizado {fmtDateShort(data.domainRatingAt)}</span>
          )}
        </div>
      </div>
      {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
    </div>
  )
}
