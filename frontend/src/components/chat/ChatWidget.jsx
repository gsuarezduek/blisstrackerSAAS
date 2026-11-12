import { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import api from '../../api/client'
import { useAuth } from '../../context/AuthContext'
import { useChat } from '../../context/ChatContext'
import useMembers from '../../hooks/useMembers'
import useChannelConversation from './useChannelConversation'
import ChatConversation from './ChatConversation'
import LoadingSpinner from '../LoadingSpinner'
import ChannelSwitcher from './ChannelSwitcher'
import ChannelFormModal from './ChannelFormModal'
import ChannelSearch from './ChannelSearch'
import ChatSoundToggle from './ChatSoundToggle'
import FeedbackModal from '../FeedbackModal'
import { Lock, LockOpen, Menu, Search, Settings, Volume2 } from 'lucide-react'
import { Icon } from '../ui/Icon'

// Panel de Chat interno — **el camino de MOBILE**. En desktop el chat es una página
// (`/chat`, pages/Chat.jsx) y el evento `bliss:open-chat` navega en vez de abrir esto;
// el botón flotante que lo dispara ya se ocultaba desde `lg` (ver FloatingDock).
//
// El estado de la conversación NO vive acá: está en `useChannelConversation`, y el
// cuerpo (mensajes + input + pins) en `ChatConversation` — los mismos que usa la
// página, para no mantener dos implementaciones. Acá queda solo el chrome del overlay:
// abrir/cerrar, qué canal está activo, el switcher y los modales.
//
// Deep-link desde cualquier lugar de la app vía el evento `bliss:open-chat`.
export default function ChatWidget() {
  const { user } = useAuth()
  const {
    channels = [], loaded = false, loadChannels,
    soundPref = 'mentions', setSoundPref = () => {},
  } = useChat() || {}
  const navigate = useNavigate()
  const location = useLocation()

  const [open, setOpen] = useState(false)
  const [activeSlug, setActiveSlug] = useState(null)
  const [switcherOpen, setSwitcherOpen] = useState(false)
  const [channelForm, setChannelForm] = useState(null) // null | true (crear) | channel (editar)
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const switcherRef = useRef(null)

  // `useMembers` ya trae los miembros activos con caché a nivel de módulo; antes este
  // componente hacía su propio GET al abrirse.
  const members = useMembers().members.filter(m => m.active)

  // Sin fallback a #general/primero: si no hay un canal elegido en la sesión,
  // activeChannel queda null y se muestra el listado completo en vez de caer directo a
  // un canal que la mayoría de las veces no es al que se quiere ir.
  const activeChannel = activeSlug ? channels.find(c => c.slug === activeSlug) || null : null

  // La página monta su propia conversación: si el panel siguiera vivo sobre /chat
  // habría dos instancias del mismo canal — dos `join-channel`, dos `POST /read` y un
  // `scrollToMessage` pegándole al DOM equivocado.
  const onChatPage = location.pathname === '/chat' || location.pathname.startsWith('/chat/')

  const conv = useChannelConversation({ channel: activeChannel, enabled: open && !onChatPage })

  useEffect(() => {
    function handleOpenChat(e) {
      const slug = e.detail?.slug
      const msg = e.detail?.messageId
      // En DESKTOP el chat es una página. El breakpoint se evalúa al recibir el evento
      // (no al montar), así cualquier emisor — la campana, el buscador, el indicador de
      // llamada — sigue funcionando sin saber nada de esto.
      if (window.matchMedia('(min-width: 1024px)').matches) {
        const qs = msg ? `?msg=${msg}` : ''
        navigate(slug ? `/chat/${slug}${qs}` : '/chat')
        return
      }
      // Un deep-link con slug va directo a ese canal. Sin slug (ícono del dock), NO se
      // toca activeSlug — se mantiene el último canal elegido en la sesión, o el
      // listado completo si todavía no se eligió ninguno.
      if (slug) setActiveSlug(slug)
      setOpen(true)
    }
    window.addEventListener('bliss:open-chat', handleOpenChat)
    return () => window.removeEventListener('bliss:open-chat', handleOpenChat)
  }, [navigate])

  useEffect(() => {
    function handleClickOutside(e) {
      if (switcherRef.current && !switcherRef.current.contains(e.target)) setSwitcherOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Al cambiar de canal se cierra la búsqueda abierta (vivía en el efecto de carga).
  useEffect(() => { setSearchOpen(false) }, [activeChannel?.id])

  async function handleTogglePrivacy() {
    if (!activeChannel) return
    const isPrivate = !activeChannel.isPrivate
    try {
      await api.patch(`/chat/channels/${activeChannel.id}/privacy`, { isPrivate })
      await loadChannels()
    } catch (err) {
      alert(err.response?.data?.error || 'No se pudo actualizar la privacidad del canal')
    }
  }

  function handleSelectChannel(channel) {
    setSwitcherOpen(false)
    setActiveSlug(channel.slug)
  }

  function handleChannelSaved(channel) {
    setChannelForm(null)
    loadChannels().then(() => setActiveSlug(channel.slug))
  }

  function handleChannelDeleted() {
    setChannelForm(null)
    loadChannels()
    setActiveSlug(null)
  }

  if (!user) return null

  return (
    <>
      {open && !onChatPage && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:justify-end sm:pr-6 sm:pb-24">
          <div className="absolute inset-0 bg-black/30" onClick={() => setOpen(false)} />
          <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full sm:w-[400px] mx-4 sm:mx-0 h-[85vh] sm:h-[600px] flex flex-col z-10">
            {!loaded ? (
              <LoadingSpinner size="sm" className="flex-1" />
            ) : !activeChannel ? (
              <>
                <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-gray-100 dark:border-gray-700 flex-shrink-0">
                  <h3 className="font-semibold text-gray-900 dark:text-white">Chat</h3>
                  <button
                    onClick={() => setOpen(false)}
                    className="text-xl text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 leading-none flex-shrink-0"
                  >
                    ×
                  </button>
                </div>
                <ChannelSwitcher
                  fullscreen
                  channels={channels}
                  activeChannelId={null}
                  onSelect={handleSelectChannel}
                  isAdmin={!!user?.isAdmin}
                  onCreateChannel={() => setChannelForm(true)}
                  onFeedback={() => setFeedbackOpen(true)}
                />
              </>
            ) : (
              <>
                <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 dark:border-gray-700 flex-shrink-0">
                  <button
                    onClick={() => setActiveSlug(null)}
                    title="Ver todos los canales"
                    className="p-1.5 text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 flex-shrink-0"
                  >
                    <Icon as={Menu} size={16} />
                  </button>
                  <div ref={switcherRef} className="relative min-w-0 flex-1">
                    <button
                      onClick={() => setSwitcherOpen(v => !v)}
                      className="flex items-center gap-1 font-semibold text-gray-900 dark:text-white hover:text-primary-600 dark:hover:text-primary-400 transition-colors max-w-full"
                    >
                      <span className="truncate">{activeChannel.isPrivate ? <Icon as={Lock} size={14} className="inline-block align-[-2px] mr-1" /> : activeChannel.medium === 'voice' ? <Icon as={Volume2} size={15} className="inline-block align-[-2px] mr-1" /> : '# '}{activeChannel.name}</span>
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"
                        className={`w-3.5 h-3.5 flex-shrink-0 transition-transform ${switcherOpen ? 'rotate-180' : ''}`}>
                        <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                      </svg>
                    </button>
                    {switcherOpen && (
                      <ChannelSwitcher
                        channels={channels}
                        activeChannelId={activeChannel.id}
                        onSelect={handleSelectChannel}
                        isAdmin={!!user?.isAdmin}
                        onCreateChannel={() => { setSwitcherOpen(false); setChannelForm(true) }}
                        onFeedback={() => { setSwitcherOpen(false); setFeedbackOpen(true) }}
                      />
                    )}
                  </div>
                  {user?.isAdmin && activeChannel.kind === 'custom' && (
                    <button
                      onClick={() => setChannelForm(activeChannel)}
                      title="Editar canal"
                      className="p-1.5 text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 flex-shrink-0"
                    >
                      <Icon as={Settings} size={16} />
                    </button>
                  )}
                  {user?.isAdmin && (
                    <button
                      onClick={handleTogglePrivacy}
                      title={activeChannel.isPrivate ? 'Canal privado — clic para abrirlo a todo el equipo' : 'Canal abierto — clic para hacerlo privado (solo administradores)'}
                      className="p-1.5 text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 flex-shrink-0"
                    >
                      {activeChannel.isPrivate ? <Icon as={Lock} size={16} /> : <Icon as={LockOpen} size={16} />}
                    </button>
                  )}
                  <button
                    onClick={() => setSearchOpen(true)}
                    title="Buscar en este canal"
                    className="p-1.5 text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 flex-shrink-0"
                  >
                    <Icon as={Search} size={16} />
                  </button>
                  <ChatSoundToggle pref={soundPref} onChange={setSoundPref} />
                  <button
                    onClick={() => setOpen(false)}
                    className="text-xl text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 leading-none flex-shrink-0"
                  >
                    ×
                  </button>
                </div>

                {searchOpen ? (
                  <ChannelSearch channelId={activeChannel.id} onClose={() => setSearchOpen(false)} />
                ) : (
                  <ChatConversation
                    channel={activeChannel}
                    conv={conv}
                    currentUserId={user?.id}
                    canModerate={!!user?.isAdmin}
                    members={members}
                  />
                )}
              </>
            )}
          </div>
        </div>
      )}

      {channelForm && (
        <ChannelFormModal
          channel={channelForm === true ? null : channelForm}
          onClose={() => setChannelForm(null)}
          onSaved={handleChannelSaved}
          onDeleted={handleChannelDeleted}
        />
      )}

      <FeedbackModal open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
    </>
  )
}
