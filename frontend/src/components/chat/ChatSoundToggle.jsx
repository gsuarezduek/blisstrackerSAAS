import { useState, useEffect, useRef } from 'react'
import { CHAT_SOUND_OPTIONS } from '../../lib/chatSound'

const LABELS = {
  mentions: { label: 'Solo menciones', hint: 'Sonar cuando me mencionan a mí o a @everyone' },
  favorites: { label: 'Mis proyectos favoritos', hint: 'Sonar con cualquier mensaje en canales de proyectos destacados' },
  none: { label: 'Ninguna', hint: 'No reproducir sonido' },
}

// Toggle de sonido del chat: no es un simple on/off sino 3 modos mutuamente
// excluyentes (ver ChatContext.jsx `soundPref`). El ícono del botón refleja el
// modo activo (🔔/⭐/🔕) para que se note de un vistazo sin abrir el popover.
export default function ChatSoundToggle({ pref, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const icon = pref === 'none' ? '🔕' : pref === 'favorites' ? '⭐' : '🔔'

  return (
    <div ref={ref} className="relative flex-shrink-0">
      <button
        onClick={() => setOpen(v => !v)}
        title={`Notificaciones de sonido: ${LABELS[pref]?.label || ''}`}
        className="p-1.5 text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
      >
        {icon}
      </button>
      {open && (
        <div className="absolute top-full right-0 mt-1 w-64 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl shadow-lg z-20 py-1 overflow-hidden">
          <p className="px-3 pt-2 pb-1 text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">
            Notificaciones de sonido
          </p>
          {CHAT_SOUND_OPTIONS.map(opt => (
            <button
              key={opt}
              type="button"
              onClick={() => { onChange(opt); setOpen(false) }}
              className={`w-full text-left px-3 py-2 flex items-start gap-2 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${
                pref === opt ? 'bg-primary-50 dark:bg-primary-900/20' : ''
              }`}
            >
              <span className={`mt-0.5 w-3.5 h-3.5 rounded-full border flex-shrink-0 flex items-center justify-center ${
                pref === opt ? 'border-primary-500' : 'border-gray-300 dark:border-gray-600'
              }`}>
                {pref === opt && <span className="w-1.5 h-1.5 rounded-full bg-primary-500" />}
              </span>
              <span className="min-w-0">
                <span className={`block text-sm font-medium ${pref === opt ? 'text-primary-700 dark:text-primary-300' : 'text-gray-700 dark:text-gray-200'}`}>
                  {LABELS[opt].label}
                </span>
                <span className="block text-[11px] text-gray-400 dark:text-gray-500">{LABELS[opt].hint}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
