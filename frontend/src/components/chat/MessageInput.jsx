import { useState, useRef, useEffect, useMemo } from 'react'
import { useMentionAutocomplete } from './useMentionAutocomplete'
import GifPicker from './GifPicker'
import { avatarUrl } from '../../utils/avatarUrl'

// Entrada especial de autocompletado: notifica a todo el equipo del canal, no a una persona.
// Se antepone a la lista real para que "@ev..." la matchee y quede siempre primera.
const EVERYONE_ID = '__everyone__'
const EVERYONE_ITEM = { id: EVERYONE_ID, name: 'everyone' }

// Input del chat: texto + @menciones + GIF.
export default function MessageInput({ onSend, members }) {
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [showGifPicker, setShowGifPicker] = useState(false)
  const textareaRef = useRef(null)
  const gifRef = useRef(null)

  const mentionable = useMemo(() => [EVERYONE_ITEM, ...members], [members])
  const { mentionQuery, mentionMatches, mentionIdx, handleTextChange, handleMentionKeyDown, selectMention } =
    useMentionAutocomplete({ text, setText, textareaRef, members: mentionable })

  useEffect(() => {
    function handleClickOutside(e) {
      if (gifRef.current && !gifRef.current.contains(e.target)) setShowGifPicker(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  async function handleSend() {
    if (!text.trim() || sending) return
    setSending(true)
    try {
      await onSend(text.trim(), null)
      setText('')
    } finally {
      setSending(false)
      textareaRef.current?.focus()
    }
  }

  async function handleSendGif(url) {
    setShowGifPicker(false)
    await onSend(null, url)
  }

  function handleKeyDown(e) {
    if (handleMentionKeyDown(e)) return
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="px-3 py-2.5 border-t border-gray-100 dark:border-gray-700 flex-shrink-0">
      <div className="flex items-end gap-2">
        <div ref={gifRef} className="relative flex-shrink-0">
          <button
            type="button"
            onClick={() => setShowGifPicker(v => !v)}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            title="Enviar GIF"
          >
            🎬
          </button>
          {showGifPicker && <GifPicker onSelect={handleSendGif} onClose={() => setShowGifPicker(false)} />}
        </div>

        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            rows={1}
            value={text}
            onChange={handleTextChange}
            onKeyDown={handleKeyDown}
            placeholder="Escribí un mensaje... Usá @ para mencionar"
            className="w-full text-sm px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-gray-200 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-400 resize-none max-h-28"
          />
          {mentionQuery !== null && mentionMatches.length > 0 && (
            <div className="absolute bottom-full mb-1 left-0 right-0 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl shadow-lg overflow-hidden z-10">
              {mentionMatches.map((m, i) => (
                <button
                  key={m.id}
                  type="button"
                  onMouseDown={e => { e.preventDefault(); selectMention(m) }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left transition-colors ${i === mentionIdx ? 'bg-primary-50 dark:bg-primary-900/30' : 'hover:bg-gray-50 dark:hover:bg-gray-700'}`}
                >
                  {m.id === EVERYONE_ID ? (
                    <span className="w-6 h-6 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-300 flex items-center justify-center flex-shrink-0 text-xs font-bold">@</span>
                  ) : (
                    <img src={avatarUrl(m.avatar)} alt={m.name} className="w-6 h-6 rounded-full object-cover border border-gray-200 dark:border-gray-600 flex-shrink-0" />
                  )}
                  <span className="text-gray-800 dark:text-gray-200 font-medium">{m.name}</span>
                  {m.id === EVERYONE_ID && (
                    <span className="text-xs text-gray-400 dark:text-gray-500">notifica a todo el equipo</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={handleSend}
          disabled={sending || !text.trim()}
          className="w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-full bg-primary-600 hover:bg-primary-700 disabled:opacity-40 disabled:hover:bg-primary-600 text-white transition-colors"
          title="Enviar (Enter)"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 -ml-0.5">
            <path d="M3.105 3.105a.75.75 0 01.815-.157l14.5 6.25a.75.75 0 010 1.376l-14.5 6.25a.75.75 0 01-1.028-.917L4.606 10 2.892 4.023a.75.75 0 01.213-.918z" />
          </svg>
        </button>
      </div>
    </div>
  )
}
