import MessageList from './MessageList'
import MessageInput from './MessageInput'
import PinnedBar from './PinnedBar'
import VoiceRoomBar from './VoiceRoomBar'

// El cuerpo de una conversación: sala de voz + pins + mensajes + "está escribiendo" +
// el input. Lo comparten el panel flotante (ChatWidget.jsx, que es el único camino en
// mobile) y la página (pages/Chat.jsx).
//
// El HEADER no va acá a propósito: el del panel es compacto y lleva la × de cerrar, el
// de la página es ancho y no cierra nada. Lo único que comparten es lo de abajo.
//
// `conv` es lo que devuelve `useChannelConversation`. `showPinnedBar` se apaga en la
// página, que muestra los pins completos en su columna de contexto en vez de
// recortados a una línea. `onReply` también lo sobreescribe la página: ahí responder
// abre el hilo del mensaje al costado, además de citar.
export default function ChatConversation({
  channel, conv, currentUserId, canModerate, members, showPinnedBar = true, onReply,
}) {
  const { messages, msgLoading, loadingMore, hasMore, firstUnreadMessageId,
    pinned, replyingTo, setReplyingTo, typingUsers, jumpMode, jumpToMessageId,
    onJumpHandled, actions } = conv

  return (
    <>
      {channel.isPrivate && (
        <div className="px-4 py-1.5 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-100 dark:border-amber-800/40 flex-shrink-0">
          <p className="text-[11px] font-medium text-amber-700 dark:text-amber-300">
            Canal privado — solo lo ven los administradores.
          </p>
        </div>
      )}

      {channel.medium === 'voice' && <VoiceRoomBar channel={channel} />}

      {showPinnedBar && <PinnedBar pinned={pinned} onUnpin={actions.togglePin} onJump={actions.jumpTo} />}

      <div className="relative flex-1 min-h-0 flex flex-col">
        <MessageList
          key={channel.id}
          messages={messages}
          loading={msgLoading}
          loadingMore={loadingMore}
          hasMore={hasMore}
          onLoadMore={actions.loadMore}
          firstUnreadMessageId={firstUnreadMessageId}
          currentUserId={currentUserId}
          canModerate={canModerate}
          members={members}
          projectId={channel.projectId}
          onSaveEdit={actions.saveEdit}
          onDelete={actions.remove}
          onTogglePin={actions.togglePin}
          onToggleReaction={actions.toggleReaction}
          onReply={onReply || setReplyingTo}
          jumpToMessageId={jumpToMessageId}
          onJumpHandled={onJumpHandled}
        />
        {jumpMode && (
          <button
            onClick={actions.returnToRecent}
            className="absolute bottom-2 left-1/2 -translate-x-1/2 text-xs font-medium bg-gray-800/90 dark:bg-gray-700/90 text-white px-3 py-1.5 rounded-full shadow-lg hover:bg-gray-900 dark:hover:bg-gray-600 transition-colors"
          >
            ↓ Volver a mensajes recientes
          </button>
        )}
      </div>

      {typingUsers.length > 0 && (
        <p className="px-4 pt-1 text-xs italic text-gray-400 dark:text-gray-500 flex-shrink-0">
          {typingUsers.length === 1
            ? `${typingUsers[0].name} está escribiendo...`
            : typingUsers.length === 2
              ? `${typingUsers[0].name} y ${typingUsers[1].name} están escribiendo...`
              : 'Varias personas están escribiendo...'}
        </p>
      )}

      <MessageInput
        onSend={actions.send}
        onSendMedia={actions.sendMedia}
        members={members}
        replyingTo={replyingTo}
        onCancelReply={() => setReplyingTo(null)}
        channelId={channel.id}
        projectId={channel.projectId}
      />
    </>
  )
}
