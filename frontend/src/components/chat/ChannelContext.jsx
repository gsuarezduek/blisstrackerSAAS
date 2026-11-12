import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import api from '../../api/client'
import LoadingSpinner from '../LoadingSpinner'
import MessageList from './MessageList'
import MessageInput from './MessageInput'
import { avatarUrl } from '../../utils/avatarUrl'
import { chatAttachmentUrl } from '../../utils/chatAttachmentUrl'
import { Icon } from '../ui/Icon'
import { Pin, Paperclip, MessagesSquare, FolderKanban, X } from 'lucide-react'

// La tercera columna de la página de chat: lo que rodea a la conversación y que en un
// panel de 400px no entraba — el hilo de un mensaje, los pins completos (no recortados
// a una línea), lo que se compartió en el canal, y la ficha del proyecto si el canal es
// de uno.
//
// Es la diferencia real entre "la página" y "el panel agrandado": acá se ven DOS listas
// de mensajes a la vez (la conversación y el hilo), que es justamente lo que no se podía.

function fmtDate(iso) {
  return new Date(iso).toLocaleString('es-AR', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    timeZone: 'America/Argentina/Buenos_Aires',
  })
}

function fmtSize(bytes) {
  if (!bytes) return ''
  const mb = bytes / (1024 * 1024)
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`
}

function Empty({ children }) {
  return <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-8">{children}</p>
}

/** Hilo: el mensaje raíz + sus respuestas, y un input que responde a ese mensaje. */
function ThreadPanel({ message, channel, currentUserId, canModerate, members, conv, onJump }) {
  const [state, setState] = useState({ loading: true, root: null, replies: [] })

  useEffect(() => {
    let alive = true
    setState({ loading: true, root: null, replies: [] })
    api.get(`/chat/messages/${message.id}/replies`)
      .then(({ data }) => { if (alive) setState({ loading: false, root: data.root, replies: data.replies }) })
      .catch(() => { if (alive) setState({ loading: false, root: message, replies: [] }) })
    return () => { alive = false }
  }, [message.id])

  // El socket del canal ya refresca `conv.messages`; cuando llega una respuesta nueva a
  // este mensaje, se agrega al hilo sin volver a pedirlo.
  const liveReplies = conv.messages.filter(m => m.replyTo?.id === message.id || m.replyToId === message.id)
  const replies = [...state.replies]
  for (const m of liveReplies) if (!replies.some(r => r.id === m.id)) replies.push(m)
  replies.sort((a, b) => a.id - b.id)

  if (state.loading) return <LoadingSpinner size="sm" className="py-8" />

  const root = state.root || message

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-700 flex-shrink-0">
        <button
          type="button"
          onClick={() => onJump(root)}
          className="w-full text-left text-xs text-gray-500 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400"
        >
          <span className="flex items-center gap-1.5 mb-1">
            {root.author && <img src={avatarUrl(root.author.avatar)} alt="" className="w-4 h-4 rounded-full object-cover" />}
            <span className="font-semibold">{root.author?.name || 'Sistema'}</span>
            <span>{fmtDate(root.createdAt)}</span>
          </span>
          <span className="block text-sm text-gray-700 dark:text-gray-200 line-clamp-3">
            {root.content || (root.gifUrl ? 'GIF' : '')}
          </span>
          <span className="block mt-1 text-[11px] underline">Ver en la conversación</span>
        </button>
      </div>

      <div className="flex-1 min-h-0 flex flex-col">
        {replies.length === 0 ? (
          <Empty>Todavía nadie respondió. Escribí abajo para arrancar el hilo.</Empty>
        ) : (
          <MessageList
            key={`thread-${root.id}`}
            messages={replies}
            loading={false}
            loadingMore={false}
            hasMore={false}
            onLoadMore={() => {}}
            firstUnreadMessageId={null}
            currentUserId={currentUserId}
            canModerate={canModerate}
            members={members}
            projectId={channel.projectId}
            onSaveEdit={conv.actions.saveEdit}
            onDelete={conv.actions.remove}
            onTogglePin={conv.actions.togglePin}
            onToggleReaction={conv.actions.toggleReaction}
            onReply={() => {}}
            jumpToMessageId={null}
            onJumpHandled={() => {}}
          />
        )}
      </div>

      <MessageInput
        onSend={(content, gifUrl) => conv.actions.send(content, gifUrl, root.id)}
        onSendMedia={(file, caption) => conv.actions.sendMedia(file, caption, root.id)}
        members={members}
        replyingTo={null}
        onCancelReply={() => {}}
        channelId={channel.id}
        projectId={channel.projectId}
      />
    </div>
  )
}

function PinsPanel({ pinned, onJump, onUnpin }) {
  if (!pinned.length) return <Empty>No hay mensajes fijados en este canal.</Empty>
  return (
    <ul className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1">
      {pinned.map(m => (
        <li key={m.id} className="group rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/60">
          <div className="flex items-start gap-2 p-2">
            <button type="button" onClick={() => onJump(m)} className="min-w-0 flex-1 text-left">
              <span className="flex items-center gap-1.5 mb-0.5">
                {m.author && <img src={avatarUrl(m.author.avatar)} alt="" className="w-4 h-4 rounded-full object-cover" />}
                <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">{m.author?.name || 'Sistema'}</span>
                <span className="text-[11px] text-gray-400">{fmtDate(m.createdAt)}</span>
              </span>
              <span className="block text-sm text-gray-600 dark:text-gray-300 leading-snug line-clamp-3">
                {m.content || (m.gifUrl ? 'GIF' : m.attachment?.fileName || '')}
              </span>
            </button>
            <button
              type="button"
              onClick={() => onUnpin(m)}
              title="Dejar de fijar"
              className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-opacity flex-shrink-0"
            >
              <Icon as={X} size={14} />
            </button>
          </div>
        </li>
      ))}
    </ul>
  )
}

function FilesPanel({ channelId, onJump }) {
  const [state, setState] = useState({ loading: true, messages: [] })

  useEffect(() => {
    let alive = true
    setState({ loading: true, messages: [] })
    api.get(`/chat/channels/${channelId}/files`)
      .then(({ data }) => { if (alive) setState({ loading: false, messages: data.messages || [] }) })
      .catch(() => { if (alive) setState({ loading: false, messages: [] }) })
    return () => { alive = false }
  }, [channelId])

  if (state.loading) return <LoadingSpinner size="sm" className="py-8" />
  if (!state.messages.length) return <Empty>Todavía no se compartió ningún archivo acá.</Empty>

  const images = state.messages.filter(m => m.attachment?.kind === 'image')
  const docs = state.messages.filter(m => m.attachment?.kind !== 'image')

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-4">
      {images.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-2">Imágenes</p>
          <div className="grid grid-cols-3 gap-1.5">
            {images.map(m => (
              <button key={m.id} type="button" onClick={() => onJump(m)} title={m.attachment.fileName} className="aspect-square rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-700">
                <img src={chatAttachmentUrl(m.attachment.id)} alt="" className="w-full h-full object-cover hover:opacity-80 transition-opacity" />
              </button>
            ))}
          </div>
        </div>
      )}
      {docs.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-2">Archivos</p>
          <ul className="space-y-1">
            {docs.map(m => (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => onJump(m)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left hover:bg-gray-50 dark:hover:bg-gray-700/60"
                >
                  <Icon as={Paperclip} size={14} className="text-gray-400 flex-shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-gray-700 dark:text-gray-200 truncate">{m.attachment.fileName}</span>
                    <span className="block text-[11px] text-gray-400">
                      {m.author?.name || 'Sistema'} · {fmtSize(m.attachment.sizeBytes)}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

/** Si el canal es de un proyecto, su estado — sin salir del chat. */
function ProjectPanel({ projectId }) {
  const [project, setProject] = useState(null)

  useEffect(() => {
    let alive = true
    api.get('/projects')
      .then(({ data }) => {
        if (alive) setProject((data || []).find(p => p.id === projectId) || null)
      })
      .catch(() => {})
    return () => { alive = false }
  }, [projectId])

  if (!project) return <LoadingSpinner size="sm" className="py-8" />

  const counts = project.taskCounts || {}
  const stats = [
    { label: 'En curso', value: counts.IN_PROGRESS ?? 0 },
    { label: 'Bloqueadas', value: counts.BLOCKED ?? 0, danger: true },
    { label: 'Pendientes', value: counts.PENDING ?? 0 },
  ]

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-4">
      <p className="font-semibold text-gray-900 dark:text-white mb-1">{project.name}</p>
      <Link to={`/proyectos/${project.id}`} className="text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline">
        Abrir la ficha →
      </Link>
      <div className="grid grid-cols-3 gap-2 mt-4">
        {stats.map(s => (
          <div key={s.label} className="rounded-lg bg-gray-50 dark:bg-gray-700/50 px-2 py-2 text-center">
            <p className={`text-lg font-bold ${s.danger && s.value > 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-800 dark:text-gray-100'}`}>{s.value}</p>
            <p className="text-[11px] text-gray-500 dark:text-gray-400">{s.label}</p>
          </div>
        ))}
      </div>
      {(project.members || []).length > 0 && (
        <div className="mt-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-2">Equipo</p>
          <ul className="space-y-1.5">
            {project.members.map(pm => (
              <li key={pm.user.id} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
                <img src={avatarUrl(pm.user.avatar)} alt="" className="w-5 h-5 rounded-full object-cover" />
                <span className="truncate">{pm.user.name}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

export default function ChannelContext({
  channel, conv, thread, onCloseThread, currentUserId, canModerate, members, onJump,
}) {
  const [tab, setTab] = useState('pins')

  // Abrir un hilo lo trae al frente; cerrarlo vuelve a lo que estaba.
  useEffect(() => { if (thread) setTab('thread') }, [thread])
  useEffect(() => { if (!thread && tab === 'thread') setTab('pins') }, [thread, tab])

  const tabs = [
    ...(thread ? [{ id: 'thread', label: 'Hilo', icon: MessagesSquare }] : []),
    { id: 'pins', label: 'Fijados', icon: Pin, count: conv.pinned.length },
    { id: 'files', label: 'Archivos', icon: Paperclip },
    ...(channel.projectId ? [{ id: 'project', label: 'Proyecto', icon: FolderKanban }] : []),
  ]

  return (
    <aside className="hidden xl:flex w-80 flex-shrink-0 flex-col border-l border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
      <div className="flex items-center gap-0.5 px-2 py-2 border-b border-gray-100 dark:border-gray-700 flex-shrink-0">
        {tabs.map(t => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${tab === t.id
              ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/20 dark:text-primary-400'
              : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
          >
            <Icon as={t.icon} size={13} />
            {t.label}
            {t.count > 0 && <span className="text-[10px] text-gray-400">{t.count}</span>}
          </button>
        ))}
        {thread && tab === 'thread' && (
          <button
            type="button"
            onClick={onCloseThread}
            title="Cerrar el hilo"
            className="ml-auto p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
          >
            <Icon as={X} size={14} />
          </button>
        )}
      </div>

      {tab === 'thread' && thread && (
        <ThreadPanel
          message={thread}
          channel={channel}
          currentUserId={currentUserId}
          canModerate={canModerate}
          members={members}
          conv={conv}
          onJump={onJump}
        />
      )}
      {tab === 'pins' && <PinsPanel pinned={conv.pinned} onJump={onJump} onUnpin={conv.actions.togglePin} />}
      {tab === 'files' && <FilesPanel channelId={channel.id} onJump={onJump} />}
      {tab === 'project' && channel.projectId && <ProjectPanel projectId={channel.projectId} />}
    </aside>
  )
}
