import { useMemo, useState } from 'react'
import { statusDotClass } from './contentCatalog'
import { monthLabel } from './dateHelpers'
import MonthGrid, { currentMonthStr } from '../calendar/MonthGrid'

const MAX_CHIPS_PER_DAY = 4

/**
 * Grilla mensual de piezas de Contenido. Agrupa por `scheduledDate` (string ya
 * calculado por el backend en la timezone del proyecto — cero aritmética de zona
 * horaria acá). Arrastrar una pieza a otro día actualiza `scheduledAt`
 * preservando la hora que ya tenía (o mediodía si no tenía fecha).
 *
 * Layout de la grilla delegado a MonthGrid.jsx (compartido con el módulo
 * Calendario); acá solo vive el contenido de cada celda (chips + drag&drop).
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
    <MonthGrid
      month={month}
      onMonthChange={onMonthChange}
      monthLabel={monthLabel(month)}
      renderCell={(dateStr, isToday) => {
        const items = dateStr ? (byDay[dateStr] ?? []) : []
        const isOver = overDay === dateStr
        const dayNum = dateStr ? Number(dateStr.split('-')[2]) : null

        return (
          <div
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
                      {p.task?.status === 'IN_PROGRESS' && (
                        <span
                          title={`${p.owner?.name ?? 'Alguien'} está trabajando en esto ahora`}
                          className="shrink-0 w-1.5 h-1.5 rounded-full bg-primary-500 animate-pulse"
                        />
                      )}
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
      }}
    />
  )
}

export { currentMonthStr }
