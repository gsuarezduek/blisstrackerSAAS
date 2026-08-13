const GROUPS = [
  { kind: 'general', label: null },
  { kind: 'project', label: 'Proyectos' },
  { kind: 'custom',  label: 'Canales' },
]

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

export default function ChatSidebar({ channels, activeChannelId, onSelect, isAdmin, onCreateChannel }) {
  return (
    <div className="w-56 flex-shrink-0 border-r border-gray-100 dark:border-gray-700 flex flex-col overflow-y-auto py-3 px-2">
      {GROUPS.map(group => {
        const items = channels.filter(c => c.kind === group.kind)
        if (items.length === 0) return null
        return (
          <div key={group.kind} className="mb-4">
            {group.label && (
              <p className="px-3 mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                {group.label}
              </p>
            )}
            <div className="space-y-0.5">
              {items.map(c => (
                <ChannelRow key={c.id} channel={c} active={c.id === activeChannelId} onSelect={onSelect} />
              ))}
            </div>
          </div>
        )
      })}

      {isAdmin && (
        <button
          onClick={onCreateChannel}
          className="mt-1 mx-1 flex items-center gap-1.5 px-2 py-1.5 text-xs font-medium text-gray-400 dark:text-gray-500 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
        >
          <span className="text-base leading-none">+</span> Crear canal
        </button>
      )}
    </div>
  )
}
