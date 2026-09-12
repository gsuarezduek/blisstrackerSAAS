import { useState } from 'react'
import { useChat } from '../context/ChatContext'
import useActiveGames from '../hooks/useActiveGames'
import ChatWidget from './chat/ChatWidget'
import GamificationFab from './GamificationFab'
import VoiceCallIndicator from './VoiceCallIndicator'

// Punto único de entrada para los widgets flotantes que antes se apilaban
// verticalmente en la esquina inferior derecha (bottom-6 / bottom-24 / bottom-[168px]):
// nueva tarea, chat y gamification. No absorbe la lógica de cada uno — solo decide
// cuándo mostrar el trigger + badge, y dispara la MISMA señal (`window` CustomEvent)
// que ya escuchan esos componentes para abrirse, así los deep-links externos
// (NotificationBell.jsx, ProjectDetail.jsx → bliss:open-chat/bliss:open-game)
// siguen funcionando sin ningún cambio.
export default function FloatingDock() {
  const [menuOpen, setMenuOpen] = useState(false)
  const { unreadChannelsCount = 0, mentionChannelsCount = 0 } = useChat() || {}
  const { visible: gamificationVisible, newCount: gameNewCount } = useActiveGames()

  function openTask() {
    setMenuOpen(false)
    window.dispatchEvent(new CustomEvent('bliss:open-add-task'))
  }
  function openChat() {
    setMenuOpen(false)
    window.dispatchEvent(new CustomEvent('bliss:open-chat'))
  }
  function openGames() {
    setMenuOpen(false)
    window.dispatchEvent(new CustomEvent('bliss:open-game'))
  }

  const chatBadge = mentionChannelsCount > 0 ? { n: mentionChannelsCount } : unreadChannelsCount > 0 ? { dot: true } : null
  const gamesBadge = gameNewCount > 0 ? { n: gameNewCount } : null

  // Badge del botón principal (colapsado): el más urgente entre los widgets.
  const mainBadge = chatBadge?.n ? chatBadge : gamesBadge?.n ? gamesBadge : chatBadge?.dot ? chatBadge : null

  const items = [
    { key: 'task', icon: '➕', label: 'Nueva tarea', onClick: openTask, badge: null },
    { key: 'chat', icon: '💬', label: 'Chat', onClick: openChat, badge: chatBadge },
    ...(gamificationVisible ? [{ key: 'games', icon: '🏆', label: 'Juegos', onClick: openGames, badge: gamesBadge }] : []),
  ]

  return (
    <>
      {/* Paneles reales — sin botón propio, se abren escuchando los eventos `bliss:open-*` */}
      <ChatWidget />
      <GamificationFab />
      <VoiceCallIndicator />

      {menuOpen && (
        <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} />
      )}

      {menuOpen && (
        <div className="fixed bottom-24 right-6 z-40 flex flex-col-reverse gap-3 items-end">
          {items.map(item => (
            <button
              key={item.key}
              onClick={item.onClick}
              className="relative flex items-center gap-2 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 pl-3 pr-4 py-2 rounded-full shadow-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-all"
            >
              <span className="text-lg leading-none">{item.icon}</span>
              <span className="text-sm font-medium whitespace-nowrap">{item.label}</span>
              {item.badge?.n > 0 && (
                <span className="absolute -top-1 -left-1 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold leading-none ring-2 ring-white dark:ring-gray-800">
                  {item.badge.n > 9 ? '9+' : item.badge.n}
                </span>
              )}
              {item.badge?.dot && (
                <span className="absolute top-0.5 left-0.5 w-2.5 h-2.5 rounded-full bg-gray-300 ring-2 ring-white dark:ring-gray-800" />
              )}
            </button>
          ))}
        </div>
      )}

      <button
        onClick={() => setMenuOpen(v => !v)}
        title={menuOpen ? 'Cerrar' : 'Accesos rápidos'}
        className="fixed bottom-6 right-6 z-40 bg-primary-600 hover:bg-primary-700 text-white rounded-full w-12 h-12 flex items-center justify-center shadow-lg transition-all hover:scale-110"
      >
        <span className={`text-2xl leading-none transition-transform duration-150 ${menuOpen ? 'rotate-45' : ''}`}>+</span>
        {!menuOpen && mainBadge?.n > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold leading-none ring-2 ring-white dark:ring-gray-800">
            {mainBadge.n > 9 ? '9+' : mainBadge.n}
          </span>
        )}
        {!menuOpen && !mainBadge?.n && mainBadge?.dot && (
          <span className="absolute top-0.5 right-0.5 w-2.5 h-2.5 rounded-full bg-gray-300 ring-2 ring-white dark:ring-gray-800" />
        )}
      </button>
    </>
  )
}
