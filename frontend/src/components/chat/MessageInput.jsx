import { useState, useRef, useEffect } from 'react'
import { useMentionAutocomplete } from './useMentionAutocomplete'
import GifPicker from './GifPicker'
import FeedbackModal from '../FeedbackModal'
import { avatarUrl } from '../../utils/avatarUrl'

// Input del chat: texto + @menciones + GIF + acceso al Feedback existente (botón "+").
export default function MessageInput({ onSend, members }) {
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [showGifPicker, setShowGifPicker] = useState(false)
  const [showFeedback, setShowFeedback] = useState(false)
  const [showPlusMenu, setShowPlusMenu] = useState(false)
  const textareaRef = useRef(null)
  const plusRef = useRef(null)

  const { mentionQuery, mentionMatches, mentionIdx, handleTextChange, handleMentionKeyDown, selectMention } =
    useMentionAutocomplete({ text, setText, textareaRef, members })

  useEffect(() => {
    function handleClickOutside(e) {
      if (plusRef.current && !plusRef.current.contains(e.target)) setShowPlusMenu(false)
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
    <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-700 flex-shrink-0">
      <div className="flex items-end gap-2">
        <div ref={plusRef} className="relative flex-shrink-0">
          <button
            type="button"
            onClick={() => setShowPlusMenu(v => !v)}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors text-lg font-medium"
            title="Más opciones"
          >
            +
          </button>
          {showPlusMenu && (
            <div className="absolute bottom-full mb-2 left-0 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl shadow-lg py-1 z-20 w-56">
              <button
                onClick={() => { setShowPlusMenu(false); setShowGifPicker(true) }}
                className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                🎬 GIF
              </button>
              <button
                onClick={() => { setShowPlusMenu(false); setShowFeedback(true) }}
                className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                💡 Nueva sugerencia / 🐛 Reportar error
              </button>
            </div>
          )}
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
            className="w-full text-sm px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-gray-200 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-400 resize-none max-h-32"
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
                  <img src={avatarUrl(m.avatar)} alt={m.name} className="w-6 h-6 rounded-full object-cover border border-gray-200 dark:border-gray-600 flex-shrink-0" />
                  <span className="text-gray-800 dark:text-gray-200 font-medium">{m.name}</span>
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

      <FeedbackModal open={showFeedback} onClose={() => setShowFeedback(false)} />
    </div>
  )
}
