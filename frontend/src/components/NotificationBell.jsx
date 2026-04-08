import { useState, useEffect, useRef, useCallback } from 'react'
import api from '../api/client'

function timeAgo(dateStr) {
  const diff = Math.floor((Date.now() - new Date(dateStr)) / 1000)
  if (diff < 60)   return 'hace un momento'
  if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)}h`
  return new Date(dateStr).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
}

export default function NotificationBell() {
  const [notifications, setNotifications] = useState([])
  const [open,          setOpen]          = useState(false)
  const containerRef = useRef(null)

  const unreadCount = notifications.filter(n => !n.read).length

  const fetchNotifications = useCallback(async () => {
    try {
      const { data } = await api.get('/notifications')
      setNotifications(data)
    } catch {
      // silently ignore (e.g. on logout)
    }
  }, [])

  // Initial fetch + poll every 2min
  useEffect(() => {
    fetchNotifications()
    const t = setInterval(fetchNotifications, 120000)
    return () => clearInterval(t)
  }, [fetchNotifications])

  // Close on outside click
  useEffect(() => {
    function handleClick(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  async function handleOpen() {
    const wasOpen = open
    setOpen(prev => !prev)

    // Mark all as read when opening
    if (!wasOpen && unreadCount > 0) {
      setNotifications(prev => prev.map(n => ({ ...n, read: true })))
      try { await api.post('/notifications/read-all') } catch {}
    }
  }

  return (
    <div ref={containerRef} className="relative">
      {/* Bell button */}
      <button
        onClick={handleOpen}
        className="relative text-gray-500 hover:text-gray-800 transition-colors p-1"
        title="Notificaciones"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
          <path fillRule="evenodd" d="M5.25 9a6.75 6.75 0 0113.5 0v.75c0 2.123.8 4.057 2.118 5.52a.75.75 0 01-.297 1.206c-1.544.57-3.16.99-4.831 1.243a3.75 3.75 0 11-7.48 0 24.585 24.585 0 01-4.831-1.244.75.75 0 01-.298-1.205A8.217 8.217 0 005.25 9.75V9zm4.502 8.9a2.25 2.25 0 104.496 0 25.057 25.057 0 01-4.496 0z" clipRule="evenodd" />
        </svg>

        {/* Unread badge */}
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center leading-none">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-8 w-80 bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-100 dark:border-gray-700 z-50 overflow-hidden">
          <div className="px-4 py-3 border-b dark:border-gray-700 flex items-center justify-between">
            <span className="font-semibold text-gray-900 dark:text-white text-sm">Notificaciones</span>
            {notifications.length > 0 && (
              <span className="text-xs text-gray-400 dark:text-gray-500">{notifications.length} recientes</span>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="text-center py-10 text-gray-400 dark:text-gray-500">
                <p className="text-2xl mb-2">🔔</p>
                <p className="text-sm">Sin notificaciones todavía</p>
              </div>
            ) : (
              notifications.map(n => {
                const isBlocked      = n.type === 'BLOCKED'
                const isAddedProject = n.type === 'ADDED_TO_PROJECT'
                const isComment      = n.type === 'TASK_COMMENT'

                const bgClass = isBlocked
                  ? (!n.read ? 'bg-red-100 dark:bg-red-900/40'   : 'bg-red-50 dark:bg-red-900/20')
                  : isAddedProject
                    ? (!n.read ? 'bg-green-100 dark:bg-green-900/40' : 'bg-green-50 dark:bg-green-900/20')
                    : isComment
                      ? (!n.read ? 'bg-blue-100 dark:bg-blue-900/40' : 'bg-blue-50 dark:bg-blue-900/20')
                      : (!n.read ? 'bg-primary-50 dark:bg-primary-900/20' : 'bg-white dark:bg-gray-800')

                const dotClass = isBlocked ? 'bg-red-500' : isAddedProject ? 'bg-green-500' : isComment ? 'bg-blue-500' : 'bg-primary-500'
                const textClass = isBlocked
                  ? 'text-red-800 dark:text-red-200'
                  : isAddedProject
                    ? 'text-green-800 dark:text-green-200'
                    : isComment
                      ? 'text-blue-800 dark:text-blue-200'
                      : 'text-gray-800 dark:text-gray-200'

                return (
                  <div
                    key={n.id}
                    className={`px-4 py-3 border-b dark:border-gray-700 last:border-b-0 transition-colors ${bgClass}`}
                  >
                    <div className="flex items-start gap-2.5">
                      <div className="relative flex-shrink-0 mt-0.5">
                        <img
                          src={`/perfiles/${n.actor.avatar ?? 'bee.png'}`}
                          alt={n.actor.name}
                          className="w-7 h-7 rounded-full object-cover border border-gray-200 dark:border-gray-600"
                        />
                        {isBlocked && (
                          <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-red-500 rounded-full flex items-center justify-center text-white text-[8px] leading-none">⚠</span>
                        )}
                        {isAddedProject && (
                          <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-green-500 rounded-full flex items-center justify-center text-white text-[8px] leading-none">＋</span>
                        )}
                        {isComment && (
                          <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-blue-500 rounded-full flex items-center justify-center text-white text-[8px] leading-none">💬</span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm leading-snug ${textClass}`}>
                          <span className="font-semibold">{n.actor.name}</span>{' '}
                          {n.message}
                        </p>
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{timeAgo(n.createdAt)}</p>
                      </div>
                      {!n.read && (
                        <span className={`w-2 h-2 rounded-full ${dotClass} flex-shrink-0 mt-1.5`} />
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
