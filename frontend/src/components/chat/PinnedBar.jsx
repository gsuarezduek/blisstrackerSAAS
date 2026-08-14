import { useState } from 'react'
import { avatarUrl } from '../../utils/avatarUrl'
import UserLink from '../UserLink'

// Barra colapsable de mensajes fijados, arriba de la lista. Cualquier miembro puede
// fijar/desfijar (ver chat.controller.js togglePin) — no hay gating de permisos acá.
export default function PinnedBar({ pinned, onUnpin }) {
  const [expanded, setExpanded] = useState(false)
  if (!pinned || pinned.length === 0) return null

  return (
    <div className="border-b border-gray-100 dark:border-gray-700 flex-shrink-0 bg-amber-50/60 dark:bg-amber-900/10">
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-2 px-4 py-1.5 text-xs font-medium text-amber-700 dark:text-amber-300 hover:bg-amber-100/60 dark:hover:bg-amber-900/20 transition-colors"
      >
        <span>📌</span>
        <span className="flex-1 text-left">{pinned.length} mensaje{pinned.length === 1 ? '' : 's'} fijado{pinned.length === 1 ? '' : 's'}</span>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"
          className={`w-3.5 h-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`}>
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
        </svg>
      </button>

      {expanded && (
        <div className="max-h-40 overflow-y-auto px-2 pb-2 space-y-1">
          {pinned.map(m => (
            <div key={m.id} className="flex items-start gap-2 px-2 py-1.5 rounded-lg bg-white dark:bg-gray-800 border border-amber-100 dark:border-amber-800/40">
              <UserLink userId={m.author.id} className="flex-shrink-0">
                <img src={avatarUrl(m.author.avatar)} alt={m.author.name} className="w-6 h-6 rounded-full object-cover border border-gray-200 dark:border-gray-600" />
              </UserLink>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-gray-700 dark:text-gray-200">{m.author.name}</p>
                {m.content && <p className="text-xs text-gray-600 dark:text-gray-300 truncate">{m.content}</p>}
                {m.gifUrl && !m.content && <p className="text-xs text-gray-400 dark:text-gray-500 italic">GIF</p>}
              </div>
              <button
                onClick={() => onUnpin(m)}
                title="Desfijar"
                className="flex-shrink-0 text-[11px] text-amber-600 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-200 px-1.5 py-0.5"
              >
                Desfijar
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
