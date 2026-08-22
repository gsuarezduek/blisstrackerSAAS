import { useRef, useState } from 'react'

// A diferencia del chat interno, acá no hay @menciones/GIF/reply — es texto
// libre hacia un lead externo. `windowExpired` deshabilita el envío cuando
// pasaron más de 24hs desde el último mensaje del contacto (guardrail mínimo
// de la Fase 1 del plan; las plantillas para reabrir son la Fase 5).
export default function WhatsappMessageInput({ onSend, windowExpired }) {
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState(null)
  const textareaRef = useRef(null)

  async function handleSend() {
    if (!text.trim() || sending || windowExpired) return
    setSending(true)
    setError(null)
    try {
      await onSend(text.trim())
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
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          rows={1}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Escribí un mensaje…"
          className="flex-1 text-sm px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-gray-200 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-400 resize-none max-h-28"
        />
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
