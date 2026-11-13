import { Ban, CheckCheck, MessageSquareDot, Pin } from 'lucide-react'
import { Icon } from '../ui/Icon'
const MEDIA_PREVIEW = { image: 'Foto', sticker: 'Sticker', audio: 'Audio', video: 'Video', document: 'Documento' }

// Preview del último mensaje: si es un adjunto sin caption, se muestra el
// tipo (📷 Foto, 🎤 Audio…) en vez de dejar el renglón vacío.
function previewText(lastMessage) {
  if (!lastMessage) return 'Sin mensajes'
  const prefix = lastMessage.direction === 'out' ? 'Vos: ' : ''
  if (lastMessage.reactionEmoji) return `Reaccionó ${lastMessage.reactionEmoji}`
  if (lastMessage.content) return prefix + lastMessage.content
  if (lastMessage.mediaKind) return prefix + (MEDIA_PREVIEW[lastMessage.mediaKind] || 'Adjunto')
  return prefix
}

// La ventana de 24hs de WhatsApp "por vencer": quedan menos de estas horas
// para responder con texto libre. Pasado eso, retomar exige una plantilla paga.
const CLOSING_SOON_MS = 3 * 60 * 60 * 1000

function windowMsLeft(c, now) {
  if (!c.sessionExpiresAt) return null
  const left = new Date(c.sessionExpiresAt).getTime() - now
  return left > 0 ? left : null
}

function isClosingSoon(c, now) {
  const left = windowMsLeft(c, now)
  return left !== null && left <= CLOSING_SOON_MS
}

// Filtros de la bandeja. Todos corren en el browser sobre lo que ya devuelve
// listConversations (`unread` por persona, `awaitingReply`, `sessionExpiresAt`).
// `empty` es el texto de la lista vacía con ese filtro activo.
export const CONVERSATION_FILTERS = [
  { key: 'all', label: 'Todos', match: () => true },
  { key: 'unread', label: 'No leídos', match: c => c.unread, empty: 'No tenés chats sin leer.', searchSuffix: ' sin leer' },
  { key: 'awaiting', label: 'Sin responder', match: c => c.awaitingReply, empty: 'No hay chats esperando respuesta.', searchSuffix: ' sin responder' },
  { key: 'closing', label: 'Por vencer', match: (c, now) => isClosingSoon(c, now), empty: 'Ningún chat tiene la ventana de 24 h por vencer.', searchSuffix: ' con la ventana por vencer', title: 'Quedan menos de 3 h para responder sin plantilla' },
]

