import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import Navbar from '../components/Navbar'
import LoadingSpinner from '../components/LoadingSpinner'
import api from '../api/client'
import { useAuth } from '../context/AuthContext'
import { useChat } from '../context/ChatContext'
import useMembers from '../hooks/useMembers'
import useChannelConversation from '../components/chat/useChannelConversation'
import ChatConversation from '../components/chat/ChatConversation'
import ChannelContext from '../components/chat/ChannelContext'
import ChannelSwitcher from '../components/chat/ChannelSwitcher'
import ChannelFormModal from '../components/chat/ChannelFormModal'
import ChannelSearch from '../components/chat/ChannelSearch'
import ChatSoundToggle from '../components/chat/ChatSoundToggle'
import { Icon } from '../components/ui/Icon'
import { Lock, LockOpen, Search, Settings, Volume2, MessagesSquare } from 'lucide-react'

// Chat como página (desktop). El panel flotante sigue existiendo para mobile.
//
// El canal vive en la URL (`/chat/:slug`) y no en estado local: así el link de un canal
// se puede compartir, sobrevive a un F5 y el ítem de la barra se ilumina solo (isActive
// ya matchea por prefijo). `?msg=<id>` abre el canal parado en un mensaje puntual — es
// lo que usa una notificación de mención, que ya traía `chatMessageId` sin que nadie lo
// aprovechara.
//
// El estado de la conversación es el MISMO hook que usa el panel
// (`useChannelConversation`), y el cuerpo el mismo componente (`ChatConversation`).
// Lo propio de la página son las columnas de los costados: canales a la izquierda,
// contexto a la derecha (hilo, fijados, archivos, proyecto).

