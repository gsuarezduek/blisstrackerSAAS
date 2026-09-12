import { useVoiceCall } from '../context/VoiceCallContext'

// Indicador flotante persistente de la llamada de voz activa — visible mientras el
// panel de Chat está cerrado o mirando otro canal (la llamada sobrevive a que el
// panel se cierre, ver VoiceCallContext.jsx). Esquina opuesta al FloatingDock
// (bottom-right) para no superponerse.
export default function VoiceCallIndicator() {
  const { activeCall, toggleMute, leaveCall } = useVoiceCall() || {}
  if (!activeCall) return null

  function reopen() {
    window.dispatchEvent(new CustomEvent('bliss:open-chat', { detail: { slug: activeCall.channelSlug } }))
  }

  return (
    <div className="fixed bottom-6 left-6 z-40 flex items-center gap-2 bg-white dark:bg-gray-800 pl-3 pr-2 py-2 rounded-full shadow-lg border border-gray-200 dark:border-gray-700">
      <button onClick={reopen} className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:text-primary-600 dark:hover:text-primary-400 transition-colors">
        <span className="relative flex h-2 w-2 flex-shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
        </span>
        <span className="truncate max-w-[140px]">🔊 {activeCall.channelName}</span>
      </button>
      <button
        onClick={toggleMute}
        title={activeCall.muted ? 'Desmutear' : 'Mutear'}
        className="p-1.5 text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"
      >
        {activeCall.muted ? '🔇' : '🎙️'}
      </button>
      <button
        onClick={leaveCall}
        title="Salir de la llamada"
        className="p-1.5 text-gray-400 hover:text-red-600 dark:hover:text-red-400 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"
      >
        ✕
      </button>
    </div>
  )
}
