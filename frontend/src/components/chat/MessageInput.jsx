import { useState, useRef, useEffect, useMemo } from 'react'
import { useMentionAutocomplete } from './useMentionAutocomplete'
import EmojiGifPicker from './EmojiGifPicker'
import { avatarUrl } from '../../utils/avatarUrl'
import { connectSocket } from '../../lib/socket'
import { fmtBytes } from '../../lib/fileIcons'

// Mismo tope que ATTACHMENT_MAX_BYTES en chat.controller.js — chequeo temprano
// en el cliente, el backend lo vuelve a validar igual.
const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024

// Throttle de emisión de "escribiendo..." — con margen respecto al timeout de 4s del
// receptor (ChatWidget.jsx onTyping) para que un typer continuo no parpadee.
const TYPING_EMIT_THROTTLE_MS = 2500

// Alto máximo del textarea autoexpandible (~9 líneas de texto). Por encima de esto
// scrollea adentro en vez de seguir empujando el panel del chat.
const TEXTAREA_MAX_HEIGHT_PX = 200

// Entrada especial de autocompletado: notifica a todo el equipo del canal, no a una persona.
// Se antepone a la lista real para que "@ev..." la matchee y quede siempre primera.
const EVERYONE_ID = '__everyone__'
const EVERYONE_ITEM = { id: EVERYONE_ID, name: 'everyone' }

// Igual que @everyone, pero acotado al equipo principal del proyecto del canal — solo
// tiene sentido en un canal de proyecto (channel.projectId), por eso se agrega
// condicionalmente vía el prop `projectId`.
const EQUIPO_ID = '__equipo__'
const EQUIPO_ITEM = { id: EQUIPO_ID, name: 'equipo' }

