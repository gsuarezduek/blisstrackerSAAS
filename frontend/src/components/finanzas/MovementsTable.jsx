import { Pencil, History } from 'lucide-react'
import { Icon } from '../ui/Icon'
import { fmtMoney } from '../../utils/format'

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })
}

// Tabla de Ingresos/Egresos (sección 4.1): fecha, item, categoría, banco,
// monto, lápiz (editar) y reloj-flecha (historial) — ambos abren el mismo
// modal de edición (que ya incluye el historial en su columna derecha).
export default function MovementsTable({ movements, onEdit }) {
  if (movements.length === 0) {
    return <p className="text-center text-sm text-gray-400 py-10">Sin movimientos en este período.</p>
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wide text-gray-400 border-b border-gray-100 dark:border-gray-700">
            <th className="py-2 pr-2 font-medium">Fecha</th>
            <th className="py-2 pr-2 font-medium">Item</th>
            <th className="py-2 pr-2 font-medium">Categoría</th>
            <th className="py-2 pr-2 font-medium">Banco</th>
            <th className="py-2 pr-2 font-medium text-right">Monto</th>
            <th className="py-2 pl-2 font-medium text-right">​</th>
          </tr>
        </thead>
        <tbody>
          {movements.map(m => (
            <tr key={m.id} className="border-b border-gray-50 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-900/30">
              <td className="py-2 pr-2 text-gray-500 dark:text-gray-400 whitespace-nowrap">{fmtDate(m.date)}</td>
              <td className="py-2 pr-2 text-gray-900 dark:text-white">
                {m.item?.name || '—'}
                {m.sourceMovementId != null && <span className="ml-1.5 text-[10px] text-amber-600 dark:text-amber-400" title="Generado automáticamente por un impuesto">· impuesto</span>}
                {m.check && <span className="ml-1.5 text-[10px] bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 rounded-full px-1.5 py-0.5">Cheque pendiente</span>}
              </td>
              <td className="py-2 pr-2 text-gray-500 dark:text-gray-400">{m.category?.name}</td>
              <td className="py-2 pr-2 text-gray-500 dark:text-gray-400">{m.account?.name}</td>
              <td className="py-2 pr-2 text-right font-medium text-gray-900 dark:text-white whitespace-nowrap">{fmtMoney(m.amount, m.account?.currency)}</td>
              <td className="py-2 pl-2 text-right whitespace-nowrap">
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
