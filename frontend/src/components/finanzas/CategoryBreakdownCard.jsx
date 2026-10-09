import { fmtMoney } from '../../utils/format'

// "Gastos por categoría" / "Ingresos por categoría" (sección 4.3): monto, %
// del total, barra horizontal, de mayor a menor — ya vienen ordenados del backend.
export default function CategoryBreakdownCard({ title, total, rows, currency, barColor }) {
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{title}</h3>
        <span className="text-sm text-gray-500 dark:text-gray-400">Total {fmtMoney(total, currency)}</span>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-6">Sin movimientos este mes.</p>
      ) : (
        <div className="space-y-3">
          {rows.map(r => (
            <div key={r.categoryId}>
              <div className="flex items-center justify-between text-sm mb-1">
                <span className="text-gray-700 dark:text-gray-300 truncate">{r.name}</span>
                <span className="text-gray-500 dark:text-gray-400 shrink-0 ml-2">{fmtMoney(r.amount, currency)} · {r.pct}%</span>
              </div>
              <div className="h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                <div className={`h-full ${barColor} rounded-full`} style={{ width: `${Math.min(100, r.pct)}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