// Input del chat: texto + @menciones + GIF + adjunto + responder.
export default function MessageInput({ onSend, onSendMedia, members, replyingTo, onCancelReply, channelId, projectId }) {
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [showPicker, setShowPicker] = useState(false)
  const [file, setFile] = useState(null)
  const [error, setError] = useState('')
  const textareaRef = useRef(null)
  const pickerRef = useRef(null)
  const fileInputRef = useRef(null)
  const lastTypingEmitRef = useRef(0)

  const mentionable = useMemo(
    () => [EVERYONE_ITEM, ...(projectId ? [EQUIPO_ITEM] : []), ...members],
    [members, projectId]
  )
  const { mentionQuery, mentionMatches, mentionIdx, handleTextChange, handleMentionKeyDown, selectMention } =
    useMentionAutocomplete({ text, setText, textareaRef, members: mentionable })

  // Se resetea al cambiar de canal para no heredar el throttle del canal anterior.
  useEffect(() => { lastTypingEmitRef.current = 0 }, [channelId])

  function handleInputChange(e) {
    handleTextChange(e)
    const now = Date.now()
    if (now - lastTypingEmitRef.current > TYPING_EMIT_THROTTLE_MS) {
      lastTypingEmitRef.current = now
      connectSocket()?.emit('chat:typing', channelId)
    }
  }

  useEffect(() => {
    function handleClickOutside(e) {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) setShowPicker(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  async function handleSend() {
    if ((!text.trim() && !file) || sending) return
    setSending(true)
    setError('')
    try {
      if (file) {
        await onSendMedia(file, text.trim(), replyingTo?.id ?? null)
        setFile(null)
      } else {
        await onSend(text.trim(), null, replyingTo?.id ?? null)
      }
      setText('')
      onCancelReply?.()
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo enviar el mensaje')
    } finally {
      setSending(false)
      textareaRef.current?.focus()
    }
  }

  function handleFilePick(e) {
    const picked = e.target.files?.[0]
    e.target.value = '' // permite re-elegir el mismo archivo después de quitarlo
    if (!picked) return
    if (picked.size > ATTACHMENT_MAX_BYTES) {
      setError(`El archivo supera el máximo permitido (${Math.round(ATTACHMENT_MAX_BYTES / 1024 / 1024)} MB).`)
      return
    }
    setError('')
    setFile(picked)
  }

  async function handleSendGif(url) {
    setShowPicker(false)
    await onSend(null, url, replyingTo?.id ?? null)
    onCancelReply?.()
  }

  // Inserta el emoji en la posición del cursor (no envía ni cierra el picker, para
  // poder encadenar varios — mismo criterio que el emoji picker de WhatsApp).
  function handleSelectEmoji(emoji) {
    const el = textareaRef.current
    const start = el?.selectionStart ?? text.length
    const end = el?.selectionEnd ?? text.length
    const newText = text.slice(0, start) + emoji + text.slice(end)
    setText(newText)
    const newCursor = start + emoji.length
    setTimeout(() => {
      el?.focus()
      el?.setSelectionRange(newCursor, newCursor)
    }, 0)
  }

  function handleKeyDown(e) {
    if (handleMentionKeyDown(e)) return
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
    if (e.key === 'Escape' && replyingTo) onCancelReply?.()
  }

  // Foco automático al elegir "Responder" en un mensaje — mismo gesto que WhatsApp/Discord.
  useEffect(() => {
    if (replyingTo) textareaRef.current?.focus()
  }, [replyingTo])

  // Auto-crece con el contenido hasta TEXTAREA_MAX_HEIGHT_PX; más allá de eso el
  // propio textarea scrollea (comportamiento default de overflow en un <textarea>).
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, TEXTAREA_MAX_HEIGHT_PX)}px`
  }, [text])

  return (
    <div className="px-3 py-2.5 border-t border-gray-100 dark:border-gray-700 flex-shrink-0">
      {replyingTo && (
        <div className="flex items-center gap-2 mb-2 pl-2.5 pr-1.5 py-1.5 rounded-lg bg-gray-50 dark:bg-gray-700/60 border-l-2 border-primary-400">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-primary-600 dark:text-primary-400">
              Respondiendo a {replyingTo.systemType ? 'un mensaje del sistema' : (replyingTo.author?.name || 'alguien')}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
              {replyingTo.gifUrl ? '🖼️ GIF' : replyingTo.attachment ? '📎 Archivo' : (replyingTo.content || '')}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancelReply}
            title="Cancelar respuesta"
            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded flex-shrink-0"
          >
            ✕
          </button>
        </div>
      )}
      {file && (
        <div className="flex items-center gap-2 mb-2 pl-2.5 pr-1.5 py-1.5 rounded-lg bg-gray-50 dark:bg-gray-700/60 border-l-2 border-primary-400">
          <span className="flex-1 min-w-0 text-xs text-gray-600 dark:text-gray-300 truncate">
            📎 {file.name} <span className="text-gray-400">({fmtBytes(file.size)})</span>
          </span>
          <button
            type="button"
            onClick={() => setFile(null)}
            title="Quitar archivo"
            className="p-1 text-gray-400 hover:text-red-500 rounded flex-shrink-0"
          >
            ✕
          </button>
        </div>
      )}
      {error && <p className="text-xs text-red-600 dark:text-red-400 mb-1.5">⚠️ {error}</p>}
      <div className="flex items-end gap-2">
        <div ref={pickerRef} className="relative flex-shrink-0">
          <button
            type="button"
            onClick={() => setShowPicker(v => !v)}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors text-base"
            title="Emoji y GIF"
          >
            😊
          </button>
          {showPicker && (
            <EmojiGifPicker
              onSelectEmoji={handleSelectEmoji}
              onSelectGif={handleSendGif}
              onClose={() => setShowPicker(false)}
            />
          )}
        </div>

        <input ref={fileInputRef} type="file" onChange={handleFilePick} className="hidden" />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={sending}
          className="w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-40 transition-colors"
          title="Adjuntar archivo"
        >
          📎
        </button>

        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            rows={1}
            value={text}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder={file ? 'Agregá un texto (opcional)…' : 'Escribí un mensaje... Usá @ para mencionar'}
            className="w-full text-sm px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-gray-200 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-400 resize-none overflow-y-auto"
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
                  {m.id === EVERYONE_ID || m.id === EQUIPO_ID ? (
                    <span className="w-6 h-6 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-300 flex items-center justify-center flex-shrink-0 text-xs font-bold">@</span>
                  ) : (
                    <img src={avatarUrl(m.avatar)} alt={m.name} className="w-6 h-6 rounded-full object-cover border border-gray-200 dark:border-gray-600 flex-shrink-0" />
                  )}
                  <span className="text-gray-800 dark:text-gray-200 font-medium">{m.name}</span>
                  {m.id === EVERYONE_ID && (
                    <span className="text-xs text-gray-400 dark:text-gray-500">notifica a todo el equipo</span>
                  )}
                  {m.id === EQUIPO_ID && (
                    <span className="text-xs text-gray-400 dark:text-gray-500">notifica al equipo del proyecto</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={handleSend}
          disabled={sending || (!text.trim() && !file)}
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
