import { useState, useEffect } from 'react'
import api from '../../api/client'
import useRoles from '../../hooks/useRoles'

function timeAgo(dateStr) {
  const diff = Math.floor((Date.now() - new Date(dateStr)) / 1000)
  if (diff < 60) return 'hace un momento'
  if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)}h`
  const d = new Date(dateStr)
  return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function FeedbackTab() {
  const { labelFor } = useRoles()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all') // 'all' | 'SUGGESTION' | 'BUG' | 'unread'

  useEffect(() => {
    api.get('/feedback').then(r => setItems(r.data)).finally(() => setLoading(false))
  }, [])

  async function handleMarkRead(id) {
    await api.put(`/feedback/${id}/read`)
    setItems(prev => prev.map(f => f.id === id ? { ...f, read: true } : f))
  }

  const filtered = items.filter(f => {
    if (filter === 'unread') return !f.read
    if (filter === 'SUGGESTION' || filter === 'BUG') return f.type === filter
    return true
  })

  const unreadCount = items.filter(f => !f.read).length

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white">
          Feedback
          {unreadCount > 0 && (
            <span className="ml-2 bg-red-500 text-white text-xs font-bold rounded-full px-2 py-0.5">
              {unreadCount}
            </span>
          )}
        </h2>
        <span className="text-sm text-gray-400 dark:text-gray-500">{items.length} mensaje{items.length !== 1 ? 's' : ''} en total</span>
      </div>

      {/* Filter pills */}
      <div className="flex gap-2 mb-5 flex-wrap">
        {[
          { id: 'all', label: 'Todos' },
          { id: 'unread', label: `Sin leer (${unreadCount})` },
          { id: 'SUGGESTION', label: '💡 Sugerencias' },
          { id: 'BUG', label: '🐛 Errores' },
        ].map(f => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${
              filter === f.id
                ? 'bg-primary-600 text-white'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading && <div className="text-center py-12 text-gray-400">Cargando...</div>}

      {!loading && filtered.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          <p className="text-3xl mb-2">💬</p>
          <p>{filter === 'unread' ? 'No hay mensajes sin leer' : 'No hay mensajes todavía'}</p>
        </div>
      )}

      <div className="space-y-3">
        {filtered.map(f => (
          <div
            key={f.id}
            className={`bg-white dark:bg-gray-800 border rounded-xl p-4 transition-all ${
              !f.read ? 'border-l-4 border-l-primary-500' : 'border-gray-200 dark:border-gray-700 opacity-75'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 flex-1 min-w-0">
                {/* Type badge */}
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full flex-shrink-0 mt-0.5 ${
                  f.type === 'BUG'
                    ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                    : 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400'
                }`}>
                  {f.type === 'BUG' ? '🐛 Error' : '💡 Sugerencia'}
                </span>

                {/* Message */}
                <p className="text-sm text-gray-800 dark:text-gray-200 leading-relaxed">{f.message}</p>
              </div>

              {/* Mark read */}
              {!f.read && (
                <button
                  onClick={() => handleMarkRead(f.id)}
                  title="Marcar como leído"
                  className="flex-shrink-0 text-gray-400 hover:text-primary-600 transition-colors mt-0.5"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                    <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                  </svg>
                </button>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
              <div className="w-6 h-6 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center flex-shrink-0">
                <span className="text-xs font-bold text-primary-700 dark:text-primary-400">
                  {f.user.name.charAt(0).toUpperCase()}
                </span>
              </div>
              <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{f.user.name}</span>
              <span className="text-xs text-gray-400 dark:text-gray-500">·</span>
              <span className="text-xs text-gray-400 dark:text-gray-500">{labelFor(f.user.role)}</span>
              <span className="text-xs text-gray-400 dark:text-gray-500">·</span>
              <span className="text-xs text-gray-400 dark:text-gray-500">{timeAgo(f.createdAt)}</span>
              {f.read && <span className="ml-auto text-xs text-gray-300 dark:text-gray-600">Leído ✓</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
