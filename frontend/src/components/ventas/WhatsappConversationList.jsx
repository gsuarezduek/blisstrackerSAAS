const MEDIA_PREVIEW = { image: '📷 Foto', sticker: '🩹 Sticker', audio: '🎤 Audio', video: '🎥 Video', document: '📄 Documento' }

// Preview del último mensaje: si es un adjunto sin caption, se muestra el
// tipo (📷 Foto, 🎤 Audio…) en vez de dejar el renglón vacío.
function previewText(lastMessage) {
  if (!lastMessage) return 'Sin mensajes'
  const prefix = lastMessage.direction === 'out' ? 'Vos: ' : ''
  if (lastMessage.content) return prefix + lastMessage.content
  if (lastMessage.mediaKind) return prefix + (MEDIA_PREVIEW[lastMessage.mediaKind] || '📎 Adjunto')
  return prefix
}

function timeLabel(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const today = new Date()
  if (d.toDateString() === today.toDateString()) {
    return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Argentina/Buenos_Aires' })
  }
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', timeZone: 'America/Argentina/Buenos_Aires' })
}

// Lista de conversaciones (más reciente primero). Cada fila muestra el nombre
// del Contact vinculado si matcheó, si no el número + nombre de perfil de
// WhatsApp (informativo) con un botón para vincularlo a mano (Fase 2 del plan
// — el matching automático por teléfono no cubre todos los casos).
export default function WhatsappConversationList({ conversations, activeId, onSelect, onLinkContact }) {
  if (conversations.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <p className="text-sm text-gray-400 dark:text-gray-500 text-center">
          Todavía no llegó ningún mensaje. En cuanto un lead escriba al número conectado, aparece acá.
        </p>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {conversations.map(c => {
        const title = c.contact?.name || c.contactName || c.phoneE164
        const active = c.id === activeId
        return (
          <button
            key={c.id}
            onClick={() => onSelect(c.id)}
            className={`w-full text-left px-4 py-3 border-b border-gray-100 dark:border-gray-700/60 transition-colors ${
              active ? 'bg-primary-50 dark:bg-primary-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-700/40'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className={`text-sm truncate ${c.unread ? 'font-bold text-gray-900 dark:text-white' : 'font-medium text-gray-800 dark:text-gray-200'}`}>
                {title}
              </span>
              <span className="text-[11px] text-gray-400 dark:text-gray-500 flex-shrink-0">{timeLabel(c.lastMessageAt)}</span>
            </div>
            <div className="flex items-center justify-between gap-2 mt-0.5">
              <p className={`text-xs truncate ${c.unread ? 'text-gray-700 dark:text-gray-300 font-medium' : 'text-gray-400 dark:text-gray-500'}`}>
                {previewText(c.lastMessage)}
              </p>
              {c.unread && <span className="w-2 h-2 rounded-full bg-primary-500 flex-shrink-0" />}
            </div>
            {!c.contact && (
              <button
                onClick={(e) => { e.stopPropagation(); onLinkContact(c) }}
                className="inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 hover:bg-amber-200 dark:hover:bg-amber-900/50"
              >
                Sin vincular · 🔗 Vincular a un contacto
              </button>
            )}
          </button>
        )
      })}
    </div>
  )
}
