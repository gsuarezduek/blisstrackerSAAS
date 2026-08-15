import { useMemo, useState } from 'react'
import { statusDotClass } from './contentCatalog'

const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const MAX_CHIPS_PER_DAY = 4

function shiftMonth(month, delta) {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function currentMonthStr() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function monthLabel(month) {
  const [y, m] = month.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
}

// Celdas del grid: null = relleno fuera de mes (Lun-primero), string = "YYYY-MM-DD".
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
 * Grilla mensual. Agrupa por `scheduledDate` (string ya calculado por el
 * backend en la timezone del proyecto — cero aritmética de zona horaria acá).
 * Arrastrar una pieza a otro día actualiza `scheduledAt` preservando la hora
 * que ya tenía (o mediodía si no tenía fecha).
 *
 * Las piezas sin fecha no aparecen acá — se editan desde la Tabla o el Kanban.
 */
export default function ContentCalendarView({ pieces, month, onMonthChange, canEdit, onUpdate, onOpen }) {
  const [dragId, setDragId] = useState(null)
  const [overDay, setOverDay] = useState(null)

  const byDay = useMemo(() => {
    const map = {}
    for (const p of pieces) {
      if (!p.scheduledDate) continue
      ;(map[p.scheduledDate] ??= []).push(p)
    }
    for (const key of Object.keys(map)) {
      map[key].sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt))
    }
    return map
  }, [pieces])

  const cells = useMemo(() => buildGridDays(month), [month])
  const todayStr = useMemo(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }, [])

  function handleDrop(dateStr) {
    const id = dragId
    setDragId(null)
    setOverDay(null)
    if (!id) return
    const piece = pieces.find(p => p.id === id)
    if (!piece || piece.scheduledDate === dateStr) return

    const prevTime = piece.scheduledAt ? new Date(piece.scheduledAt) : null
    const [y, m, d] = dateStr.split('-').map(Number)
    const next = new Date(y, m - 1, d, prevTime ? prevTime.getHours() : 12, prevTime ? prevTime.getMinutes() : 0)

    // scheduledDate viaja en el patch para que el optimismo local del hook
    // muestre la pieza en la celda correcta al instante, sin esperar la
    // respuesta del servidor (que igual la recalcula y es la autoritativa).
    onUpdate(id, { scheduledAt: next.toISOString(), scheduledDate: dateStr })
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      {/* Navegación de mes */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 capitalize">{monthLabel(month)}</h3>
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
            {cells.map((dateStr, i) => {
              const items = dateStr ? (byDay[dateStr] ?? []) : []
              const isToday = dateStr === todayStr
              const isOver = overDay === dateStr
              const dayNum = dateStr ? Number(dateStr.split('-')[2]) : null

              return (
                <div
                  key={i}
                  onDragOver={e => { if (canEdit && dateStr) { e.preventDefault(); setOverDay(dateStr) } }}
                  onDragLeave={() => setOverDay(d => (d === dateStr ? null : d))}
                  onDrop={() => canEdit && dateStr && handleDrop(dateStr)}
                  className={`min-h-[92px] border-b border-r border-gray-100 dark:border-gray-700 p-1.5 transition-colors ${
                    !dateStr ? 'bg-gray-50/50 dark:bg-gray-900/20' : ''} ${
                    isOver ? 'bg-primary-50 dark:bg-primary-900/10' : ''}`}
                >
                  {dateStr && (
                    <>
                      <div className={`text-xs mb-1 w-5 h-5 flex items-center justify-center rounded-full ${
                        isToday ? 'bg-primary-600 text-white font-semibold' : 'text-gray-400 dark:text-gray-500'}`}>
                        {dayNum}
                      </div>
                      <div className="space-y-1">
                        {items.slice(0, MAX_CHIPS_PER_DAY).map(p => (
                          <div
                            key={p.id}
                            draggable={canEdit}
                            onDragStart={() => setDragId(p.id)}
                            onDragEnd={() => { setDragId(null); setOverDay(null) }}
                            onClick={() => onOpen(p)}
                            title={p.title}
                            className={`flex items-center gap-1 px-1.5 py-0.5 rounded bg-gray-50 dark:bg-gray-900/40 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer transition-colors ${
                              dragId === p.id ? 'opacity-40' : ''}`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusDotClass(p.status)}`} />
                            <span className="text-[11px] text-gray-700 dark:text-gray-300 truncate">{p.title}</span>
                          </div>
                        ))}
                        {items.length > MAX_CHIPS_PER_DAY && (
                          <p className="text-[10px] text-gray-400 dark:text-gray-500 px-1.5">+{items.length - MAX_CHIPS_PER_DAY} más</p>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

export { currentMonthStr }
