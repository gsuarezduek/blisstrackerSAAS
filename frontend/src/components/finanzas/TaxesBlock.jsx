import { useMemo, useState } from 'react'
import { fmtMoney } from '../../utils/format'

// Bloque de impuestos del modal "+ Cargar" (sección 4.7): una fila por
// impuesto OFRECIDO en la cuenta (desconocido hasta elegir cuenta), con
// "+ Agregar otro impuesto" para sumar cualquier otro del catálogo del
// workspace a esta carga puntual. Todo arranca destildado. Cálculo en vivo
// SOLO para preview (el backend recalcula con Prisma.Decimal al guardar,
// nunca se confía en este número para persistir nada).
function decimalsForCurrency(currency) { return currency === 'BTC' ? 8 : 2 }

function round(n, decimals) {
  const f = 10 ** decimals
  return Math.round(n * f) / f
}

export default function TaxesBlock({ account, allTaxes, baseAmount, selectedTaxIds, onChange }) {
  const [addingId, setAddingId] = useState('')
  const offeredIds = useMemo(() => new Set((account?.taxes || []).map(t => t.taxId)), [account])
  const [extraRows, setExtraRows] = useState([]) // ids agregados vía "+ Agregar otro impuesto"

  const taxById = useMemo(() => new Map(allTaxes.map(t => [t.id, t])), [allTaxes])
  const rowIds = useMemo(() => [...offeredIds, ...extraRows.filter(id => !offeredIds.has(id))], [offeredIds, extraRows])
  const notShown = allTaxes.filter(t => !rowIds.includes(t.id))

  const base = Number(baseAmount) || 0
  const decimals = decimalsForCurrency(account?.currency)

  // Monto calculado por fila (solo para las tildadas; 0 si la base no está tildada).
  const amounts = {}
  for (const id of rowIds) {
    const t = taxById.get(id)
    if (!t || !selectedTaxIds.has(id)) { amounts[id] = 0; continue }
    if (t.baseType === 'movement') {
      amounts[id] = round(base * Number(t.percentage) / 100, decimals)
    } else {
      const baseOk = selectedTaxIds.has(t.baseTaxId)
      const baseVal = baseOk ? (amounts[t.baseTaxId] ?? 0) : 0
      amounts[id] = baseOk ? round(baseVal * Number(t.percentage) / 100, decimals) : 0
    }
  }
  const total = rowIds.reduce((s, id) => s + (amounts[id] || 0), 0)

  function toggle(id) {
    const t = taxById.get(id)
    const next = new Set(selectedTaxIds)
    if (next.has(id)) {
      next.delete(id)
      // Destildar la base destilda también a sus dependientes tildados.
      for (const other of rowIds) {
        const ot = taxById.get(other)
        if (ot?.baseType === 'other_tax' && ot.baseTaxId === id) next.delete(other)
      }
    } else {
      next.add(id)
    }
    onChange(next)
  }

  function addExtra() {
    if (!addingId) return
    setExtraRows(r => [...r, Number(addingId)])
    setAddingId('')
  }

  if (!account) return null

  return (
    <div className="bg-gray-50 dark:bg-gray-900/40 rounded-xl p-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Impuestos</p>
        <p className="text-sm font-semibold text-gray-900 dark:text-white">{fmtMoney(total, account.currency)}</p>
      </div>

      {rowIds.length === 0 && <p className="text-xs text-gray-400 mb-2">Esta cuenta no tiene impuestos ofrecidos todavía.</p>}

      <div className="space-y-1.5">
        {rowIds.map(id => {
          const t = taxById.get(id)
          if (!t) return null
          const disabled = t.baseType === 'other_tax' && !selectedTaxIds.has(t.baseTaxId)
          const baseLabel = t.baseType === 'movement' ? 'el movimiento' : (taxById.get(t.baseTaxId)?.name || '—')
          return (
            <label key={id} className={`flex items-center gap-2 text-sm ${disabled ? 'opacity-40' : ''}`}>
              <input type="checkbox" disabled={disabled} checked={selectedTaxIds.has(id)} onChange={() => toggle(id)} />
              <span className="flex-1 text-gray-700 dark:text-gray-300 truncate">
                {t.name} <span className="text-gray-400">· se calcula sobre {baseLabel} · {Number(t.percentage)}%</span>
              </span>
              <span className="text-gray-600 dark:text-gray-300 font-medium shrink-0">{fmtMoney(amounts[id] || 0, account.currency)}</span>
            </label>
          )
        })}
      </div>

      {notShown.length > 0 && (
        <div className="flex gap-1.5 mt-2">
          <select className="flex-1 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 dark:text-gray-100 rounded-lg px-2 py-1 text-xs" value={addingId} onChange={e => setAddingId(e.target.value)}>
            <option value="">+ Agregar otro impuesto…</option>
            {notShown.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <button type="button" onClick={addExtra} disabled={!addingId} className="text-xs font-medium text-primary-600 dark:text-primary-400 disabled:opacity-40 px-2">Agregar</button>
        </div>
      )}
    </div>
  )
}
