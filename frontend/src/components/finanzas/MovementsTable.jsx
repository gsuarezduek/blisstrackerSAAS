import { useState } from 'react'
import { Pencil, History, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react'
import { Icon } from '../ui/Icon'
import { fmtMoney } from '../../utils/format'
import { CURRENCIES } from './financeCatalog'

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })
}

// Columnas ordenables. `firstDir`: hacia dónde ordena el primer toque — monto
// y fecha de mayor a menor (lo más grande / lo más nuevo arriba), los textos
// de la A a la Z. El segundo toque invierte.
const COLUMNS = [
  { key: 'date',     label: 'Fecha',     firstDir: 'desc' },
  { key: 'item',     label: 'Item',      firstDir: 'asc' },
  { key: 'category', label: 'Categoría', firstDir: 'asc' },
  { key: 'account',  label: 'Banco',     firstDir: 'asc' },
  { key: 'amount',   label: 'Monto',     firstDir: 'desc', align: 'right' },
]

const TEXT_OF = {
  item:     m => m.item?.name || '',
  category: m => m.category?.name || '',
  account:  m => m.account?.name || '',
}

const CURRENCY_ORDER = CURRENCIES.map(c => c.key)
function currencyRank(cur) {
  const i = CURRENCY_ORDER.indexOf(cur || 'ARS')
  return i === -1 ? CURRENCY_ORDER.length : i
}

// Más nuevo primero; a igual fecha, el cargado después (mismo orden que el backend).
function byDateDesc(a, b) {
  return (new Date(b.date) - new Date(a.date)) || (b.id - a.id)
}

/**
 * Ordena una copia de `movements` según `sort` ({ key, dir } o null = el orden
 * del servidor). Por monto, primero se agrupa por moneda (ARS, USD, BTC — en
 * ese orden, sin importar la dirección) y recién dentro de cada una por monto:
 * comparar 500 dólares contra 50.000 pesos por el número suelto engaña. Los
 * textos vacíos van siempre al final.
 */
export function sortMovements(movements, sort) {
  if (!sort) return movements
  const sign = sort.dir === 'asc' ? 1 : -1
  const list = [...movements]
  if (sort.key === 'date') {
    list.sort((a, b) => -sign * byDateDesc(a, b))
  } else if (sort.key === 'amount') {
    list.sort((a, b) =>
      (currencyRank(a.account?.currency) - currencyRank(b.account?.currency))
      || sign * (Number(a.amount) - Number(b.amount))
      || byDateDesc(a, b))
  } else {
    const text = TEXT_OF[sort.key]
    list.sort((a, b) => {
      const ta = text(a); const tb = text(b)
      if (!ta !== !tb) return ta ? -1 : 1
      return sign * ta.localeCompare(tb, 'es', { sensitivity: 'base' }) || byDateDesc(a, b)
    })
  }
  return list
}

function SortHeader({ column, sort, onSort }) {
  const active = sort?.key === column.key
  const icon = active ? (sort.dir === 'asc' ? ChevronUp : ChevronDown) : ChevronsUpDown
  return (
    <th className={`py-2 pr-2 font-medium ${column.align === 'right' ? 'text-right' : ''}`}
      aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" onClick={() => onSort(column)}
        className={`group inline-flex items-center gap-0.5 uppercase tracking-wide hover:text-gray-600 dark:hover:text-gray-200 ${active ? 'text-gray-700 dark:text-gray-200' : ''}`}>
        {column.label}
        <Icon as={icon} size={12} className={active ? '' : 'opacity-0 group-hover:opacity-60'} />
      </button>
    </th>
  )
}

// Tabla de Ingresos/Egresos (sección 4.1): fecha, item, categoría, banco,
// monto, lápiz (editar) y reloj-flecha (historial). Los títulos ordenan
// (en el cliente: el período ya viene entero). Click en la fila, en el lápiz
// o en el reloj abren el mismo modal de edición (con el historial y las notas).
// El orden elegido no se recuerda: al volver, arranca por fecha.
export default function MovementsTable({ movements, onEdit }) {
  const [sort, setSort] = useState(null)

  if (movements.length === 0) {
    return <p className="text-center text-sm text-gray-400 py-10">Sin movimientos en este período.</p>
  }

  function handleSort(column) {
    setSort(prev => prev?.key === column.key
      ? { key: column.key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
      : { key: column.key, dir: column.firstDir })
  }

  function handleRowClick(m) {
    // Si se estaba seleccionando texto (para copiar un monto o un nombre), no abrir el modal.
    if (window.getSelection?.()?.toString()) return
    onEdit(m)
  }

  const rows = sortMovements(movements, sort)

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wide text-gray-400 border-b border-gray-100 dark:border-gray-700">
            {COLUMNS.map(c => <SortHeader key={c.key} column={c} sort={sort} onSort={handleSort} />)}
            <th className="py-2 pl-2 font-medium text-right">​</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(m => (
            <tr key={m.id} onClick={() => handleRowClick(m)}
              className="border-b border-gray-50 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-900/30 cursor-pointer">
              <td className="py-2 pr-2 text-gray-500 dark:text-gray-400 whitespace-nowrap">{fmtDate(m.date)}</td>
              <td className="py-2 pr-2 text-gray-900 dark:text-white">
                {m.item?.name || '—'}
                {m.sourceMovementId != null && <span className="ml-1.5 text-[10px] text-amber-600 dark:text-amber-400" title="Generado automáticamente por un impuesto">· impuesto</span>}
                {m.check && <span className="ml-1.5 text-[10px] bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 rounded-full px-1.5 py-0.5">Cheque pendiente</span>}
              </td>
              <td className="py-2 pr-2 text-gray-500 dark:text-gray-400">{m.category?.name}</td>
              <td className="py-2 pr-2 text-gray-500 dark:text-gray-400">{m.account?.name}</td>
              <td className="py-2 pr-2 text-right font-medium text-gray-900 dark:text-white whitespace-nowrap">{fmtMoney(m.amount, m.account?.currency)}</td>
              <td className="py-2 pl-2 text-right whitespace-nowrap" onClick={e => e.stopPropagation()}>
                <button onClick={() => onEdit(m)} title="Editar" className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1"><Icon as={Pencil} size={14} /></button>
                <button onClick={() => onEdit(m)} title="Historial" className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1"><Icon as={History} size={14} /></button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
