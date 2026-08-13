import { useState, useEffect, useRef } from 'react'
import api from '../../api/client'
import LoadingSpinner from '../LoadingSpinner'

// Selector de GIFs (Giphy) — se abre desde el menú "+" del input del chat.
export default function GifPicker({ onSelect, onClose }) {
  const [query, setQuery] = useState('')
  const [gifs, setGifs] = useState([])
  const [loading, setLoading] = useState(true)
  const [notConfigured, setNotConfigured] = useState(false)
  const debounceRef = useRef(null)
  const ref = useRef(null)

  function loadGifs(q) {
    setLoading(true)
    setNotConfigured(false)
    const endpoint = q.trim() ? `/chat/gifs/search?q=${encodeURIComponent(q.trim())}` : '/chat/gifs/trending'
    api.get(endpoint)
      .then(r => setGifs(r.data.gifs || []))
      .catch(err => {
        if (err.response?.data?.code === 'GIFS_NOT_CONFIGURED') setNotConfigured(true)
        setGifs([])
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => { loadGifs('') }, [])

  useEffect(() => {
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => loadGifs(query), 350)
    return () => clearTimeout(debounceRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])

  useEffect(() => {
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose()
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onClose])

  return (
    <div
      ref={ref}
      className="absolute bottom-full mb-2 left-0 w-80 max-w-[90vw] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl shadow-lg z-20 flex flex-col"
    >
      <div className="p-2 border-b border-gray-100 dark:border-gray-700">
        <input
          autoFocus
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Buscar GIFs..."
          className="w-full text-sm px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-gray-200 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-400"
        />
      </div>
      <div className="h-64 overflow-y-auto p-2">
        {notConfigured ? (
          <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-8 px-3">
            Los GIFs no están configurados en este workspace todavía.
          </p>
        ) : loading ? (
          <LoadingSpinner size="sm" className="py-8" />
        ) : gifs.length === 0 ? (
          <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-8">Sin resultados.</p>
        ) : (
          <div className="grid grid-cols-2 gap-1.5">
            {gifs.map(g => (
              <button
                key={g.id}
                type="button"
                onClick={() => onSelect(g.url)}
                className="rounded-lg overflow-hidden hover:opacity-80 transition-opacity bg-gray-100 dark:bg-gray-700"
                title={g.title}
              >
                <img src={g.previewUrl || g.url} alt={g.title} className="w-full h-24 object-cover" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
