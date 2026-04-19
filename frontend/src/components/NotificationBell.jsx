import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Link } from 'react-router-dom'
import api from '../api/client'

const FILTERS = [
  { key: 'all',              label: 'Todas',       types: null },
  { key: 'TASK_MENTION',     label: '@',           types: ['TASK_MENTION'] },
  { key: 'TASK_COMMENT',     label: '💬',          types: ['TASK_COMMENT'] },
  { key: 'BLOCKED',          label: '🔒',          types: ['BLOCKED'] },
  { key: 'COMPLETED',        label: '✓',           types: ['COMPLETED'] },
  { key: 'ADDED_TO_PROJECT', label: '＋',          types: ['ADDED_TO_PROJECT'] },
]

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
  const [activeFilter,  setActiveFilter]  = useState('all')
  const containerRef = useRef(null)

  const unreadCount = notifications.filter(n => !n.read).length

  const filtered = useMemo(() => {
    const f = FILTERS.find(f => f.key === activeFilter)
    if (!f?.types) return notifications
    return notifications.filter(n => f.types.includes(n.type))
  }, [notifications, activeFilter])

  const unreadByType = useMemo(() => {
    const counts = {}
    for (const f of FILTERS) {
      if (!f.types) continue
      counts[f.key] = notifications.filter(n => !n.read && f.types.includes(n.type)).length
    }
    return counts
  }, [notifications])

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
    if (wasOpen) setActiveFilter('all')

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
        <div className="fixed inset-x-2 top-16 sm:absolute sm:inset-x-auto sm:right-0 sm:top-8 sm:w-80 bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-100 dark:border-gray-700 z-50 overflow-hidden">
          <div className="px-4 pt-3 pb-2 border-b dark:border-gray-700">
            <div className="flex items-center justify-between mb-2.5">
              <span className="font-semibold text-gray-900 dark:text-white text-sm">Notificaciones</span>
              {notifications.length > 0 && (
                <span className="text-xs text-gray-400 dark:text-gray-500">{notifications.length} recientes</span>
              )}
            </div>
            {/* Filter pills */}
            <div className="flex gap-1 flex-wrap">
              {FILTERS.map(f => {
                const badge = f.types ? unreadByType[f.key] : 0
                const isActive = activeFilter === f.key
                return (
                  <button
                    key={f.key}
                    onClick={() => setActiveFilter(f.key)}
                    className={`relative text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${
                      isActive
                        ? 'bg-primary-600 text-white'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                    }`}
                  >
                    {f.label}
                    {badge > 0 && (
                      <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-red-500 text-white text-[8px] font-bold rounded-full flex items-center justify-center leading-none">
                        {badge > 9 ? '9+' : badge}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="max-h-80 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="text-center py-10 text-gray-400 dark:text-gray-500">
                <p className="text-2xl mb-2">🔔</p>
                <p className="text-sm">
                  {notifications.length === 0 ? 'Sin notificaciones todavía' : 'Sin notificaciones de este tipo'}
                </p>
              </div>
            ) : (
              filtered.map(n => {
                const isBlocked      = n.type === 'BLOCKED'
                const isAddedProject = n.type === 'ADDED_TO_PROJECT'
                const isComment      = n.type === 'TASK_COMMENT'
                const isMention      = n.type === 'TASK_MENTION'

                const bgClass = isBlocked
                  ? (!n.read ? 'bg-red-100 dark:bg-red-900/40'      : 'bg-red-50 dark:bg-red-900/20')
                  : isAddedProject
                    ? (!n.read ? 'bg-green-100 dark:bg-green-900/40' : 'bg-green-50 dark:bg-green-900/20')
                    : isComment
                      ? (!n.read ? 'bg-blue-100 dark:bg-blue-900/40' : 'bg-blue-50 dark:bg-blue-900/20')
                      : isMention
                        ? (!n.read ? 'bg-purple-100 dark:bg-purple-900/40' : 'bg-purple-50 dark:bg-purple-900/20')
                        : (!n.read ? 'bg-primary-50 dark:bg-primary-900/20' : 'bg-white dark:bg-gray-800')

                const dotClass = isBlocked ? 'bg-red-500' : isAddedProject ? 'bg-green-500' : isComment ? 'bg-blue-500' : isMention ? 'bg-purple-500' : 'bg-primary-500'
                const textClass = isBlocked
                  ? 'text-red-800 dark:text-red-200'
                  : isAddedProject
                    ? 'text-green-800 dark:text-green-200'
                    : isComment
                      ? 'text-blue-800 dark:text-blue-200'
                      : isMention
                        ? 'text-purple-800 dark:text-purple-200'
                        : 'text-gray-800 dark:text-gray-200'

                const dest = n.projectId
                  ? `/my-projects/${n.projectId}${n.taskId ? `?task=${n.taskId}` : ''}`
                  : null

                return (
                  <Link
                    key={n.id}
                    to={dest ?? '#'}
                    onClick={() => setOpen(false)}
                    className={`block px-4 py-3 border-b dark:border-gray-700 last:border-b-0 transition-colors hover:brightness-95 ${bgClass}`}
                  >
                    <div className="flex items-start gap-2.5">
                      <div className="relative flex-shrink-0 mt-0.5">
                        <img
                          src={`/perfiles/${n.actor.avatar ?? '2bee.png'}`}
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
                        {isMention && (
                          <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-purple-500 rounded-full flex items-center justify-center text-white font-bold text-[8px] leading-none">@</span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm leading-snug ${textClass}`}>
                          <span className="font-semibold">{n.actor.name}</span>{' '}
                          {n.message}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {n.project?.name && (
                            <span className="text-xs font-medium text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 rounded px-1.5 py-0.5 truncate max-w-[140px]">
                              {n.project.name}
                            </span>
                          )}
                          <span className="text-xs text-gray-400 dark:text-gray-500">{timeAgo(n.createdAt)}</span>
                        </div>
                      </div>
                      {!n.read && (
                        <span className={`w-2 h-2 rounded-full ${dotClass} flex-shrink-0 mt-1.5`} />
                      )}
                    </div>
                  </Link>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