function closingLabel(ms) {
  const mins = Math.max(1, Math.round(ms / 60000))
  return mins < 60 ? `Vence en ${mins} min` : `Vence en ${Math.round(mins / 60)} h`
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

// Una fila de conversación — extraída para reusarse en el grupo "Fijados" y
// en el resto sin duplicar el JSX.
function ConversationRow({ c, active, now, onSelect, onLinkContact, onOpenLead, onTogglePin, onToggleBlock, onToggleRead }) {
  const title = c.contact?.name || c.contactName || c.phoneE164
  const pinned = Boolean(c.pinnedAt)
  const blocked = Boolean(c.isBlocked)
  const closingMs = !blocked && isClosingSoon(c, now) ? windowMsLeft(c, now) : null
  return (
    <button
      onClick={() => onSelect(c.id)}
      className={`w-full text-left px-4 py-3 border-b border-gray-100 dark:border-gray-700/60 transition-colors ${
        active ? 'bg-primary-50 dark:bg-primary-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-700/40'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className={`text-sm truncate ${c.unread ? 'font-bold text-gray-900 dark:text-white' : 'font-medium text-gray-800 dark:text-gray-200'}`}>
          {title}
        </span>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {!blocked && (
            <button
              onClick={(e) => { e.stopPropagation(); onToggleRead(c) }}
              title={c.unread ? 'Marcar como leído (para todo el equipo)' : 'Marcar como no leído (para todo el equipo)'}
              className="text-xs leading-none transition-all text-gray-400 opacity-40 hover:opacity-70"
            >
              <Icon as={c.unread ? CheckCheck : MessageSquareDot} size={15} />
            </button>
          )}
          {!blocked && (
            <button
              onClick={(e) => { e.stopPropagation(); onTogglePin(c) }}
              title={pinned ? 'Desfijar chat' : 'Fijar chat'}
              className={`text-xs leading-none transition-all ${
                pinned ? 'text-red-500 opacity-100' : 'text-gray-400 opacity-40 hover:opacity-70'
              }`}
            >
              <Icon as={Pin} size={15} />
            </button>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onToggleBlock(c) }}
            title={blocked ? 'Desbloquear (sacar de spam)' : 'Marcar como spam y bloquear'}
            className={`text-xs leading-none transition-all ${
              blocked ? 'grayscale-0 opacity-100' : 'grayscale opacity-40 hover:opacity-70'
            }`}
          >
            <Icon as={Ban} size={15} />
          </button>
          <span className="text-[11px] text-gray-400 dark:text-gray-500">{timeLabel(c.lastMessageAt)}</span>
        </div>
      </div>
      {c.contact?.company?.name && (
        <p className="text-[11px] text-gray-400 dark:text-gray-500 truncate mt-0.5">{c.contact.company.name}</p>
      )}
      <div className="flex items-center justify-between gap-2 mt-0.5">
        <p className={`text-xs truncate ${c.unread ? 'text-gray-700 dark:text-gray-300 font-medium' : 'text-gray-400 dark:text-gray-500'}`}>
          {previewText(c.lastMessage)}
        </p>
        {c.unread && <span className="w-2 h-2 rounded-full bg-primary-500 flex-shrink-0" />}
      </div>
      <div className="flex items-center gap-1.5 flex-wrap">
        {closingMs !== null && (
          <span
            title="Pasado ese plazo, para retomar el chat hay que mandar una plantilla"
            className="inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400"
          >
            {closingLabel(closingMs)}
          </span>
        )}
        {!c.contact && (
          <button
            onClick={(e) => { e.stopPropagation(); onLinkContact(c) }}
            className="inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 hover:bg-amber-200 dark:hover:bg-amber-900/50"
          >
            Sin vincular · Vincular a un contacto
          </button>
        )}
        {c.leadId && (
          <button
            onClick={(e) => { e.stopPropagation(); onOpenLead(c.leadId) }}
            className="inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded-full bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400 hover:bg-primary-200 dark:hover:bg-primary-900/50"
          >
            Abrir lead
          </button>
        )}
      </div>
    </button>
  )
}

// Lista de conversaciones (fijadas primero, después más reciente primero —
// mismo orden que ya resuelve el backend). Cada fila muestra el nombre del
// Contact vinculado si matcheó, si no el número + nombre de perfil de
// WhatsApp (informativo) con un botón para vincularlo a mano (Fase 2 del plan
// — el matching automático por teléfono no cubre todos los casos). Si el
// contacto está vinculado, además muestra su empresa y un atajo para abrir el
// lead asociado (resuelto server-side en listConversations).
export default function WhatsappConversationList({ conversations, activeId, onSelect, onLinkContact, onOpenLead, onTogglePin, onToggleBlock, onToggleRead, search, viewingBlocked, filter = 'all', now = Date.now() }) {
  const activeFilter = CONVERSATION_FILTERS.find(f => f.key === filter) || CONVERSATION_FILTERS[0]
  if (conversations.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <p className="text-sm text-gray-400 dark:text-gray-500 text-center">
          {search
            ? `No encontramos chats${activeFilter.searchSuffix || ''} que coincidan con "${search}".`
            : activeFilter.empty
              ? activeFilter.empty
              : viewingBlocked
              ? 'No hay conversaciones marcadas como spam.'
              : 'Todavía no llegó ningún mensaje. En cuanto un lead escriba al número conectado, aparece acá.'}
        </p>
      </div>
    )
  }

  // La vista de spam (viewingBlocked) ya viene filtrada 1 a 1 del backend
  // (?blocked=true) — no tiene sentido de "fijados" (se ocultan al bloquear).
  const pinned = viewingBlocked ? [] : conversations.filter(c => c.pinnedAt)
  const rest = viewingBlocked ? conversations : conversations.filter(c => !c.pinnedAt)

  return (
    <div className="flex-1 overflow-y-auto">
      {pinned.length > 0 && (
        <>
          <p className="px-4 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
            Fijados
          </p>
          {pinned.map(c => (
            <ConversationRow key={c.id} c={c} active={c.id === activeId} now={now} onSelect={onSelect} onLinkContact={onLinkContact} onOpenLead={onOpenLead} onTogglePin={onTogglePin} onToggleBlock={onToggleBlock} onToggleRead={onToggleRead} />
          ))}
          <p className="px-4 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
            Chats
          </p>
        </>
      )}
      {rest.map(c => (
        <ConversationRow key={c.id} c={c} active={c.id === activeId} now={now} onSelect={onSelect} onLinkContact={onLinkContact} onOpenLead={onOpenLead} onTogglePin={onTogglePin} onToggleBlock={onToggleBlock} onToggleRead={onToggleRead} />
      ))}
    </div>
  )
}
