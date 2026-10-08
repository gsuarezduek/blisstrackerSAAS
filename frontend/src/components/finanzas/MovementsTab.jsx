import { useEffect, useState, useCallback } from 'react'
import api from '../../api/client'
import { fmtMoney } from '../../utils/format'
import MovementsFilterBar, { EMPTY_MOVEMENT_FILTERS } from './MovementsFilterBar'
import MovementsTable from './MovementsTable'
import EditMovementModal from './EditMovementModal'

// Pestaña Ingresos/Egresos (sección 4.1) — mismo componente para ambas,
// filtrado por `type`. `accounts/categories/items/taxes` llegan ya cargados
// desde Finanzas.jsx (datos compartidos con el modal "+ Cargar").
export default function MovementsTab({ type, accounts, categories, items, taxes, onDataChange, refreshKey }) {
  const [filters, setFilters] = useState(EMPTY_MOVEMENT_FILTERS)
  const [movements, setMovements] = useState(null)
  const [editing, setEditing] = useState(null)

  const load = useCallback(async () => {
    const params = { type }
    if (filters.from) params.from = filters.from
    if (filters.to) params.to = filters.to
    if (filters.search) params.search = filters.search
    if (filters.categoryId) params.categoryId = filters.categoryId
    if (filters.accountId) params.accountId = filters.accountId
    const res = await api.get('/finanzas/movements', { params })
    setMovements(res.data)
  }, [type, filters])

  useEffect(() => { load() }, [load, refreshKey])

  function handleSaved() {
    setEditing(null)
    load()
    onDataChange?.()
  }

  // Suma por moneda (no se mezclan ARS/USD/BTC en un solo total) — la cuenta
  // de cada movimiento ya viaja incluida en la respuesta.
  const totalsByCurrency = {}
  for (const m of movements || []) {
    const cur = m.account?.currency || 'ARS'
    totalsByCurrency[cur] = (totalsByCurrency[cur] || 0) + Number(m.amount)
  }

  return (
    <div>
      <MovementsFilterBar filters={filters} onChange={setFilters} categories={categories.filter(c => c.type === type)} accounts={accounts} />

      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide">Total {type === 'income' ? 'ingresos' : 'egresos'}</p>
            {movements && Object.keys(totalsByCurrency).length > 0 ? (
              <p className="text-xl font-bold text-gray-900 dark:text-white">
                {Object.entries(totalsByCurrency).map(([cur, amt]) => fmtMoney(amt, cur)).join(' · ')}
              </p>
            ) : (
              <p className="text-xl font-bold text-gray-900 dark:text-white">{movements ? fmtMoney(0, 'ARS') : '—'}</p>
            )}
          </div>
          <p className="text-xs text-gray-400">{movements ? `${movements.length} movimiento${movements.length === 1 ? '' : 's'}` : ''}</p>
        </div>

        {movements === null ? (
          <p className="text-center text-sm text-gray-400 py-10">Cargando…</p>
        ) : (
          <MovementsTable movements={movements} onEdit={setEditing} />
        )}
      </div>

      {editing && (
        <EditMovementModal movement={editing} accounts={accounts} categories={categories} items={items} taxes={taxes}
          onClose={() => setEditing(null)} onSaved={handleSaved} />
      )}
    </div>
  )
}
