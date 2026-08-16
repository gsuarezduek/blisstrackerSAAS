import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Link } from 'react-router-dom'
import api from '../api/client'
import { avatarUrl } from '../utils/avatarUrl'
import { useAuth } from '../context/AuthContext'

// Cada filtro define un predicado `match`. Un filtro `muted` no destaca: no suma al
// badge de la campana ni muestra badge en su icono (son informativos / de fondo).
// "Seguidas" agrupa las completadas de tareas que el usuario sigue o delegó (relación
// enviada por el backend) — esas SÍ destacan; el resto de completadas quedan muteadas.
const isFollowedCompleted = n => n.type === 'COMPLETED' && (n.relation === 'followed' || n.relation === 'delegated')

// Orden por urgencia: lo bloqueado y lo que requiere una decisión tuya van primero.
// BLOCKED agrupa también UNBLOCKED (mismo hilo: se bloqueó → se resolvió) y
// TASK_MENTION agrupa también LEAD_ASSIGNED, CHAT_MENTION y CONTENT_MENTION
// (misma idea: "te mencionaron/asignaron algo" — el mismo ícono @ para cualquier mención).
const FILTERS = [
  { key: 'BLOCKED',      label: '🔒', title: 'Bloqueos',                  match: n => n.type === 'BLOCKED' || n.type === 'UNBLOCKED' },
  { key: 'ACTION',       label: '🙋', title: 'Requieren tu acción',       match: n => n.type === 'VACATION_REQUEST' },
  { key: 'CLIENT',       label: '🤝', title: 'Respuestas del cliente',    match: n => n.type === 'CONTENT_APPROVED' || n.type === 'CONTENT_CHANGES_REQUESTED' },
  { key: 'TASK_MENTION', label: '@',  title: 'Asignaciones y menciones',  match: n => n.type === 'TASK_MENTION' || n.type === 'LEAD_ASSIGNED' || n.type === 'CHAT_MENTION' || n.type === 'CONTENT_MENTION' },
  { key: 'TASK_COMMENT', label: '💬', title: 'Comentarios',               match: n => n.type === 'TASK_COMMENT' },
  { key: 'FOLLOWED',     label: '👁', title: 'Seguidas y delegadas',      match: isFollowedCompleted },
  { key: 'OTHER',        label: '🔔', title: 'Otras',                     match: n => ['ADDED_TO_PROJECT', 'VACATION_REVIEWED', 'GAME_LAUNCHED'].includes(n.type) },
  { key: 'COMPLETED',    label: '✓',  title: 'Completadas',               match: n => n.type === 'COMPLETED' && !isFollowedCompleted(n), muted: true },
]

// El filtro (único) al que pertenece una notificación; los predicados son disjuntos.
const filterOf = n => FILTERS.find(f => f.match(n))

