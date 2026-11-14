// Evolución mes a mes de visitas y eventos clave (últimos 12 meses).
//
// Mismo lenguaje visual que GeoScoreChart: SVG dibujado al ancho real del
// contenedor (sin estirar), columna de hover por mes y tooltip flotante. Dos
// series con escalas distintas a propósito — barras para el volumen de visitas
// y línea para los eventos clave, que suelen ser dos órdenes de magnitud más
// chicos y en una sola escala quedarían pegados al piso.
//
// Dos reglas que vienen del resto del módulo: un mes sin dato se dibuja como
// "s/d" y nunca como 0 (igual que ReportHistory), y el mes EN CURSO va rayado,
// porque comparar su altura con un mes cerrado es el error que esta pantalla
// justamente trata de no cometer.
import { useEffect, useRef, useState } from 'react'
import { fmt } from './webTabHelpers'

const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const MONTHS_LONG  = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

const SESSIONS_COLOR = '#f97316' // primary-500
const EVENTS_COLOR   = '#3b82f6'

const HEIGHT = 230
const PAD = { top: 28, right: 12, bottom: 38, left: 12 }

export function monthShort(month) {
  const [y, m] = month.split('-').map(Number)
  return { label: MONTHS_SHORT[m - 1], year: String(y).slice(2), isJan: m === 1 }
}
export function monthLong(month) {
  const [y, m] = month.split('-').map(Number)
  return `${MONTHS_LONG[m - 1]} ${y}`
}

/** Variación % contra el mes anterior de la serie. null si falta alguno de los dos. */
export function pctChange(curr, prev) {
  if (curr == null || prev == null || prev === 0) return null
  return Math.round(((curr - prev) / prev) * 100)
}

