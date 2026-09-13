import { useState, useEffect, useRef } from 'react'
import api from '../../api/client'
import { avatarUrl } from '../../utils/avatarUrl'
import LoadingSpinner from '../LoadingSpinner'

const DEBOUNCE_MS = 300

function dateLabel(iso) {
  return new Date(iso).toLocaleString('es-AR', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    timeZone: 'America/Argentina/Buenos_Aires',
  })
}

// Buscador de mensajes dentro de un canal. v1 muestra el resultado tal cual acá mismo
// (autor/fecha/contenido) — no "salta" al mensaje dentro del hilo completo, eso
// requeriría poder cargar mensajes alrededor de uno puntual (pieza más grande, fuera
// de alcance por ahora).
export default function ChannelSearch({ channelId, onClose }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const debounceRef = useRef(null)
  const requestIdRef = useRef(0)

  useEffect(() => {
    clearTimeout(debounceRef.current)
    const q = query.trim()
    if (q.length < 2) {
      setResults([])
      setSearched(false)
      setLoading(false)
      return
    }
    setLoading(true)
    debounceRef.current = setTimeout(() => {
      const requestId = ++requestIdRef.current
      api.get(`/chat/channels/${channelId}/search`, { params: { q } })
        .then(r => {
          if (requestIdRef.current !== requestId) return
          setResults(r.data.messages)
          setSearched(true)
        })
        .catch(() => { if (requestIdRef.current === requestId) setResults([]) })
        .finally(() => { if (requestIdRef.current === requestId) setLoading(false) })
    }, DEBOUNCE_MS)
    return () => clearTimeout(debounceRef.current)
  }, [query, channelId])

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="px-4 py-2.5 border-b border-gray-100 dark:border-gray-700 flex-shrink-0 flex items-center gap-2">
        <button
          onClick={onClose}
          title="Volver al chat"
          className="p-1.5 text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 flex-shrink-0"
        >
          ←
        </button>
        <input
          autoFocus
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Buscar en este canal..."
          className="flex-1 text-sm px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-gray-200 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-400"
        />
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-2">
        {loading && <LoadingSpinner size="sm" className="py-6" />}
        {!loading && searched && results.length === 0 && (
          <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-6">Sin resultados para "{query.trim()}"</p>
        )}
        {!loading && !searched && (
          <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-6">Escribí al menos 2 caracteres para buscar</p>
        )}
        {!loading && results.map(m => (
          <div key={m.id} className="px-2 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/60">
            <div className="flex items-center gap-2 mb-0.5">
              {m.author ? (
                <img src={avatarUrl(m.author.avatar)} alt={m.author.name} className="w-5 h-5 rounded-full object-cover border border-gray-200 dark:border-gray-600" />
              ) : (
                <span className="w-5 h-5 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-[10px]">⚙️</span>
              )}
              <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">{m.author?.name || 'Sistema'}</span>
              <span className="text-[11px] text-gray-400 dark:text-gray-500">{dateLabel(m.createdAt)}</span>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-300 leading-snug pl-7 line-clamp-2">
              {m.content || (m.gifUrl ? '🖼️ GIF' : '')}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}