function timeAgo(dateStr) {
  const diff = Math.floor((Date.now() - new Date(dateStr)) / 1000)
  if (diff < 60)   return 'hace un momento'
  if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)}h`
  return new Date(dateStr).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
}

export default function NotificationBell() {
  const { user } = useAuth()
  const [notifications, setNotifications] = useState([])
  const [open,          setOpen]          = useState(false)
  const [activeFilter,  setActiveFilter]  = useState(FILTERS[0].key)
  const [projectQuery,  setProjectQuery]  = useState('')  // buscador de proyecto (filtro Completadas)
  const containerRef = useRef(null)

  // El badge destacado ignora los filtros muteados (completadas de proyecto, etc.)
  const unreadCount = notifications.filter(n => {
    const f = filterOf(n)
    return !n.read && f && !f.muted
  }).length

  const activeFilterObj = FILTERS.find(f => f.key === activeFilter) ?? FILTERS[0]

  const filtered = useMemo(() => {
    let list = notifications.filter(n => activeFilterObj.match(n))
    if (activeFilterObj.key === 'COMPLETED' && projectQuery.trim()) {
      const q = projectQuery.trim().toLowerCase()
      list = list.filter(n => n.project?.name?.toLowerCase().includes(q))
    }
    return list
  }, [notifications, activeFilterObj, projectQuery])

  const unreadByType = useMemo(() => {
    const counts = {}
    for (const f of FILTERS) {
      if (f.muted) continue
      counts[f.key] = notifications.filter(n => !n.read && f.match(n)).length
    }
    return counts
  }, [notifications])

  const fetchNotifications = useCallback(async () => {
    try {
      const { data } = await api.get('/notifications')
      setNotifications(data)
    } catch {
      // silently ignore (e.g. on logout)
    }
  }, [])

  // Initial fetch + poll every 2min
  useEffect(() => {
    fetchNotifications()
    const t = setInterval(fetchNotifications, 120000)
    return () => clearInterval(t)
  }, [fetchNotifications])

  // Close on outside click
  useEffect(() => {
    function handleClick(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // Marca como leídas solo las notificaciones del filtro indicado (por IDs, porque un
  // filtro puede agrupar por relación y no solo por tipo): así el indicador de cada icono
  // refleja lo que todavía no viste, y se limpia recién cuando entrás a ese filtro.
  const markTypeRead = useCallback(async (filterKey) => {
    const f = FILTERS.find(f => f.key === filterKey)
    if (!f) return
    const ids = notifications.filter(n => !n.read && f.match(n)).map(n => n.id)
    if (ids.length === 0) return
    setNotifications(prev => prev.map(n => ids.includes(n.id) ? { ...n, read: true } : n))
    try { await api.post('/notifications/read', { ids }) } catch {}
  }, [notifications])

  async function handleMarkAllRead() {
    if (!notifications.some(n => !n.read)) return
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
    try { await api.post('/notifications/read-all') } catch {}
  }

  function selectFilter(key) {
    setActiveFilter(key)
    if (key !== 'COMPLETED') setProjectQuery('')  // el buscador es exclusivo de Completadas
    markTypeRead(key)
  }

  function handleOpen() {
    const wasOpen = open
    setOpen(prev => !prev)
    if (!wasOpen) {
      // Al abrir, mostrar el primer filtro (no muteado) con no leídas, o el primero de la lista
      const firstUnread = FILTERS.find(f => !f.muted && notifications.some(n => !n.read && f.match(n)))
      const initial = firstUnread?.key ?? FILTERS[0].key
      setActiveFilter(initial)
      markTypeRead(initial)
    }
  }

  return (
    <div ref={containerRef} className="relative">
      {/* Bell button */}
      <button
        onClick={handleOpen}
        className="relative text-gray-500 hover:text-gray-800 transition-colors p-1"
        title="Notificaciones"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
          <path fillRule="evenodd" d="M5.25 9a6.75 6.75 0 0113.5 0v.75c0 2.123.8 4.057 2.118 5.52a.75.75 0 01-.297 1.206c-1.544.57-3.16.99-4.831 1.243a3.75 3.75 0 11-7.48 0 24.585 24.585 0 01-4.831-1.244.75.75 0 01-.298-1.205A8.217 8.217 0 005.25 9.75V9zm4.502 8.9a2.25 2.25 0 104.496 0 25.057 25.057 0 01-4.496 0z" clipRule="evenodd" />
        </svg>

        {/* Unread badge */}
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center leading-none">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="fixed inset-x-2 top-16 sm:absolute sm:inset-x-auto sm:right-0 sm:top-8 sm:w-80 bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-100 dark:border-gray-700 z-50 overflow-hidden">
          <div className="px-4 pt-3 pb-2 border-b dark:border-gray-700">
            <div className="flex items-baseline gap-1.5 mb-2.5 min-w-0">
              <span className="font-semibold text-gray-900 dark:text-white text-sm flex-shrink-0">Notificaciones</span>
              <span className="text-xs text-primary-600 dark:text-primary-400 font-medium truncate flex-1">· {activeFilterObj.title}</span>
              {notifications.some(n => !n.read) && (
                <button
                  onClick={handleMarkAllRead}
                  className="text-[11px] text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 font-medium flex-shrink-0 transition-colors"
                  title="Marcar todas como leídas"
                >
                  Marcar todas
                </button>
              )}
            </div>
            {/* Filter icons — solo iconos, con indicador de no leídas por tipo */}
            <div className="flex gap-1.5">
              {FILTERS.map(f => {
                const badge = unreadByType[f.key] ?? 0
                const isActive = activeFilter === f.key
                return (
                  <button
                    key={f.key}
                    onClick={() => selectFilter(f.key)}
                    title={f.title}
                    aria-label={f.title}
                    className={`relative text-sm w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
                      isActive
                        ? 'bg-primary-600 text-white ring-2 ring-primary-300 dark:ring-primary-700'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                    }`}
                  >
                    <span>{f.label}</span>
                    {badge > 0 && (
                      <span className="absolute -top-1 -right-1 min-w-[1rem] h-4 px-1 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center leading-none">
                        {badge > 9 ? '9+' : badge}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
            {/* Buscador por proyecto — solo en Completadas */}
            {activeFilterObj.key === 'COMPLETED' && (
              <input
                type="text"
                value={projectQuery}
                onChange={e => setProjectQuery(e.target.value)}
                placeholder="Filtrar por proyecto…"
                className="mt-2.5 w-full text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-300 dark:focus:ring-primary-700"
              />
            )}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="text-center py-10 text-gray-400 dark:text-gray-500">
                <p className="text-2xl mb-2">🔔</p>
                <p className="text-sm">
                  {notifications.length === 0
                    ? 'Sin notificaciones todavía'
                    : (activeFilterObj.key === 'COMPLETED' && projectQuery.trim())
                      ? 'Ningún proyecto coincide'
                      : 'Sin notificaciones de este tipo'}
                </p>
              </div>
            ) : (
              filtered.map(n => {
                const isBlocked        = n.type === 'BLOCKED'
                const isUnblocked      = n.type === 'UNBLOCKED'
                const isAddedProject   = n.type === 'ADDED_TO_PROJECT'
                const isComment        = n.type === 'TASK_COMMENT'
                const isMention        = n.type === 'TASK_MENTION'
                const isLeadAssigned   = n.type === 'LEAD_ASSIGNED'
                const isChatMention    = n.type === 'CHAT_MENTION'
                const isContentMention = n.type === 'CONTENT_MENTION'
                const isContentApproved = n.type === 'CONTENT_APPROVED'
                const isContentChanges  = n.type === 'CONTENT_CHANGES_REQUESTED'
                const isVacationAction = n.type === 'VACATION_REQUEST'
                const isVacation       = isVacationAction || n.type === 'VACATION_REVIEWED'
                const isGameLaunched   = n.type === 'GAME_LAUNCHED'
                const isCompleted      = n.type === 'COMPLETED'
                const isAssignment     = isMention || isLeadAssigned || isChatMention || isContentMention
                const isAmberFamily    = isVacation || isGameLaunched || isContentChanges

                const isGreenFamily = isUnblocked || isAddedProject || isContentApproved

                const bgClass = isCompleted
                  ? 'bg-gray-50 dark:bg-gray-800/60'
                  : isBlocked
                  ? (!n.read ? 'bg-red-100 dark:bg-red-900/40'      : 'bg-red-50 dark:bg-red-900/20')
                  : isGreenFamily
                    ? (!n.read ? 'bg-green-100 dark:bg-green-900/40' : 'bg-green-50 dark:bg-green-900/20')
                      : isComment
                        ? (!n.read ? 'bg-blue-100 dark:bg-blue-900/40' : 'bg-blue-50 dark:bg-blue-900/20')
                        : isAssignment
                          ? (!n.read ? 'bg-purple-100 dark:bg-purple-900/40' : 'bg-purple-50 dark:bg-purple-900/20')
                          : isAmberFamily
                            ? (!n.read ? 'bg-amber-50 dark:bg-amber-900/20' : 'bg-white dark:bg-gray-800')
                            : (!n.read ? 'bg-primary-50 dark:bg-primary-900/20' : 'bg-white dark:bg-gray-800')

                const dotClass = isBlocked ? 'bg-red-500' : isGreenFamily ? 'bg-green-500' : isComment ? 'bg-blue-500' : isAssignment ? 'bg-purple-500' : isAmberFamily ? 'bg-amber-500' : 'bg-primary-500'
                const textClass = isCompleted
                  ? 'text-gray-500 dark:text-gray-400'
                  : isBlocked
                  ? 'text-red-800 dark:text-red-200'
                  : isGreenFamily
                    ? 'text-green-800 dark:text-green-200'
                      : isComment
                        ? 'text-blue-800 dark:text-blue-200'
                        : isAssignment
                          ? 'text-purple-800 dark:text-purple-200'
                          : 'text-gray-800 dark:text-gray-200'

                // Deep-link: leads van a Ventas (ruta según rol), solicitudes de licencia a
                // RRHH → Vacaciones (solo lo ven admins, que son quienes las reciben), las
                // revisiones de licencia al perfil propio (el destinatario puede no ser admin),
                // las menciones de Contenido al calendario con el modal de la pieza abierto.
                // Los juegos y las menciones de chat no navegan a ningún lado — abren su
                // flotante (🏆 / 💬, ya visibles en cualquier página) vía un evento, ver handleRowClick.
                const ventasBase = user?.isAdmin ? '/admin/ventas' : '/ventas'
                const dest = n.leadId
                  ? `${ventasBase}?lead=${n.leadId}`
                  : n.type === 'VACATION_REQUEST'
                    ? '/admin/rrhh?tab=vacaciones'
                    : n.type === 'VACATION_REVIEWED'
                      ? '/profile'
                      : (isGameLaunched || isChatMention)
                        ? null
                        : n.contentPieceId
                          ? `/contenido?projectId=${n.projectId}&piece=${n.contentPieceId}`
                          : n.projectId
                            ? `/my-projects/${n.projectId}${n.taskId ? `?task=${n.taskId}` : ''}`
                            : null

                const handleRowClick = (e) => {
                  setOpen(false)
                  if (isGameLaunched && n.gameId) {
                    e.preventDefault()
                    window.dispatchEvent(new CustomEvent('bliss:open-game', { detail: { gameId: n.gameId } }))
                  }
                  if (isChatMention) {
                    e.preventDefault()
                    window.dispatchEvent(new CustomEvent('bliss:open-chat', { detail: { slug: n.channel?.slug || null } }))
                  }
                }

                return (
                  <Link
                    key={n.id}
                    to={dest ?? '#'}
                    onClick={handleRowClick}
                    className={`block px-4 py-3 border-b dark:border-gray-700 last:border-b-0 transition-colors hover:brightness-95 ${bgClass}`}
                  >
                    <div className="flex items-start gap-2.5">
                      <div className="relative flex-shrink-0 mt-0.5">
                        {/* CONTENT_APPROVED/CONTENT_CHANGES_REQUESTED no tienen actor (User) —
                            el que decidió es un contacto del cliente, no alguien del equipo. */}
                        {n.actor ? (
                          <img
                            src={avatarUrl(n.actor.avatar)}
                            alt={n.actor.name}
                            className="w-7 h-7 rounded-full object-cover border border-gray-200 dark:border-gray-600"
                          />
                        ) : (
                          <div className="w-7 h-7 rounded-full bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 flex items-center justify-center text-sm">
                            {isContentApproved ? '✅' : isContentChanges ? '✏️' : '🤝'}
                          </div>
                        )}
                        {isBlocked && (
                          <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-red-500 rounded-full flex items-center justify-center text-white text-[8px] leading-none">⚠</span>
                        )}
                        {isUnblocked && (
                          <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-green-500 rounded-full flex items-center justify-center text-white text-[8px] leading-none">🔓</span>
                        )}
                        {isAddedProject && (
                          <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-green-500 rounded-full flex items-center justify-center text-white text-[8px] leading-none">＋</span>
                        )}
                        {isComment && (
                          <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-blue-500 rounded-full flex items-center justify-center text-white text-[8px] leading-none">💬</span>
                        )}
                        {isMention && (
                          <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-purple-500 rounded-full flex items-center justify-center text-white font-bold text-[8px] leading-none">@</span>
                        )}
                        {isLeadAssigned && (
                          <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-purple-500 rounded-full flex items-center justify-center text-white text-[8px] leading-none">💼</span>
                        )}
                        {isChatMention && (
                          <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-purple-500 rounded-full flex items-center justify-center text-white text-[8px] leading-none">💬</span>
                        )}
                        {isContentMention && (
                          <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-purple-500 rounded-full flex items-center justify-center text-white text-[8px] leading-none">📅</span>
                        )}
                        {isVacationAction && (
                          <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-amber-500 rounded-full flex items-center justify-center text-[8px] leading-none">🙋</span>
                        )}
                        {n.type === 'VACATION_REVIEWED' && (
                          <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-amber-500 rounded-full flex items-center justify-center text-[8px] leading-none">🏖</span>
                        )}
                        {isGameLaunched && (
                          <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-amber-500 rounded-full flex items-center justify-center text-[8px] leading-none">🏆</span>
                        )}
                        {isCompleted && (
                          <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-gray-400 dark:bg-gray-500 rounded-full flex items-center justify-center text-white text-[8px] leading-none">✓</span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm leading-snug ${textClass}`}>
                          {/* Sin actor, el mensaje ya es autocontenido (ej. "María (cliente) aprobó..."). */}
                          {n.actor && <span className="font-semibold">{n.actor.name}</span>}
                          {n.actor && ' '}
                          {n.message}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {n.project?.name && (
                            <span className="text-xs font-medium text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 rounded px-1.5 py-0.5 truncate max-w-[140px]">
                              {n.project.name}
                            </span>
                          )}
                          <span className="text-xs text-gray-400 dark:text-gray-500">{timeAgo(n.createdAt)}</span>
                        </div>
                      </div>
                      {!n.read && (
                        <span className={`w-2 h-2 rounded-full ${dotClass} flex-shrink-0 mt-1.5`} />
                      )}
                    </div>
                  </Link>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
