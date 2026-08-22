import { useRef, useState } from 'react'

function fmtBytes(n) {
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

// A diferencia del chat interno, acá no hay @menciones/GIF/reply — es texto
// libre (u adjuntos, Fase 3 del plan) hacia un lead externo. `windowExpired`
// deshabilita el envío cuando pasaron más de 24hs desde el último mensaje del
// contacto (guardrail mínimo de la Fase 1; las plantillas para reabrir son la
// Fase 5). Con un archivo elegido, el texto pasa a ser el caption (opcional).
export default function WhatsappMessageInput({ onSend, onSendMedia, windowExpired }) {
  const [text, setText] = useState('')
  const [file, setFile] = useState(null)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState(null)
  const textareaRef = useRef(null)
  const fileInputRef = useRef(null)

  async function handleSend() {
    if (sending || windowExpired) return
    if (!file && !text.trim()) return
    setSending(true)
    setError(null)
    try {
      if (file) {
        await onSendMedia(file, text.trim())
        setFile(null)
      } else {
        await onSend(text.trim())
      }
      setText('')
    } catch (err) {
      // Antes esto fallaba en silencio (el usuario veía el mensaje "perdido"
      // sin ningún aviso) — ver el mensaje real del backend, que ya viene
      // formateado (ej. WHATSAPP_SEND_FAILED con el detalle de Chakra).
      setError(err.response?.data?.error || 'No se pudo enviar el mensaje')
    } finally {
      setSending(false)
      textareaRef.current?.focus()
    }
  }

  function handleFilePick(e) {
    const f = e.target.files?.[0]
    if (f) setFile(f)
    e.target.value = '' // permite re-elegir el mismo archivo después de sacarlo
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  if (windowExpired) {
    return (
      <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-700 flex-shrink-0 bg-amber-50 dark:bg-amber-900/20">
        <p className="text-xs text-amber-700 dark:text-amber-400">
          ⏱️ Pasaron más de 24hs desde el último mensaje del contacto — WhatsApp ya no permite texto libre. Hace falta una plantilla aprobada para reabrir la conversación (todavía no implementado, ver Fase 5 del plan).
        </p>
      </div>
    )
  }

  return (
    <div className="px-3 py-2.5 border-t border-gray-100 dark:border-gray-700 flex-shrink-0">
      {error && (
        <p className="text-xs text-red-600 dark:text-red-400 mb-1.5">⚠️ {error}</p>
      )}
      {file && (
        <div className="flex items-center gap-2 mb-1.5 bg-gray-100 dark:bg-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-gray-600 dark:text-gray-300">
          <span className="flex-1 truncate">📎 {file.name} <span className="text-gray-400">({fmtBytes(file.size)})</span></span>
          <button onClick={() => setFile(null)} className="text-gray-400 hover:text-red-500 flex-shrink-0" title="Quitar archivo">✕</button>
        </div>
      )}
      <div className="flex items-end gap-2">
        <input ref={fileInputRef} type="file" onChange={handleFilePick} className="hidden" />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={sending}
          className="w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-full text-gray-400 hover:text-primary-600 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40 transition-colors"
          title="Adjuntar archivo"
        >
          📎
        </button>
        <textarea
          ref={textareaRef}
          rows={1}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={file ? 'Agregá un texto (opcional)…' : 'Escribí un mensaje…'}
          className="flex-1 text-sm px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-gray-200 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-400 resize-none max-h-28"
        />
        <button
          onClick={handleSend}
          disabled={sending || (!file && !text.trim())}
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
