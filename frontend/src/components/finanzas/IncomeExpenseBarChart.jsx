import { fmtMoney } from '../../utils/format'

const CHART_HEIGHT = 160

const MONTH_LABELS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
function monthLabel(key) {
  const [y, m] = key.split('-')
  return `${MONTH_LABELS[Number(m) - 1]} ${y.slice(2)}`
}

// Gráfico de barras agrupadas ingresos vs. egresos por mes (sección 4.3), con
// la diferencia debajo de cada mes. Hecho con divs puros (sin librería de
// charts — el repo no tiene ninguna instalada todavía, decisión confirmada
// con el usuario) siguiendo el mismo criterio "barra con width/height %" que
// ya usa el resto de la app (ver pages/superadmin/metrics.jsx FunnelView).
export default function IncomeExpenseBarChart({ series, currency }) {
  if (series.length === 0) {
    return <p className="text-sm text-gray-400 text-center py-10">Sin movimientos en este rango.</p>
  }

  const max = Math.max(1, ...series.flatMap(s => [Number(s.income), Number(s.expense)]))

  return (
    <div>
      <div className="flex items-center gap-4 mb-3 text-xs">
        <span className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400"><span className="w-2.5 h-2.5 rounded-sm bg-primary-500 inline-block" /> Ingresos</span>
        <span className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400"><span className="w-2.5 h-2.5 rounded-sm bg-orange-400 inline-block" /> Egresos</span>
      </div>

      <div className="flex items-end gap-4 overflow-x-auto pb-1" style={{ height: CHART_HEIGHT + 20 }}>
        {series.map(s => {
          const incomeH = Math.round((Number(s.income) / max) * CHART_HEIGHT)
          const expenseH = Math.round((Number(s.expense) / max) * CHART_HEIGHT)
          return (
            <div key={s.month} className="flex flex-col items-center shrink-0" style={{ width: 56 }}>
              <div className="flex items-end gap-1" style={{ height: CHART_HEIGHT }}>
                <div className="w-5 bg-primary-500 rounded-t" style={{ height: Math.max(2, incomeH) }} title={fmtMoney(s.income, currency)} />
                <div className="w-5 bg-orange-400 rounded-t" style={{ height: Math.max(2, expenseH) }} title={fmtMoney(s.expense, currency)} />
              </div>
            </div>
          )
        })}
      </div>

      <div className="flex gap-4 overflow-x-auto">
        {series.map(s => (
          <div key={s.month} className="flex flex-col items-center shrink-0 text-center" style={{ width: 56 }}>
            <p className="text-xs font-medium text-gray-700 dark:text-gray-300">{monthLabel(s.month)}</p>
            <p className={`text-[11px] ${Number(s.diff) >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
              {Number(s.diff) >= 0 ? '+' : ''}{fmtMoney(s.diff, currency)}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}
