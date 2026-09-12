import { useVoiceCall } from '../../context/VoiceCallContext'

// Barra de sala de voz, insertada arriba del chat de texto normal cuando el canal
// activo es medium:'voice' (ChatWidget.jsx). El canal sigue teniendo su MessageList/
// MessageInput debajo sin cambios — esto es solo la parte de audio en vivo.
export default function VoiceRoomBar({ channel }) {
  const { activeCall, voicePresence, joinCall, leaveCall, toggleMute } = useVoiceCall() || {}
  const inCall = activeCall?.channelId === channel.id
  const preview = voicePresence?.get(channel.id) || []

  if (!inCall) {
    return (
      <div className="px-4 py-2.5 border-b border-gray-100 dark:border-gray-700 flex-shrink-0 space-y-2">
        {preview.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {preview.map(p => (
              <span key={p.userId} className="flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                🎙️ {p.name}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-xs text-gray-500 dark:text-gray-400">🔊 Nadie conectado todavía</p>
        )}
        <button
          onClick={() => joinCall(channel)}
          className="text-xs font-semibold px-3 py-1.5 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors"
        >
          🎙️ Unirse{preview.length > 0 ? ` (${preview.length})` : ''}
        </button>
      </div>
    )
  }

  return (
    <div className="px-4 py-2.5 border-b border-gray-100 dark:border-gray-700 flex-shrink-0 space-y-2">
      <div className="flex flex-wrap gap-1.5">
        <span className="flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">
          {activeCall.muted ? '🔇' : '🎙️'} Vos
        </span>
        {activeCall.participants.map(p => (
          <span key={p.socketId} className="flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
            {p.muted ? '🔇' : '🎙️'} {p.name}
          </span>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={toggleMute}
          className="text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
        >
          {activeCall.muted ? '🔇 Desmutear' : '🎙️ Mutear'}
        </button>
        <button
          onClick={leaveCall}
          className="text-xs font-medium px-3 py-1.5 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors"
        >
          Salir
        </button>
      </div>
    </div>
  )
}
