import { useState, useMemo } from 'react'

function ChannelRow({ channel, active, onSelect }) {
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
      <span className={`text-gray-400 dark:text-gray-500 ${active ? '!text-primary-500' : ''}`}>#</span>
      <span className={`flex-1 truncate ${unread && !active ? 'font-semibold text-gray-900 dark:text-white' : ''}`}>
        {channel.name}
      </span>
      {mentioned ? (
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

// Dropdown compacto para elegir canal dentro del widget flotante de Chat. NO duplica un
// canal en dos grupos — cada uno aparece una sola vez, en el grupo de mayor prioridad al
// que pertenece: general + canales creados aparte de proyectos (siempre arriba, fijos,
// no se mueven por menciones/favoritos) → menciones sin leer (solo canales de proyecto)
// → favoritos (mismo starring de "Mis Proyectos", solo canales de proyecto) → resto de
// proyectos por orden alfabético.
export default function ChannelSwitcher({ channels, activeChannelId, onSelect, isAdmin, onCreateChannel }) {
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = norm(query).trim()
    if (!q) return channels
    return channels.filter(c => norm(c.name).includes(q))
  }, [channels, query])

  const groups = useMemo(() => {
    const general = filtered.filter(c => c.kind === 'general')
    const custom = filtered.filter(c => c.kind === 'custom').sort(byName)
    const pinnedIds = new Set([...general, ...custom].map(c => c.id))

    // Menciones/favoritos solo aplican al resto (canales de proyecto) — general y los
    // canales custom quedan siempre arriba, independientemente de si tienen menciones.
    const rest = filtered.filter(c => !pinnedIds.has(c.id))
    const mentioned = rest.filter(c => c.mentionCount > 0)
    const mentionedIds = new Set(mentioned.map(c => c.id))
    const rest2 = rest.filter(c => !mentionedIds.has(c.id))

    const favorites = rest2.filter(c => c.starred)
    const favIds = new Set(favorites.map(c => c.id))
    const projects = rest2.filter(c => !favIds.has(c.id)).sort(byName)

    return [
      { key: 'general',   label: null,          items: general },
      { key: 'custom',    label: 'Canales',     items: custom },
      { key: 'mentions',  label: 'Menciones',   items: mentioned, accent: true },
      { key: 'favorites', label: 'Destacados',  items: favorites },
      { key: 'project',   label: 'Proyectos',   items: projects },
    ]
  }, [filtered])

  const hasResults = groups.some(g => g.items.length > 0)

  return (
    <div className="absolute left-0 top-full mt-1.5 w-72 max-h-96 flex flex-col bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl shadow-lg z-20 overflow-hidden">
      <div className="p-2 border-b border-gray-100 dark:border-gray-700 flex-shrink-0">
        <input
          autoFocus
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Buscar proyecto o canal..."
          className="w-full text-sm px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-gray-200 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-400"
        />
      </div>

      <div className="overflow-y-auto py-2 px-2">
        {!hasResults && (
          <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-4">Sin resultados</p>
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
                  <ChannelRow key={c.id} channel={c} active={c.id === activeChannelId} onSelect={onSelect} />
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {isAdmin && (
        <button
          onClick={onCreateChannel}
          className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-400 dark:text-gray-500 hover:text-primary-600 dark:hover:text-primary-400 transition-colors border-t border-gray-100 dark:border-gray-700"
        >
          <span className="text-base leading-none">+</span> Crear canal
        </button>
      )}
    </div>
  )
}
