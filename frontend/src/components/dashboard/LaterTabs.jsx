// Pestañas del panel "Más tarde" del Dashboard: Backlog / Seguimiento / Programadas /
// Completadas. Reemplazan a los cuatro acordeones grises que había al final de la
// página (todos con el mismo peso visual, todos cerrados). `alert` marca con un
// punto rojo una pestaña que necesita atención (ej. algo delegado bloqueado).
export default function LaterTabs({ tabs, value, onChange }) {
  return (
    <div className="flex items-end justify-between gap-3 border-b border-gray-200 dark:border-gray-700">
      <div className="flex gap-1 overflow-x-auto -mb-px" role="tablist" aria-label="Más tarde">
        {tabs.map(t => {
          const active = t.key === value
          const count = t.countLabel ?? (t.count > 0 ? String(t.count) : null)
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange(t.key)}
              className={`relative shrink-0 inline-flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                active
                  ? 'border-primary-500 text-gray-900 dark:text-white'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'}`}
            >
              {t.label}
              {count && (
                <span className={`text-xs rounded-full px-1.5 py-0.5 ${active ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300' : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'}`}>
                  {count}
                </span>
              )}
              {t.alert && <span className="w-1.5 h-1.5 rounded-full bg-red-500" aria-label="Requiere atención" />}
            </button>
          )
        })}
      </div>
    </div>
  )
}
