const input = 'border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500'

const EMPTY = { from: '', to: '', search: '', categoryId: '', accountId: '' }

export { EMPTY as EMPTY_MOVEMENT_FILTERS }

// Filtros de Ingresos/Egresos (sección 4.1): desde, hasta, item (buscador),
// categoría, banco, "Limpiar".
export default function MovementsFilterBar({ filters, onChange, categories, accounts }) {
  function set(patch) { onChange({ ...filters, ...patch }) }
  const isEmpty = Object.values(filters).every(v => !v)

  return (
    <div className="flex flex-wrap items-end gap-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 mb-4">
      <div>
        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Desde</label>
        <input type="date" className={input} value={filters.from} onChange={e => set({ from: e.target.value })} />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Hasta</label>
        <input type="date" className={input} value={filters.to} onChange={e => set({ to: e.target.value })} />
      </div>
      <div className="flex-1 min-w-[10rem]">
        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Item</label>
        <input className={`${input} w-full`} placeholder="Buscar item…" value={filters.search} onChange={e => set({ search: e.target.value })} />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Categoría</label>
        <select className={input} value={filters.categoryId} onChange={e => set({ categoryId: e.target.value })}>
          <option value="">Todas</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Banco</label>
        <select className={input} value={filters.accountId} onChange={e => set({ accountId: e.target.value })}>
          <option value="">Todos</option>
          {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </div>
      {!isEmpty && (
        <button onClick={() => onChange({ ...EMPTY })} className="text-sm font-medium text-primary-600 dark:text-primary-400 hover:underline pb-2">Limpiar</button>
      )}
    </div>
  )
}