export default function Chat() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { user } = useAuth()
  const {
    channels = [], loaded = false, loadChannels,
    soundPref = 'mentions', setSoundPref = () => {},
  } = useChat() || {}

  const members = useMembers().members.filter(m => m.active)
  const [channelForm, setChannelForm] = useState(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [thread, setThread] = useState(null)

  const activeChannel = slug ? channels.find(c => c.slug === slug) || null : null

  // `?msg=` se consume UNA vez: después se saca de la URL para que un F5 no vuelva a
  // saltar al mismo mensaje viejo.
  const msgParam = searchParams.get('msg')
  const initialAroundRef = useRef(msgParam)
  useEffect(() => {
    if (!msgParam) return
    setSearchParams(prev => {
      const p = Object.fromEntries(prev.entries())
      delete p.msg
      return p
    }, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [msgParam])

  const conv = useChannelConversation({
    channel: activeChannel,
    enabled: true,
    initialAroundId: initialAroundRef.current,
  })

  // La página ocupa el alto que le queda, sin inventar un 100dvh: arriba suyo puede
  // haber banners (trial, anuncio, verificación de email) que entran y salen, y la
  // barra superior de mobile. Se mide la posición real del contenedor.
  const shellRef = useRef(null)
  const [shellHeight, setShellHeight] = useState(null)
  const measure = useCallback(() => {
    if (!shellRef.current) return
    const top = shellRef.current.getBoundingClientRect().top
    setShellHeight(`calc(100dvh - ${Math.max(0, Math.round(top))}px - 1rem)`)
  }, [])
  useEffect(() => {
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [measure, loaded, activeChannel?.id])

  useEffect(() => { setSearchOpen(false); setThread(null) }, [activeChannel?.id])

  function openChannel(channel) {
    navigate(`/chat/${channel.slug}`)
  }

  async function handleTogglePrivacy() {
    if (!activeChannel) return
    try {
      await api.patch(`/chat/channels/${activeChannel.id}/privacy`, { isPrivate: !activeChannel.isPrivate })
      await loadChannels()
    } catch (err) {
      alert(err.response?.data?.error || 'No se pudo actualizar la privacidad del canal')
    }
  }

  function handleChannelSaved(channel) {
    setChannelForm(null)
    loadChannels().then(() => navigate(`/chat/${channel.slug}`))
  }

  function handleChannelDeleted() {
    setChannelForm(null)
    loadChannels()
    navigate('/chat')
  }

  // Saltar a un mensaje desde el contexto (un pin, un archivo, el raíz de un hilo) o
  // desde la búsqueda: cierra la búsqueda y usa el mismo `around` de siempre.
  function jumpTo(message) {
    setSearchOpen(false)
    conv.actions.jumpTo(message)
  }

  // Responder abre el hilo del mensaje en la columna de contexto (y deja la cita
  // armada, igual que en el panel). Si el mensaje ya era una respuesta, el hilo que se
  // abre es el del original: `replyToId` es de un solo nivel.
  function openThread(message) {
    if (!message) { conv.setReplyingTo(null); return }
    conv.setReplyingTo(message)
    setThread(message.replyTo || message)
  }

  if (!user) return null

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Navbar />
      <main className="px-4 pb-4">
        <div
          ref={shellRef}
          style={shellHeight ? { height: shellHeight } : undefined}
          className="flex rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden min-h-[32rem]"
        >
          {/* Canales a la vista, sin dropdown: en el panel había que abrir un menú para
              ver cuáles tienen mensajes sin leer. */}
          <div className="hidden md:flex w-64 flex-shrink-0 flex-col border-r border-gray-200 dark:border-gray-700">
            <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between gap-2 flex-shrink-0">
              <h1 className="font-semibold text-gray-900 dark:text-white">Chat</h1>
              <ChatSoundToggle pref={soundPref} onChange={setSoundPref} />
            </div>
            {loaded ? (
              <ChannelSwitcher
                fullscreen
                channels={channels}
                activeChannelId={activeChannel?.id ?? null}
                onSelect={openChannel}
                isAdmin={!!user?.isAdmin}
                onCreateChannel={() => setChannelForm(true)}
              />
            ) : (
              <LoadingSpinner size="sm" className="flex-1" />
            )}
          </div>

          {/* Conversación */}
          <div className="flex-1 min-w-0 flex flex-col">
            {!loaded ? (
              <LoadingSpinner className="flex-1" />
            ) : !activeChannel ? (
              <div className="flex-1 flex flex-col">
                {/* En mobile no hay columna de canales: la lista ocupa todo. */}
                <div className="md:hidden flex-1 min-h-0 flex flex-col">
                  <ChannelSwitcher
                    fullscreen
                    channels={channels}
                    activeChannelId={null}
                    onSelect={openChannel}
                    isAdmin={!!user?.isAdmin}
                    onCreateChannel={() => setChannelForm(true)}
                  />
                </div>
                <div className="hidden md:flex flex-1 items-center justify-center text-center px-6">
                  <div>
                    <Icon as={MessagesSquare} size={32} strokeWidth={1.5} className="text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                    <p className="font-medium text-gray-600 dark:text-gray-300">Elegí un canal</p>
                    <p className="text-sm text-gray-400 mt-1">Los que tienen mensajes sin leer están marcados.</p>
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 dark:border-gray-700 flex-shrink-0">
                  <h2 className="font-semibold text-gray-900 dark:text-white truncate min-w-0 flex-1">
                    {activeChannel.isPrivate
                      ? <Icon as={Lock} size={14} className="inline-block align-[-2px] mr-1" />
                      : activeChannel.medium === 'voice'
                        ? <Icon as={Volume2} size={15} className="inline-block align-[-2px] mr-1" />
                        : '# '}
                    {activeChannel.name}
                  </h2>
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
                    onClick={() => setSearchOpen(v => !v)}
                    title="Buscar en este canal"
                    className={`p-1.5 rounded-lg flex-shrink-0 transition-colors ${searchOpen
                      ? 'text-primary-600 bg-primary-50 dark:bg-primary-900/20 dark:text-primary-400'
                      : 'text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                  >
                    <Icon as={Search} size={16} />
                  </button>
                </div>

                {searchOpen ? (
                  // En la página, un resultado LLEVA al mensaje dentro del hilo real
                  // (el panel sigue mostrándolo inline).
                  <ChannelSearch channelId={activeChannel.id} onClose={() => setSearchOpen(false)} onJump={jumpTo} />
                ) : (
                  <ChatConversation
                    channel={activeChannel}
                    conv={conv}
                    currentUserId={user?.id}
                    canModerate={!!user?.isAdmin}
                    members={members}
                    showPinnedBar={false}
                    onReply={openThread}
                  />
                )}
              </>
            )}
          </div>

          {activeChannel && !searchOpen && (
            <ChannelContext
              channel={activeChannel}
              conv={conv}
              thread={thread}
              onCloseThread={() => setThread(null)}
              currentUserId={user?.id}
              canModerate={!!user?.isAdmin}
              members={members}
              onJump={jumpTo}
            />
          )}
        </div>
      </main>

      {channelForm && (
        <ChannelFormModal
          channel={channelForm === true ? null : channelForm}
          onClose={() => setChannelForm(null)}
          onSaved={handleChannelSaved}
          onDeleted={handleChannelDeleted}
        />
      )}
    </div>
  )
}
