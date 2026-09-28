import { useMemo, useState } from 'react'
import { monthLabel } from '../contenido/dateHelpers'
import MonthGrid, { currentMonthStr } from '../calendar/MonthGrid'
import { clientStatus } from './clientStatus'

const MAX_CHIPS_PER_DAY = 3

/**
 * Vista Calendario del tab Contenido del portal de cliente. Solo lectura: agrupa
 * las piezas por `scheduledDate` (ya calculado por el backend en la timezone del
 * proyecto) sobre el mismo MonthGrid que usa el equipo, sin drag & drop. Tocar
 * una pieza llama a `onOpen(piece)` — el padre la abre en <PieceReviewer>, la
 * misma vista enfocada que usa la lista, así la lógica de decisión no se
 * duplica. Las que esperan aprobación se destacan.
 */
export default function ClientContentCalendar({ pieces, brandPrimary, onOpen }) {
  const [month, setMonth] = useState(currentMonthStr())

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

  const undated = pieces.filter(p => !p.scheduledDate)
  const accent = brandPrimary || '#F7931A'

  return (
    <div>
      <MonthGrid
        month={month}
        onMonthChange={setMonth}
        monthLabel={monthLabel(month)}
        renderCell={(dateStr, isToday) => {
          const items = dateStr ? (byDay[dateStr] ?? []) : []
          const dayNum = dateStr ? Number(dateStr.split('-')[2]) : null
          return (
            <div className={`min-h-[92px] border-b border-r border-gray-100 p-1.5 ${!dateStr ? 'bg-gray-50/50' : ''}`}>
              {dateStr && (
                <>
                  <div
                    className={`text-xs mb-1 w-5 h-5 flex items-center justify-center rounded-full ${isToday ? 'text-white font-semibold' : 'text-gray-400'}`}
                    style={isToday ? { backgroundColor: accent } : undefined}
                  >
                    {dayNum}
                  </div>
                  <div className="space-y-1">
                    {items.slice(0, MAX_CHIPS_PER_DAY).map(p => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => onOpen(p)}
                        title={`${p.title} — ${clientStatus(p.status).label}`}
                        className={`w-full text-left flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-gray-100 transition-colors ${
                          p.canDecide ? 'bg-amber-50 ring-1 ring-amber-300' : 'bg-gray-50'}`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${clientStatus(p.status).dot}`} />
                        <span className="text-[11px] text-gray-700 truncate">{p.title}</span>
                      </button>
                    ))}
                    {items.length > MAX_CHIPS_PER_DAY && (
                      <p className="text-[10px] text-gray-400 px-1.5">+{items.length - MAX_CHIPS_PER_DAY} más</p>
                    )}
                  </div>
                </>
              )}
            </div>
          )
        }}
      />

      {undated.length > 0 && (
        <p className="mt-2 text-xs text-gray-400">
          {undated.length} {undated.length === 1 ? 'pieza todavía no tiene' : 'piezas todavía no tienen'} fecha
          de publicación — la{undated.length === 1 ? '' : 's'} ves en «Todo el contenido».
        </p>
      )}

    </div>
  )
}
