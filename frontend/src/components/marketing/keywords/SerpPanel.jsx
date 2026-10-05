import { useState, useEffect } from 'react'
import api from '../../../api/client'
import { SerpFeatureBadge } from './KeywordsUI'

// ─── SerpPanel ────────────────────────────────────────────────────────────────

export default function SerpPanel({ projectId, kwId, onAddKeyword }) {
  const [snapshot,  setSnapshot]  = useState(null)
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [waitMins,  setWaitMins]  = useState(null)

  useEffect(() => {
    setLoading(true)
    setError('')
    api.get(`/marketing/projects/${projectId}/keywords/${kwId}/serp`)
      .then(r => setSnapshot(r.data.snapshot))
      .catch(err => setError(err.response?.data?.error ?? 'Error al cargar datos SERP'))
      .finally(() => setLoading(false))
  }, [projectId, kwId])

  async function handleRefresh() {
    setRefreshing(true)
    setError('')
    setWaitMins(null)
    try {
      const r = await api.post(`/marketing/projects/${projectId}/keywords/${kwId}/serp/refresh`)
      setSnapshot(r.data.snapshot)
    } catch (err) {
      const data = err.response?.data
      if (err.response?.status === 429) {
        setWaitMins(data?.waitMins ?? 15)
      } else {
        setError(data?.error ?? 'Error al actualizar')
      }
    } finally {
      setRefreshing(false)
    }
  }

  if (loading) return (
    <div className="flex items-center gap-2 text-sm text-gray-400 py-3">
      <div className="w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
      Consultando SerpAPI…
    </div>
  )

  if (error) return (
    <div className="text-sm text-red-500 dark:text-red-400 py-2">{error}</div>
  )

  if (!snapshot) return null

  const capturedDate = new Date(snapshot.capturedAt).toLocaleString('es-AR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })

  return (
    <div className="space-y-4">
      {/* Posición + URL */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 dark:text-gray-400">Posición SERP:</span>
          {snapshot.position != null
            ? <span className={`text-2xl font-bold tabular-nums ${snapshot.position <= 3 ? 'text-green-600 dark:text-green-400' : snapshot.position <= 10 ? 'text-blue-600 dark:text-blue-400' : 'text-gray-700 dark:text-gray-300'}`}>
                #{snapshot.position}
              </span>
            : <span className="text-sm text-gray-400 italic">No aparece en top 100</span>
          }
        </div>
        {snapshot.resultUrl && (
          <a
            href={snapshot.resultUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary-600 dark:text-primary-400 hover:underline truncate max-w-xs"
          >
            {snapshot.resultUrl}
          </a>
        )}
      </div>

      {/* Features SERP */}
      {snapshot.serpFeatures?.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Features en este SERP</p>
          <div className="flex flex-wrap gap-1.5">
            {snapshot.serpFeatures.map(f => <SerpFeatureBadge key={f} feature={f} />)}
          </div>
        </div>
      )}

      {/* Competidores */}
      {snapshot.competitors?.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Competidores orgánicos (top 10)</p>
          <div className="rounded-lg border border-gray-100 dark:border-gray-700 overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 dark:bg-gray-700/50">
                <tr>
                  <th className="px-3 py-2 text-left text-gray-500 dark:text-gray-400 font-medium w-10">#</th>
                  <th className="px-3 py-2 text-left text-gray-500 dark:text-gray-400 font-medium">Dominio</th>
                  <th className="px-3 py-2 text-left text-gray-500 dark:text-gray-400 font-medium hidden sm:table-cell">Título</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.competitors.map((c, i) => (
                  <tr key={i} className="border-t border-gray-100 dark:border-gray-700/50">
                    <td className="px-3 py-2 text-gray-500 dark:text-gray-400 tabular-nums">{c.position}</td>
                    <td className="px-3 py-2">
                      <a href={c.url} target="_blank" rel="noopener noreferrer"
                        className="text-primary-600 dark:text-primary-400 hover:underline font-medium">
                        {c.domain}
                      </a>
                    </td>
                    <td className="px-3 py-2 text-gray-600 dark:text-gray-400 hidden sm:table-cell truncate max-w-[240px]">
                      {c.title}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* People Also Ask */}
      {snapshot.peopleAlsoAsk?.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">People Also Ask</p>
          <ul className="space-y-1">
            {snapshot.peopleAlsoAsk.map((q, i) => (
              <li key={i} className="flex items-center justify-between gap-2 py-1 border-b border-gray-100 dark:border-gray-700/50 last:border-0">
                <span className="text-xs text-gray-700 dark:text-gray-300">{q}</span>
                <button
                  onClick={() => onAddKeyword(q)}
                  className="shrink-0 text-xs px-2 py-0.5 rounded-lg bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400 hover:bg-primary-100 dark:hover:bg-primary-900/40 transition-colors"
                >
                  + Rastrear
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Related Searches */}
      {snapshot.relatedSearches?.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Búsquedas relacionadas</p>
          <div className="flex flex-wrap gap-2">
            {snapshot.relatedSearches.map((q, i) => (
              <button
                key={i}
                onClick={() => onAddKeyword(q)}
                className="text-xs px-2.5 py-1 rounded-xl border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 hover:border-primary-300 hover:text-primary-600 transition-colors"
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Footer: timestamp + actualizar */}
      <div className="flex items-center justify-between pt-1 border-t border-gray-100 dark:border-gray-700/50">
        <span className="text-xs text-gray-400">Datos capturados: {capturedDate}</span>
        <div className="flex items-center gap-2">
          {waitMins && (
            <span className="text-xs text-orange-500">Disponible en {waitMins} min</span>
          )}
          <button
            onClick={handleRefresh}
            disabled={refreshing || !!waitMins}
            className="text-xs px-3 py-1 rounded-lg border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors"
          >
            {refreshing ? 'Actualizando…' : 'Actualizar'}
          </button>
        </div>
      </div>
    </div>
  )
}