export default function MonthlyTrendChart({ series, throughDate }) {
  const wrapRef = useRef(null)
  const [width, setWidth] = useState(640)
  const [active, setActive] = useState(null)

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const update = () => { if (el.clientWidth) setWidth(el.clientWidth) }
    update()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const points = series ?? []
  if (points.filter(p => p.sessions != null).length < 2) return null

  const maxSessions = Math.max(1, ...points.map(p => p.sessions ?? 0))
  const hasEvents   = points.some(p => (p.keyEvents ?? 0) > 0)
  const maxEvents   = Math.max(1, ...points.map(p => p.keyEvents ?? 0))

  const plotW = Math.max(width - PAD.left - PAD.right, 160)
  const plotH = HEIGHT - PAD.top - PAD.bottom
  const base  = PAD.top + plotH
  const slot  = plotW / points.length
  const cx    = i => PAD.left + slot * i + slot / 2
  const barW  = Math.min(slot * 0.52, 34)
  const ySessions = v => base - (v / maxSessions) * plotH
  const yEvents   = v => base - (v / maxEvents) * (plotH * 0.82)

  // La línea de eventos se corta donde falta el dato (no se interpola un mes sin medir)
  const eventSegments = []
  if (hasEvents) {
    let cur = []
    points.forEach((p, i) => {
      if (p.keyEvents == null) { if (cur.length) eventSegments.push(cur); cur = [] }
      else cur.push([cx(i), yEvents(p.keyEvents)])
    })
    if (cur.length) eventSegments.push(cur)
  }

  const last = points.length - 1
  const act  = active != null ? points[active] : null
  const prev = active > 0 ? points[active - 1] : null

  const TIP_W = 212
  const tipLeft = act ? Math.min(Math.max(cx(active) - TIP_W / 2, 0), Math.max(width - TIP_W, 0)) : 0

  const deltaSessions = act && prev ? pctChange(act.sessions, prev.sessions) : null
  const deltaEvents    = act && prev ? pctChange(act.keyEvents, prev.keyEvents) : null
  const deltaText = (d, prevMonth) => {
    if (d == null) return null
    const arrow = d > 0 ? '↑' : d < 0 ? '↓' : '='
    const cls = d > 0 ? 'text-emerald-600 dark:text-emerald-400' : d < 0 ? 'text-red-500 dark:text-red-400' : 'text-gray-400'
    return <span className={`text-[11px] font-medium ${cls}`}>{arrow}{d !== 0 ? ` ${Math.abs(d)}%` : ''} vs {monthShort(prevMonth).label}</span>
  }

  return (
    <div ref={wrapRef} className="relative select-none" onMouseLeave={() => setActive(null)}>
      {/* Leyenda */}
      <div className="flex items-center gap-4 mb-1">
        <span className="flex items-center gap-1.5 text-[11px] text-gray-500 dark:text-gray-400">
          <span className="w-2.5 h-2.5 rounded-sm" style={{ background: SESSIONS_COLOR }} /> Visitas (sesiones)
        </span>
        {hasEvents && (
          <span className="flex items-center gap-1.5 text-[11px] text-gray-500 dark:text-gray-400">
            <span className="w-3 h-0.5 rounded" style={{ background: EVENTS_COLOR }} /> Eventos clave
          </span>
        )}
        <span className="ml-auto text-[11px] text-gray-400">Escalas independientes</span>
      </div>

      <svg
        width={width} height={HEIGHT} viewBox={`0 0 ${width} ${HEIGHT}`}
        className="block max-w-full overflow-visible" role="img"
        aria-label={`Visitas y eventos clave por mes: ${points.map(p => `${monthLong(p.month)}: ${p.sessions ?? 'sin dato'} visitas`).join('; ')}`}
      >
        <defs>
          {/* Mes en curso: rayado = "todavía no terminó", no "le fue peor" */}
          <pattern id="mtc-partial" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="5" height="5" fill={SESSIONS_COLOR} fillOpacity="0.28" />
            <line x1="0" y1="0" x2="0" y2="5" stroke={SESSIONS_COLOR} strokeWidth="2.5" />
          </pattern>
        </defs>

        <line x1={PAD.left} x2={PAD.left + plotW} y1={base} y2={base} stroke="currentColor" strokeWidth="1" className="text-gray-200 dark:text-gray-700" />

        {active != null && (
          <rect x={PAD.left + slot * active} y={PAD.top - 8} width={slot} height={plotH + 8} className="fill-gray-100 dark:fill-gray-700/40" />
        )}

        {/* Barras de visitas */}
        {points.map((p, i) => {
          if (p.sessions == null) {
            return (
              <text key={`sd-${i}`} x={cx(i)} y={base - 6} textAnchor="middle" fontSize="9.5" className="fill-gray-300 dark:fill-gray-600">
                s/d
              </text>
            )
          }
          const h = Math.max(base - ySessions(p.sessions), p.sessions > 0 ? 2 : 0)
          return (
            <rect
              key={`bar-${i}`}
              x={cx(i) - barW / 2} y={base - h} width={barW} height={h} rx="3"
              fill={p.partial ? 'url(#mtc-partial)' : SESSIONS_COLOR}
              fillOpacity={p.partial ? 1 : i === active || i === last ? 0.95 : 0.72}
            />
          )
        })}

        {/* Línea de eventos clave */}
        {eventSegments.map((seg, si) => (
          <polyline
            key={`ev-${si}`}
            points={seg.map(pt => pt.join(',')).join(' ')}
            fill="none" stroke={EVENTS_COLOR} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"
          />
        ))}
        {hasEvents && points.map((p, i) => p.keyEvents == null ? null : (
          <circle
            key={`evp-${i}`} cx={cx(i)} cy={yEvents(p.keyEvents)}
            r={i === active ? 5 : 3} fill={i === active ? EVENTS_COLOR : 'white'}
            stroke={EVENTS_COLOR} strokeWidth="2" className={i === active ? undefined : 'dark:fill-gray-800'}
          />
        ))}

        {/* Valor del mes activo (y del último, para que el gráfico se lea sin hover) */}
        {points.map((p, i) => (i !== active && i !== last) || p.sessions == null ? null : (
          <text
            key={`lbl-${i}`} x={cx(i)} y={Math.max(ySessions(p.sessions) - 7, 12)} textAnchor="middle"
            fontSize="11" fontWeight="700" fill={SESSIONS_COLOR}
          >
            {fmt(p.sessions)}
          </text>
        ))}

        {/* Eje X */}
        {points.map((p, i) => {
          const { label, year, isJan } = monthShort(p.month)
          const on = i === active || i === last
          return (
            <g key={`x-${i}`}>
              <text x={cx(i)} y={HEIGHT - 20} textAnchor="middle" fontSize="10.5" fontWeight={on ? 700 : 400}
                className={on ? 'fill-gray-800 dark:fill-gray-100' : 'fill-gray-400 dark:fill-gray-500'}>
                {label}
              </text>
              {(isJan || i === 0) && (
                <text x={cx(i)} y={HEIGHT - 8} textAnchor="middle" fontSize="9" className="fill-gray-300 dark:fill-gray-600">
                  {year}
                </text>
              )}
            </g>
          )
        })}

        {/* Columnas de hover/tap */}
        {points.map((p, i) => (
          <rect
            key={`hit-${i}`} x={PAD.left + slot * i} y={0} width={slot} height={HEIGHT}
            fill="transparent" className="cursor-pointer outline-none" tabIndex={0}
            aria-label={`${monthLong(p.month)}: ${p.sessions == null ? 'sin datos' : `${p.sessions} visitas`}`}
            onMouseEnter={() => setActive(i)} onFocus={() => setActive(i)} onBlur={() => setActive(null)}
            onClick={() => setActive(i)}
          />
        ))}
      </svg>

      {act && (
        <div
          className="pointer-events-none absolute z-10 rounded-xl border border-gray-200 dark:border-gray-700 bg-white/95 dark:bg-gray-800/95 shadow-lg px-3 py-2"
          style={{ left: tipLeft, width: TIP_W, top: PAD.top + 6 }}
          role="tooltip"
        >
          <p className="text-xs font-semibold text-gray-900 dark:text-white">{monthLong(act.month)}</p>
          <div className="mt-1 space-y-1">
            <div className="flex items-baseline gap-1.5">
              <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: SESSIONS_COLOR }} />
              <span className="text-sm font-bold tabular-nums" style={{ color: SESSIONS_COLOR }}>
                {act.sessions == null ? 's/d' : fmt(act.sessions)}
              </span>
              <span className="text-[11px] text-gray-400">visitas</span>
            </div>
            {prev && deltaText(deltaSessions, prev.month)}
            {hasEvents && (
              <div className="flex items-baseline gap-1.5">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: EVENTS_COLOR }} />
                <span className="text-sm font-bold tabular-nums" style={{ color: EVENTS_COLOR }}>
                  {act.keyEvents == null ? 's/d' : fmt(act.keyEvents)}
                </span>
                <span className="text-[11px] text-gray-400">eventos clave</span>
              </div>
            )}
            {hasEvents && prev && deltaText(deltaEvents, prev.month)}
            {act.activeUsers != null && (
              <p className="text-[11px] text-gray-400 tabular-nums">{fmt(act.activeUsers)} usuarios · {fmt(act.pageviews)} páginas vistas</p>
            )}
          </div>
          {act.partial && (
            <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-1 leading-snug">
              Mes en curso{throughDate ? ` — datos hasta el ${Number(throughDate.slice(8, 10))}` : ''}. No es comparable con un mes cerrado.
            </p>
          )}
          {act.sessions == null && (
            <p className="text-[10px] text-gray-400 mt-1 leading-snug">
              Google Analytics no devolvió datos de este mes.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
