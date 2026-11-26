import { useState, useMemo } from 'react'
import { useVoiceCall } from '../../context/VoiceCallContext'
import { Lock, Volume2 } from 'lucide-react'
import { Icon } from '../ui/Icon'

function ChannelRow({ channel, active, onSelect, voiceCount }) {
  const isVoice = channel.medium === 'voice'
  const unread = channel.unreadCount > 0
  const mentioned = channel.mentionCount > 0
  return (
    <button
      onClick={() => onSelect(channel)}
      className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-left transition-colors ${
        active
          ? 'bg-primary-100 dark:bg-primary-900/40 text-primary-800 dark:text-primary-300'
          : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
      }`}
    >
      <span className={`text-gray-400 dark:text-gray-500 ${active ? '!text-primary-500' : ''}`}>
        {channel.isPrivate ? <Icon as={Lock} size={13} className="inline-block" /> : isVoice ? <Icon as={Volume2} size={14} className="inline-block" /> : '#'}
      </span>
      <span className={`flex-1 truncate ${unread && !active ? 'font-semibold text-gray-900 dark:text-white' : ''}`}>
        {channel.name}
      </span>
      {isVoice ? (
        voiceCount > 0 && (
          <span className="flex-shrink-0 flex items-center gap-1 text-[10px] font-semibold text-green-600 dark:text-green-400">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500" /> {voiceCount}
          </span>
        )
      ) : mentioned ? (
        <span className="flex-shrink-0 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
          {channel.mentionCount > 9 ? '9+' : channel.mentionCount}
        </span>
      ) : unread ? (
        <span className="flex-shrink-0 w-2 h-2 rounded-full bg-gray-400 dark:bg-gray-500" />
      ) : null}
    </button>
  )
}

const norm = s => (s || '').toLowerCase()
const byName = (a, b) => norm(a.name).localeCompare(norm(b.name), 'es', { sensitivity: 'base' })

const ts = v => (v ? new Date(v).getTime() : 0)

// Orden de la vista "Últimos": recencia de uso propio, en dos niveles.
// 1) `lastReadAt` — "mi participación": el backend lo mueve al escribir un mensaje Y al
//    abrir el canal, así que un canal que sigo sin escribir también cuenta (en un equipo
//    son mayoría). Es recencia de uso real, tipo historial, no "dónde hablé".
// 2) Los canales que nunca abrí (sin row de lectura → `lastReadAt` null) caen al fondo,
//    ahí ordenados por actividad del canal, para que al menos los vivos queden arriba.
function byRecentUse(a, b) {
  const mine = ts(b.lastReadAt) - ts(a.lastReadAt)
  if (mine) return mine
  const activity = ts(b.lastMessage?.createdAt) - ts(a.lastMessage?.createdAt)
  return activity || byName(a, b)
}

// La vista elegida se recuerda por navegador (mismo criterio que el modo de vista de la
// Nube del proyecto o el orden de Clientes en Finanzas): es una preferencia de cómo mirar
// la lista, no un dato del workspace — no vale una columna en la DB ni un request.
const VIEW_KEY = 'bliss_chat_channel_view'
const VIEWS = [
  { key: 'all',    label: 'Todos' },
  { key: 'unread', label: 'No leídos' },
  { key: 'recent', label: 'Últimos' },
]

function readView() {
  try {
    const stored = localStorage.getItem(VIEW_KEY)
    return VIEWS.some(v => v.key === stored) ? stored : 'all'
  } catch { return 'all' } // Safari en modo privado puede tirar al leer
}

function saveView(view) {
  try { localStorage.setItem(VIEW_KEY, view) } catch { /* preferencia perdida, nada más */ }
}

// Dropdown compacto para elegir canal dentro del widget flotante de Chat. NO duplica un
// canal en dos grupos — cada uno aparece una sola vez, en el grupo de mayor prioridad al
// que pertenece: general + canales creados aparte de proyectos (siempre arriba, fijos,
// no se mueven por menciones/favoritos) → menciones sin leer (solo canales de proyecto)
// → favoritos (mismo starring de "Mis Proyectos", solo canales de proyecto) → resto de
// proyectos por orden alfabético.
// Switch "Todos"/"No leídos"/"Últimos" — ojo que no son tres cosas del mismo tipo: los dos
// primeros son FILTROS y el tercero es un ORDEN. "No leídos" filtra a los canales con
// `unreadCount`/`mentionCount` > 0; "Últimos" no filtra nada, apaga el agrupado por
// prioridad de arriba y muestra una lista plana por recencia de uso propio (`byRecentUse`).
// Tiene que apagarlo: ordenar por recencia DENTRO de cada grupo no se nota — el canal que
// usás todo el día seguiría enterrado abajo, en "Proyectos", que es justo lo que se quiere
// evitar. Los badges de mención/no-leído se siguen mostrando igual en las filas.
// La búsqueda por texto ignora SOLO el filtro (corre sobre todos los canales, y mientras
// hay query el botón "No leídos" queda atenuado): el orden elegido sí se respeta buscando,
// porque buscar y ordenar se combinan sin contradecirse.
// La vista elegida se recuerda entre sesiones (`VIEW_KEY`) y la clave es la misma para los
// cuatro montajes del componente (panel de mobile + columna de /chat), así no se contradicen.
// `fullscreen`: modo alternativo al dropdown flotante — ocupa el 100% del panel de
// ChatWidget en vez de posicionarse como popover. Mismo contenido/lógica, solo cambia
// el contenedor exterior. Lo usa ChatWidget como vista inicial (sin canal elegido
// todavía en la sesión) en vez de caer directo a #general.
export default function ChannelSwitcher({ channels, activeChannelId, onSelect, isAdmin, onCreateChannel, fullscreen = false }) {
  const [query, setQuery] = useState('')
  const [view, setView] = useState(readView)
  const unreadOnly = view === 'unread'
  const flat = view === 'recent'
  const { voicePresence } = useVoiceCall() || {}
  const hasQuery = norm(query).trim().length > 0
  const unreadCount = useMemo(() => channels.filter(c => c.unreadCount > 0 || c.mentionCount > 0).length, [channels])

  // La búsqueda siempre corre sobre TODOS los canales, ignorando el switch — buscar algo
  // puntual no debería depender de si ese canal está o no marcado como no-leído.
  const filtered = useMemo(() => {
    const q = norm(query).trim()
    if (q) return channels.filter(c => norm(c.name).includes(q))
    return unreadOnly ? channels.filter(c => c.unreadCount > 0 || c.mentionCount > 0) : channels
  }, [channels, query, unreadOnly])

  function changeView(next) {
    setView(next)
    saveView(next)
  }

  const groups = useMemo(() => {
    // "Últimos": una sola lista plana, sin grupos ni encabezados (ver cabecera).
    if (flat) return [{ key: 'recent', label: null, items: [...filtered].sort(byRecentUse) }]

    const general = filtered.filter(c => c.kind === 'general')
    // Los canales de voz también son kind:'custom' — se separan a su propio grupo
    // fijo (🔊 Voz), debajo de general+custom, en vez de mezclarse ahí.
    const custom = filtered.filter(c => c.kind === 'custom' && c.medium !== 'voice').sort(byName)
    const voice = filtered.filter(c => c.medium === 'voice').sort(byName)
    const pinnedIds = new Set([...general, ...custom, ...voice].map(c => c.id))

    // Menciones/favoritos solo aplican al resto (canales de proyecto) — general, los
    // canales custom y los de voz quedan siempre arriba, sin importar menciones.
    const rest = filtered.filter(c => !pinnedIds.has(c.id))
    const mentioned = rest.filter(c => c.mentionCount > 0).sort(byName)
    const mentionedIds = new Set(mentioned.map(c => c.id))
    const rest2 = rest.filter(c => !mentionedIds.has(c.id))

    const favorites = rest2.filter(c => c.starred).sort(byName)
    const favIds = new Set(favorites.map(c => c.id))
    const projects = rest2.filter(c => !favIds.has(c.id)).sort(byName)

    return [
      { key: 'general',   label: null,          items: general },
      { key: 'custom',    label: 'Canales',     items: custom },
      { key: 'voice',     label: null,          items: voice },
      { key: 'mentions',  label: 'Menciones',   items: mentioned, accent: true },
      { key: 'favorites', label: 'Destacados',  items: favorites },
      { key: 'project',   label: 'Proyectos',   items: projects },
    ]
  }, [filtered, flat])

  const hasResults = groups.some(g => g.items.length > 0)

  return (
    <div className={fullscreen
      // flex-1 (no h-full): ocupa el espacio restante del panel de ChatWidget, que
      // ya tiene su propio header arriba — h-full mediría contra el panel entero y
      // desbordaría.
      ? 'flex-1 min-h-0 flex flex-col bg-white dark:bg-gray-800'
      : 'absolute left-0 top-full mt-1.5 w-72 max-h-96 flex flex-col bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl shadow-lg z-20 overflow-hidden'
    }>
      <div className="p-2 border-b border-gray-100 dark:border-gray-700 flex-shrink-0 space-y-1.5">
        <input
          autoFocus
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Buscar proyecto o canal..."
          className="w-full text-sm px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-gray-200 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-400"
        />
        <div className="flex gap-1">
          {VIEWS.map(v => {
            // Atenuado solo el filtro mientras se busca — "Todos"/"Últimos" son órdenes y
            // siguen siendo elegibles con una query activa.
            const muted = v.key === 'unread' && hasQuery
            return (
              <button
                key={v.key}
                type="button"
                onClick={() => changeView(v.key)}
                title={muted ? 'La búsqueda siempre muestra todos los canales' : undefined}
                className={`flex-1 whitespace-nowrap text-xs font-medium py-1 rounded-lg transition-colors ${
                  view === v.key ? 'bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                } ${muted ? 'opacity-40 pointer-events-none' : ''}`}
              >
                {v.label}{v.key === 'unread' && unreadCount > 0 ? ` (${unreadCount})` : ''}
              </button>
            )
          })}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto py-2 px-2">
        {!hasResults && (
          // Como la vista queda recordada, entrar con "No leídos" puesto y nada sin leer
          // (lo leíste desde el celular, por ejemplo) abre el selector vacío y parece roto:
          // de ahí la salida explícita en vez de solo el texto gris.
          <div className="text-center py-4 space-y-1.5">
            <p className="text-xs text-gray-400 dark:text-gray-500">
              {!hasQuery && unreadOnly ? 'No tenés canales sin leer' : 'Sin resultados'}
            </p>
            {!hasQuery && unreadOnly && (
              <button
                type="button"
                onClick={() => changeView('all')}
                className="text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline"
              >
                Ver todos
              </button>
            )}
          </div>
        )}
        {groups.map(group => {
          if (group.items.length === 0) return null
          return (
            <div key={group.key} className="mb-3 last:mb-0">
              {group.label && (
                <p className={`px-3 mb-1 text-[11px] font-semibold uppercase tracking-wide ${
                  group.accent ? 'text-red-500 dark:text-red-400' : 'text-gray-400 dark:text-gray-500'
                }`}>
                  {group.label}
                </p>
              )}
              <div className="space-y-0.5">
                {group.items.map(c => (
                  <ChannelRow key={c.id} channel={c} active={c.id === activeChannelId} onSelect={onSelect} voiceCount={(voicePresence?.get(c.id) || []).length} />
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {isAdmin && (
        <div className="flex-shrink-0 border-t border-gray-100 dark:border-gray-700">
          <button
            onClick={onCreateChannel}
            className="w-full flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-400 dark:text-gray-500 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
          >
            <span className="text-base leading-none">+</span> Crear canal
          </button>
        </div>
      )}
    </div>
  )
}
