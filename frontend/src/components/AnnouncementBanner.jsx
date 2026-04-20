import { useState, useEffect } from 'react'
import api from '../api/client'

const DISMISSED_KEY = 'bliss_dismissed_announcements'

const TYPE_STYLES = {
  info:        { bar: 'bg-blue-500',    bg: 'bg-blue-50 dark:bg-blue-900/20',    text: 'text-blue-800 dark:text-blue-200',    border: 'border-blue-200 dark:border-blue-700',    icon: 'ℹ️' },
  feature:     { bar: 'bg-primary-500', bg: 'bg-primary-50 dark:bg-primary-900/20', text: 'text-primary-800 dark:text-primary-200', border: 'border-primary-200 dark:border-primary-700', icon: '✨' },
  warning:     { bar: 'bg-yellow-500',  bg: 'bg-yellow-50 dark:bg-yellow-900/20', text: 'text-yellow-800 dark:text-yellow-200', border: 'border-yellow-200 dark:border-yellow-700',  icon: '⚠️' },
  maintenance: { bar: 'bg-red-500',     bg: 'bg-red-50 dark:bg-red-900/20',      text: 'text-red-800 dark:text-red-200',      border: 'border-red-200 dark:border-red-700',      icon: '🔧' },
}

function getDismissed() {
  try { return JSON.parse(localStorage.getItem(DISMISSED_KEY) || '[]') } catch { return [] }
}
function dismiss(id) {
  const prev = getDismissed()
  if (!prev.includes(id)) localStorage.setItem(DISMISSED_KEY, JSON.stringify([...prev, id]))
}

export default function AnnouncementBanner() {
  const [items,  setItems]  = useState([])
  const [closed, setClosed] = useState([])  // IDs cerrados en esta sesión (sin persistir)

  useEffect(() => {
    const dismissed = getDismissed()
    api.get('/announcements/active')
      .then(r => setItems(r.data.filter(a => !dismissed.includes(a.id))))
      .catch(() => {})
  }, [])

  function handleClose(id) {
    dismiss(id)
    setClosed(prev => [...prev, id])
  }

  const visible = items.filter(a => !closed.includes(a.id))
  if (visible.length === 0) return null

  return (
    <div className="flex flex-col gap-0">
      {visible.map(ann => {
        const s = TYPE_STYLES[ann.type] ?? TYPE_STYLES.info
        return (
          <div key={ann.id} className={`relative flex items-start gap-3 px-4 py-3 border-b ${s.bg} ${s.border} ${s.text}`}>
            {/* Barra lateral de color */}
            <div className={`absolute left-0 top-0 bottom-0 w-1 ${s.bar} rounded-r-sm`} />
            <span className="flex-shrink-0 ml-2 text-base leading-none mt-0.5">{s.icon}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold leading-tight">{ann.title}</p>
              <p className="text-sm opacity-90 mt-0.5 leading-snug">{ann.body}</p>
            </div>
            <button
              onClick={() => handleClose(ann.id)}
              className="flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity ml-2 mt-0.5"
              aria-label="Cerrar"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )
      })}
    </div>
  )
}
