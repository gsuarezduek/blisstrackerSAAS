import { currentMonthKey, shiftMonth, monthLabel, monthRange } from './financeMonths'

const input = 'border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500'

const MONTHS_IN_SELECT = 24
const PERIOD_ALL = 'all'
const PERIOD_CUSTOM = 'custom'

// Función y no constante: el mes por defecto es el de hoy, no el de cuando cargó la página.
export function emptyMovementFilters() {
  return { period: currentMonthKey(), from: '', to: '', search: '', categoryId: '', accountId: '' }
}

// `period` es un mes ("YYYY-MM"), "all" o "custom" (usa from/to tal cual).
export function movementDateParams({ period, from, to }) {
  if (period === PERIOD_ALL) return {}
  if (period !== PERIOD_CUSTOM) return monthRange(period)
  return { ...(from ? { from } : {}), ...(to ? { to } : {}) }
}

// Filtros de Ingresos/Egresos (sección 4.1): período (mes, todas las fechas o
// desde/hasta a mano), item (buscador), categoría, banco, "Limpiar".
export default function MovementsFilterBar({ filters, onChange, categories, accounts }) {
  function set(patch) { onChange({ ...filters, ...patch }) }
  const thisMonth = currentMonthKey()
  const isDefault = filters.period === thisMonth && !filters.search && !filters.categoryId && !filters.accountId
  const months = Array.from({ length: MONTHS_IN_SELECT }, (_, i) => shiftMonth(thisMonth, -i))

  function handlePeriodChange(period) {
    // Al pasar a personalizada arranca del período que se estaba viendo, para ajustarlo.
    const start = period === PERIOD_CUSTOM ? movementDateParams(filters) : {}
    set({ period, from: start.from || '', to: start.to || '' })
  }

  return (
    <div className="flex flex-wrap items-end gap-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 mb-4">
      <div>
        <label htmlFor="movements-period" className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Fecha</label>
        <select id="movements-period" className={input} value={filters.period} onChange={e => handlePeriodChange(e.target.value)}>
          {months.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
          <option value={PERIOD_ALL}>Todas las fechas</option>
          <option value={PERIOD_CUSTOM}>Fecha personalizada</option>
        </select>
      </div>
      {filters.period === PERIOD_CUSTOM && (
        <>
          <div>
            <label htmlFor="movements-from" className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Desde</label>
            <input id="movements-from" type="date" className={input} value={filters.from} onChange={e => set({ from: e.target.value })} />
          </div>
          <div>
            <label htmlFor="movements-to" className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Hasta</label>
            <input id="movements-to" type="date" className={input} value={filters.to} onChange={e => set({ to: e.target.value })} />
          </div>
        </>
      )}
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
      {!isDefault && (
        <button onClick={() => onChange(emptyMovementFilters())} className="text-sm font-medium text-primary-600 dark:text-primary-400 hover:underline pb-2">Limpiar</button>
      )}
    </div>
  )
}
