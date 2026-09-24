import { useMemo, useState, useEffect } from 'react'
import { statusDotClass, statusMeta } from '../contenido/contentCatalog'
import { monthLabel } from '../contenido/dateHelpers'
import MonthGrid, { currentMonthStr } from '../calendar/MonthGrid'
import ClientPieceCard from './ClientPieceCard'

const MAX_CHIPS_PER_DAY = 3

/**
 * Vista Calendario del tab Contenido del portal de cliente. Solo lectura: agrupa
 * las piezas por `scheduledDate` (ya calculado por el backend en la timezone del
 * proyecto) sobre el mismo MonthGrid que usa el equipo, sin drag & drop. Tocar
 * una pieza abre su ClientPieceCard completa (assets, copy, aprobar/pedir
 * cambios, comentarios) en un modal — misma tarjeta que la vista Lista, así que
 * la lógica de decisión no se duplica. Las que esperan aprobación se destacan.
 */
export default function ClientContentCalendar({ pieces, slug, token, requireReauth, brandPrimary, onChanged }) {
  const [month, setMonth]     = useState(currentMonthStr())
  const [openId, setOpenId]   = useState(null)

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
  const openPiece = openId != null ? pieces.find(p => p.id === openId) : null
  const accent = brandPrimary || '#F7931A'

  useEffect(() => {
    if (!openPiece) return
    const onKey = e => { if (e.key === 'Escape') setOpenId(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openPiece])

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
                        onClick={() => setOpenId(p.id)}
                        title={`${p.title} — ${statusMeta(p.status)?.label ?? p.status}`}
                        className={`w-full text-left flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-gray-100 transition-colors ${
                          p.canDecide ? 'bg-amber-50 ring-1 ring-amber-300' : 'bg-gray-50'}`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusDotClass(p.status)}`} />
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
          de publicación — la{undated.length === 1 ? '' : 's'} ves en la vista Lista.
        </p>
      )}

      {openPiece && (
        <div
          className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/40 p-3 overflow-y-auto"
          onClick={() => setOpenId(null)}
        >
          <div
            className="relative w-full max-w-2xl my-4"
            onClick={e => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setOpenId(null)}
              aria-label="Cerrar"
              className="absolute -top-2 -right-2 z-10 w-8 h-8 rounded-full bg-white shadow border border-gray-200 text-gray-500 hover:text-gray-800"
            >
              ×
            </button>
            <ClientPieceCard
              key={openPiece.id}
              slug={slug} token={token} requireReauth={requireReauth}
              piece={openPiece} brandPrimary={brandPrimary} onChanged={onChanged} defaultOpen
            />
          </div>
        </div>
      )}
    </div>
  )
}
