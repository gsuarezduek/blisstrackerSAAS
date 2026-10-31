import { useState, useEffect, useMemo, useRef } from 'react'
import api from '../../api/client'
import { shortMonthLabel, monthLabel } from './dateHelpers'
import { currentMonthStr, shiftMonth } from '../calendar/MonthGrid'

/**
 * Pestañas por mes — la navegación primaria de la Tabla (criterio Airtable: un
 * mes por pestaña, y adentro TODAS las piezas de ese mes sin importar su
 * estado). Reemplazó al select "Todos los meses" que era un filtro más entre
 * cuatro: el acotamiento por mes es lo que permite mostrar también las piezas
 * ya publicadas sin que la lista crezca sin fin (ver el default de `listPieces`).
 *
 * El mes activo vive en la URL (`?month=`), compartido con la navegación ‹ › del
 * Calendario — cambiar de vista conserva el mes.
 *
 * "Sin programar" (`month=none`) es una pestaña fija, no un mes: las piezas en
 * Idea todavía no tienen fecha y sin ella quedarían invisibles en una
 * navegación puramente mensual.
 */
export default function ContentMonthTabs({ projectId, month, onChange, refreshKey }) {
  const [data, setData] = useState({ months: [], counts: {}, unscheduled: 0 })
  const activeRef = useRef(null)

  useEffect(() => {
    if (!projectId) { setData({ months: [], counts: {}, unscheduled: 0 }); return }
    let cancelled = false
    api.get(`/contenido/projects/${projectId}/pieces/months`)
      .then(r => {
        if (cancelled) return
        setData({
          months: r.data.months ?? [],
          counts: r.data.counts ?? {},
          unscheduled: r.data.unscheduled ?? 0,
        })
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [projectId, refreshKey])

  // Siempre se ofrecen el mes actual y el siguiente (para poder empezar a cargar
  // un mes todavía vacío) y el mes activo (puede venir de un deep-link o de la
  // navegación ‹ › del Calendario, fuera de los meses con contenido).
  const months = useMemo(() => {
    const now = currentMonthStr()
    const set = new Set([...data.months, now, shiftMonth(now, 1)])
    if (month && month !== 'none') set.add(month)
    return [...set].sort()
  }, [data.months, month])

  // Con muchos meses la fila scrollea; que el activo quede a la vista al entrar.
  // `block: 'nearest'` para que no arrastre el scroll de la página entera.
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest', inline: 'center' })
  }, [month, months.length])

  if (!projectId) return null

  const now = currentMonthStr()
  const showUnscheduled = data.unscheduled > 0 || month === 'none'

  function tabClass(active) {
    return `shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
      active
        ? 'bg-primary-600 text-white shadow-sm'
        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700'}`
  }

  return (
    <div className="mb-3 flex items-center gap-1 overflow-x-auto bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-1">
      {showUnscheduled && (
        <button
          ref={month === 'none' ? activeRef : null}
          onClick={() => onChange('none')}
          title="Piezas sin fecha de publicación todavía (ej. ideas)"
          className={tabClass(month === 'none')}
        >
          Sin programar
          {data.unscheduled ? <span className="ml-1.5 opacity-60 text-xs">{data.unscheduled}</span> : null}
        </button>
      )}

      {showUnscheduled && <span className="shrink-0 w-px h-5 bg-gray-200 dark:bg-gray-700 mx-0.5" />}

      {months.map(m => {
        const active = m === month
        const count = data.counts[m] ?? 0
        return (
          <button
            key={m}
            ref={active ? activeRef : null}
            onClick={() => onChange(m)}
            title={monthLabel(m)}
            className={tabClass(active)}
          >
            <span className="capitalize">{shortMonthLabel(m)}</span>
            {m === now && !active && <span className="ml-1 w-1.5 h-1.5 rounded-full bg-primary-500 inline-block align-middle" />}
            {count ? <span className="ml-1.5 opacity-60 text-xs">{count}</span> : null}
          </button>
        )
      })}
    </div>
  )
}
