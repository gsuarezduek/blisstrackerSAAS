import { useMemo } from 'react'

const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

function shiftMonth(month, delta) {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function currentMonthStr() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function todayYMD() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Celdas del grid: null = relleno fuera de mes (semana Lun-primero), string = "YYYY-MM-DD".
// El largo siempre es múltiplo de 7 (5 o 6 semanas según cómo caiga el mes).
function buildGridDays(month) {
  const [y, m] = month.split('-').map(Number)
  const firstOfMonth = new Date(y, m - 1, 1)
  const daysInMonth = new Date(y, m, 0).getDate()
  const leading = (firstOfMonth.getDay() + 6) % 7 // getDay(): 0=domingo → Lunes=0
  const cells = Array(leading).fill(null)
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(`${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`)
  }
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}

/**
 * Grilla mensual genérica (CSS Grid a mano, sin librería) — extraída de
 * ContentCalendarView.jsx para reusarse también en el módulo Calendario. El
 * caller es 100% dueño del contenido/estilo de cada celda vía
 * `renderCell(dateStr, isToday, index)` — devuelve el `<div>` completo de la
 * celda (bordes, alto mínimo, contenido); acá solo se resuelve el layout del
 * mes (navegación + grilla de 7 columnas).
 */
export default function MonthGrid({ month, onMonthChange, monthLabel, renderCell }) {
  const cells = useMemo(() => buildGridDays(month), [month])
  const today = useMemo(() => todayYMD(), [])

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      {/* Navegación de mes */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 capitalize">{monthLabel}</h3>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onMonthChange(shiftMonth(month, -1))}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            ‹
          </button>
          <button
            onClick={() => onMonthChange(currentMonthStr())}
            className="px-2.5 py-1 text-xs font-medium rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            Hoy
          </button>
          <button
            onClick={() => onMonthChange(shiftMonth(month, 1))}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            ›
          </button>
        </div>
      </div>

      {/* Grilla — scrollea en horizontal en pantallas angostas para no romper el layout de la página */}
      <div className="overflow-x-auto">
        <div className="min-w-[720px]">
          <div className="grid grid-cols-7 border-b border-gray-100 dark:border-gray-700">
            {WEEKDAYS.map(w => (
              <div key={w} className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 text-center">
                {w}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7">
            {cells.map((dateStr, i) => (
              // display:contents — no debe interferir con el grid-cols-7 del padre.
              <div key={i} className="contents">
                {renderCell(dateStr, dateStr === today, i)}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export { currentMonthStr, buildGridDays }
