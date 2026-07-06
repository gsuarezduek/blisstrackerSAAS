import { useState, useEffect } from 'react'
import api from '../../api/client'
import { timeAgo } from './shared'

export function SectionFeedback() {
  const [items,   setItems]   = useState([])
  const [loading, setLoading] = useState(true)
  const [filter,  setFilter]  = useState('all')

  useEffect(() => {
    api.get('/superadmin/feedback').then(r => setItems(r.data)).finally(() => setLoading(false))
  }, [])

  async function handleMarkRead(id) {
    await api.put(`/superadmin/feedback/${id}/read`)
    setItems(prev => prev.map(f => f.id === id ? { ...f, read: true } : f))
  }

  const unreadCount = items.filter(f => !f.read).length
  const filtered = items.filter(f => {
    if (filter === 'unread')                             return !f.read
    if (filter === 'SUGGESTION' || filter === 'BUG')     return f.type === filter
    return true
  })

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700">
      <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold text-gray-900 dark:text-white">Feedback</h2>
          {unreadCount > 0 && (
            <span className="bg-red-500 text-white text-xs font-bold rounded-full px-2 py-0.5">{unreadCount}</span>
          )}
        </div>
        <div className="flex gap-1.5">
          {[
            { id: 'all',        label: 'Todos' },
            { id: 'unread',     label: `Sin leer (${unreadCount})` },
            { id: 'SUGGESTION', label: '💡' },
            { id: 'BUG',        label: '🐛' },
          ].map(f => (
            <button key={f.id} onClick={() => setFilter(f.id)}
              className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${
                filter === f.id
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="p-8 text-center text-gray-400 text-sm">Cargando...</div>
      ) : filtered.length === 0 ? (
        <div className="p-8 text-center text-gray-400 text-sm">
          {filter === 'unread' ? 'No hay mensajes sin leer' : 'No hay mensajes todavía'}
        </div>
      ) : (
        <div className="divide-y divide-gray-100 dark:divide-gray-700">
          {filtered.map(f => (
            <div key={f.id} className={`px-5 py-4 flex items-start justify-between gap-3 ${f.read ? 'opacity-60' : ''}`}>
              <div className="flex items-start gap-3 flex-1 min-w-0">
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0 mt-0.5 ${
                  f.type === 'BUG'
                    ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                    : 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400'
                }`}>
                  {f.type === 'BUG' ? '🐛 Error' : '💡 Sugerencia'}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-800 dark:text-gray-200 leading-relaxed">{f.message}</p>
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    <span className="text-xs font-medium text-gray-600 dark:text-gray-400">{f.user.name}</span>
                    {f.workspace && (
                      <>
                        <span className="text-xs text-gray-300 dark:text-gray-600">·</span>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">
                          {f.workspace.name}
                        </span>
                      </>
                    )}
                    <span className="text-xs text-gray-300 dark:text-gray-600">·</span>
                    <span className="text-xs text-gray-400">{timeAgo(f.createdAt)}</span>
                    {f.read && <span className="text-xs text-gray-300 dark:text-gray-600 ml-auto">Leído ✓</span>}
                  </div>
                </div>
              </div>
              {!f.read && (
                <button onClick={() => handleMarkRead(f.id)} title="Marcar como leído"
                  className="flex-shrink-0 text-gray-400 hover:text-primary-600 transition-colors mt-0.5">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                    <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                  </svg>
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

