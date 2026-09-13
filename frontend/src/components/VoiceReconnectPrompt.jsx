import { useVoiceCall } from '../context/VoiceCallContext'

// Banner flotante ofreciendo reconectar a la sala de voz en la que estaba el usuario
// antes de un F5 completo (ver voiceCallSession.js) — nunca reconecta sola, siempre
// requiere el click explícito para no reactivar el micrófono sin avisar. Mutuamente
// excluyente con VoiceCallIndicator (uno pide !activeCall, el otro activeCall),
// misma esquina del FloatingDock.
export default function VoiceReconnectPrompt() {
  const { pendingReconnect, activeCall, acceptReconnect, dismissReconnect } = useVoiceCall() || {}
  if (!pendingReconnect || activeCall) return null

  return (
    <div className="fixed bottom-6 left-6 z-40 flex items-center gap-2 bg-white dark:bg-gray-800 pl-3 pr-2 py-2 rounded-full shadow-lg border border-gray-200 dark:border-gray-700">
      <span className="text-sm text-gray-700 dark:text-gray-200 truncate max-w-[180px]">
        🔊 Estabas en «{pendingReconnect.channelName}» — ¿reconectar?
      </span>
      <button
        onClick={acceptReconnect}
        className="text-xs font-semibold px-2.5 py-1 bg-primary-600 hover:bg-primary-700 text-white rounded-full transition-colors flex-shrink-0"
      >
        Reconectar
      </button>
      <button
        onClick={dismissReconnect}
        title="Descartar"
        className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 flex-shrink-0"
      >
        ✕
      </button>
    </div>
  )
}
