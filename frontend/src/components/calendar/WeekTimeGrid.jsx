import { useMemo } from 'react'

function toMins(hhmm) {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

const HOUR_HEIGHT_PX = 48

/**
 * Grilla horaria genérica (columna de horas × N columnas) — no existe nada
 * reusable en el repo para esto (a diferencia de la grilla mensual, ver
 * MonthGrid.jsx). CSS puro, sin librería externa. Cada columna puede ser un
 * día (vista semanal de una persona) o una persona (comparar disponibilidad de
 * varias personas en un mismo día) — el caller decide vía `columns`.
 *
 * `columns`: [{ key, label, subLabel? }]
 * `getBlocks(key)`: → [{ id, start:"HH:MM", end:"HH:MM", title, tentative?, tone?, onClick? }]
 * `getWorkWindow(key)`: → { start, end } | null (null = todo el día disponible, sin sombreado)
 * `isFullDayOff(key)`: → boolean (licencia aprobada — sombrea toda la columna)
 * `onSlotClick(key, "HH:MM")`: click en un hueco vacío (para agendar ahí, redondeado a 15min)
 */
export default function WeekTimeGrid({
  columns, startHour = 7, endHour = 22, getBlocks, getWorkWindow, isFullDayOff, onSlotClick,
}) {
  const hours = useMemo(() => {
    const arr = []
    for (let h = startHour; h <= endHour; h++) arr.push(h)
    return arr
  }, [startHour, endHour])

  const totalMins = (endHour - startHour) * 60
  // hours incluye el límite superior (ej. 9..18 = 10 etiquetas para 9 horas de
  // rango) — la altura del contenedor debe representar las horas de rango
  // (N), no la cantidad de etiquetas (N+1), o las posiciones por porcentaje
  // (líneas, bloques) se estiran de más y se van desalineando hora a hora.
  const totalHeight = Math.max(1, hours.length - 1) * HOUR_HEIGHT_PX

  function topPct(hhmm) {
    const mins = Math.max(startHour * 60, Math.min(endHour * 60, toMins(hhmm)))
    return ((mins - startHour * 60) / totalMins) * 100
  }
  function heightPct(startStr, endStr) {
    const s = Math.max(startHour * 60, toMins(startStr))
    const e = Math.min(endHour * 60, toMins(endStr))
    return Math.max(0, ((e - s) / totalMins) * 100)
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="overflow-x-auto">
        <div className="flex" style={{ minWidth: 64 + columns.length * 140 }}>
          {/* Columna de horas — mismo sistema de posicionamiento por porcentaje
              que las líneas/bloques de las columnas de al lado, para que
              queden siempre alineadas (ver fix de totalHeight arriba) */}
          <div className="shrink-0 w-16 border-r border-gray-100 dark:border-gray-700">
            <div className="h-8" />
            <div className="relative" style={{ height: totalHeight }}>
              {hours.map(h => (
                <div
                  key={h}
                  style={{ top: `${topPct(`${String(h).padStart(2, '0')}:00`)}%` }}
                  className="absolute right-2 -translate-y-1/2 text-[10px] text-gray-400 dark:text-gray-500 whitespace-nowrap"
                >
                  {String(h).padStart(2, '0')}:00
                </div>
              ))}
            </div>
          </div>

          {/* Columnas (días o personas, según el caller) */}
          {columns.map(col => {
            const blocks = getBlocks ? getBlocks(col.key) : []
            const window = getWorkWindow ? getWorkWindow(col.key) : null
            const dayOff = isFullDayOff ? isFullDayOff(col.key) : false

            return (
              <div key={col.key} className="flex-1 min-w-[140px] border-r border-gray-100 dark:border-gray-700 last:border-r-0">
                <div className="h-8 flex items-center justify-center border-b border-gray-100 dark:border-gray-700 px-1">
                  <div className="text-center">
                    <div className="text-xs font-semibold text-gray-700 dark:text-gray-300 truncate">{col.label}</div>
                    {col.subLabel && <div className="text-[10px] text-gray-400 dark:text-gray-500">{col.subLabel}</div>}
                  </div>
                </div>
                <div
                  className="relative"
                  style={{ height: totalHeight }}
                  onClick={e => {
                    if (!onSlotClick || dayOff) return
                    const rect = e.currentTarget.getBoundingClientRect()
                    const pct = (e.clientY - rect.top) / rect.height
                    const mins = startHour * 60 + Math.round((pct * totalMins) / 15) * 15
                    const h = String(Math.floor(mins / 60)).padStart(2, '0')
                    const m = String(mins % 60).padStart(2, '0')
                    onSlotClick(col.key, `${h}:${m}`)
                  }}
                >
                  {/* Líneas de hora */}
                  {hours.map(h => (
                    <div
                      key={h}
                      className="absolute left-0 right-0 border-t border-gray-50 dark:border-gray-700/50"
                      style={{ top: `${topPct(`${String(h).padStart(2, '0')}:00`)}%` }}
                    />
                  ))}
                  {/* Líneas de media hora, más sutiles, para ubicar mejor los bloques */}
                  {hours.slice(0, -1).map(h => (
                    <div
                      key={`half-${h}`}
                      className="absolute left-0 right-0 border-t border-dashed border-gray-100 dark:border-gray-700/30"
                      style={{ top: `${topPct(`${String(h).padStart(2, '0')}:30`)}%` }}
                    />
                  ))}

                  {dayOff && (
                    <div className="absolute inset-0 bg-gray-100/70 dark:bg-gray-900/40 flex items-center justify-center pointer-events-none">
                      <span className="text-[10px] text-gray-400 dark:text-gray-500">Licencia</span>
                    </div>
                  )}

                  {!dayOff && window && (
                    <>
                      <div className="absolute left-0 right-0 bg-gray-50/70 dark:bg-gray-900/20 pointer-events-none" style={{ top: 0, height: `${topPct(window.start)}%` }} />
                      <div className="absolute left-0 right-0 bg-gray-50/70 dark:bg-gray-900/20 pointer-events-none" style={{ top: `${topPct(window.end)}%`, bottom: 0 }} />
                    </>
                  )}

                  {!dayOff && blocks.map(b => (
                    <div
                      key={b.id}
                      onClick={e => { e.stopPropagation(); b.onClick?.() }}
                      title={b.title}
                      className={`absolute left-1 right-1 rounded-md px-1.5 py-0.5 overflow-hidden cursor-pointer border ${
                        b.tentative
                          ? 'border-dashed border-amber-400 bg-amber-50/80 dark:bg-amber-900/20 dark:border-amber-600'
                          : b.tone === 'task'
                            ? 'border-gray-300 bg-gray-100 dark:bg-gray-700/60 dark:border-gray-600'
                            : 'border-primary-300 bg-primary-50 dark:bg-primary-900/30 dark:border-primary-700'
                      }`}
                      style={{ top: `${topPct(b.start)}%`, height: `${Math.max(heightPct(b.start, b.end), 3)}%` }}
                    >
                      <span className="text-[10px] font-medium text-gray-700 dark:text-gray-200 truncate block">{b.title}</span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
