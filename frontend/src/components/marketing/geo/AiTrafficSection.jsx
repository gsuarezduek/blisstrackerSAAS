import { useState, useEffect, useRef } from 'react'
import api from '../../../api/client'
import { AI_META } from './geoHelpers'

// ─── AI Traffic ───────────────────────────────────────────────────────────────

const SOURCE_KEYS = Object.keys(AI_META)
const hexOf = (key) => AI_META[key]?.hex ?? '#9ca3af'

const MONTH_LONG = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
function monthLabel(month) {
  const [y, m] = month.split('-').map(Number)
  const name = MONTH_LONG[m - 1] ?? month
  return `${name[0].toUpperCase()}${name.slice(1)} ${y}`
}

const HEIGHT = 150
const PAD = { top: 24, right: 8, bottom: 24, left: 8 }
const GAP = 8

// Barras apiladas por fuente de IA (no solo el total): deja ver de un vistazo si el
// tráfico viene concentrado en una sola IA o repartido, además de la evolución mes a
// mes. `geoResolutions` (opcional) marca con un punto los meses en que se completó
// alguna recomendación GEO — referencia visual para leer "¿el tráfico cambió por los
// meses alrededor?", no una medición causal (el tráfico IA es mensual y de todo el
// sitio, no atribuible a una recomendación puntual).
function AiBarChart({ history, geoResolutions }) {
  const wrapRef = useRef(null)
  const [width, setWidth] = useState(360)
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

  if (!history?.length) return null

  const resolutionsByMonth = new Map((geoResolutions ?? []).map(r => [r.month, r.items]))

  const months = history.map(h => {
    const bySource = SOURCE_KEYS.map(key => ({ key, value: h[key] || 0 })).filter(s => s.value > 0)
    const total = bySource.reduce((s, b) => s + b.value, 0)
    return { month: h.month, total, bySource, resolved: resolutionsByMonth.get(h.month) }
  })

  const usedSources = SOURCE_KEYS.filter(key => months.some(m => m.bySource.some(b => b.key === key)))
  const hasAnyResolution = months.some(m => m.resolved?.length)
  const maxVal = Math.max(...months.map(m => m.total), 1)

  const plotW  = Math.max(width - PAD.left - PAD.right, 100)
  const plotH  = HEIGHT - PAD.top - PAD.bottom
  const slotW  = plotW / months.length
  const barW   = Math.max(slotW - GAP, 4)

  const act = active != null ? months[active] : null
  const TIP_W = 180
  const actX  = active != null ? PAD.left + slotW * active + slotW / 2 : 0
  const tipLeft = act ? Math.min(Math.max(actX - TIP_W / 2, 0), width - TIP_W) : 0

  return (
    <div ref={wrapRef} className="relative select-none" onMouseLeave={() => setActive(null)}>
      <svg width={width} height={HEIGHT} viewBox={`0 0 ${width} ${HEIGHT}`} className="block max-w-full overflow-visible" role="img"
        aria-label={`Sesiones mensuales desde IAs: ${months.map(m => `${monthLabel(m.month)} ${m.total}`).join(', ')}`}>
        {months.map((m, i) => {
          const x = PAD.left + i * slotW + (slotW - barW) / 2
          let yCursor = PAD.top + plotH
          const segs = m.bySource.map(b => {
            const h = Math.max((b.value / maxVal) * plotH, b.value > 0 ? 1.5 : 0)
            const y = yCursor - h
            yCursor = y
            return { ...b, y, h }
          })
          const topY = segs.length ? segs[segs.length - 1].y : PAD.top + plotH
          const isActive = i === active
          return (
            <g key={m.month} opacity={active == null || isActive ? 1 : 0.45}>
              {m.total === 0 && (
                <rect x={x} y={PAD.top + plotH - 2} width={barW} height={2} rx="1" className="fill-gray-200 dark:fill-gray-700" />
              )}
              {segs.map(s => (
                <rect key={s.key} x={x} y={s.y} width={barW} height={s.h} fill={hexOf(s.key)} />
              ))}
              {m.total > 0 && (
                <text x={x + barW / 2} y={topY - 4} textAnchor="middle" fontSize="9" fontWeight={isActive ? 700 : 400}
                  className={isActive ? 'fill-gray-800 dark:fill-gray-100' : 'fill-gray-500 dark:fill-gray-400'}>
                  {m.total}
                </text>
              )}
              <text x={x + barW / 2} y={HEIGHT - 8} textAnchor="middle" fontSize="9" fontWeight={isActive ? 700 : 400}
                className={isActive ? 'fill-gray-800 dark:fill-gray-100' : 'fill-gray-400 dark:fill-gray-500'}>
                {m.month.slice(5)}
              </text>
              {m.resolved?.length > 0 && (
                <circle cx={x + barW / 2} cy={HEIGHT - 2} r="2.5" className="fill-emerald-500" />
              )}
              <rect x={PAD.left + i * slotW} y={0} width={slotW} height={HEIGHT} fill="transparent"
                className="cursor-pointer outline-none" tabIndex={0}
                aria-label={`${monthLabel(m.month)}: ${m.total} sesión(es)`}
                onMouseEnter={() => setActive(i)} onFocus={() => setActive(i)} onBlur={() => setActive(null)} onClick={() => setActive(i)} />
            </g>
          )
        })}
      </svg>

      {act && (
        <div
          className="pointer-events-none absolute z-10 rounded-xl border border-gray-200 dark:border-gray-700 bg-white/95 dark:bg-gray-800/95 shadow-lg px-3 py-2"
          style={{ left: tipLeft, width: TIP_W, top: 0 }}
          role="tooltip"
        >
          <p className="text-xs font-semibold text-gray-900 dark:text-white">{monthLabel(act.month)}</p>
          <p className="text-[11px] text-gray-400 dark:text-gray-500 mb-1">{act.total.toLocaleString('es-AR')} sesión(es) totales</p>
          {act.bySource.length > 0 ? (
            <div className="space-y-0.5">
              {act.bySource.map(b => (
                <div key={b.key} className="flex items-center gap-1.5 text-[11px]">
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${AI_META[b.key]?.color}`} />
                  <span className="text-gray-600 dark:text-gray-300 flex-1">{AI_META[b.key]?.label ?? b.key}</span>
                  <span className="font-medium text-gray-700 dark:text-gray-200">{b.value.toLocaleString('es-AR')}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[11px] text-gray-400 dark:text-gray-500">Sin sesiones este mes</p>
          )}
          {act.resolved?.length > 0 && (
            <p className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-1 pt-1 border-t border-gray-100 dark:border-gray-700">
              Resuelta: {act.resolved.join(', ')}
            </p>
          )}
        </div>
      )}

      {usedSources.length > 0 && (
        <div className="flex items-center gap-x-3 gap-y-1 flex-wrap mt-2">
          {usedSources.map(key => (
            <span key={key} className="flex items-center gap-1 text-[11px] text-gray-400 dark:text-gray-500">
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${AI_META[key].color}`} />
              {AI_META[key].label}
            </span>
          ))}
        </div>
      )}
      {hasAnyResolution && (
        <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1 flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block flex-shrink-0" />
          mes con alguna recomendación GEO resuelta — referencia para mirar el tráfico de los meses alrededor, no una medición de que esa recomendación lo haya causado
        </p>
      )}
    </div>
  )
}

export default function AiTrafficSection({ projectId }) {
  const [data,    setData]    = useState(null)   // { live, history }
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

  useEffect(() => {
    if (!projectId) return
    setLoading(true)
    setError(null)
    api.get(`/marketing/projects/${projectId}/ai-traffic`)
      .then(r => setData(r.data))
      .catch(err => {
        const code = err.response?.data?.code
        if (code !== 'NO_INTEGRATION') setError(err.response?.data?.error ?? 'Error al cargar tráfico de IAs')
        // Si no tiene GA4 conectado → simplemente no mostrar la sección
        setData(null)
      })
      .finally(() => setLoading(false))
  }, [projectId])

  if (loading) return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
      <div className="flex items-center gap-2 text-sm text-gray-400">
        <span className="w-4 h-4 border-2 border-primary-400 border-t-transparent rounded-full animate-spin inline-block" />
        Cargando tráfico desde IAs…
      </div>
    </div>
  )

  if (!data || error) return null   // Sin GA4 o error → no renderizar

  const live    = data.live    ?? {}
  const history = data.history ?? []
  const geoResolutions = data.geoResolutions ?? []

  // Filtrar fuentes con sesiones > 0
  const activeSources = Object.entries(live)
    .filter(([, v]) => v > 0)
    .sort(([, a], [, b]) => b - a)

  const totalLive = activeSources.reduce((s, [, v]) => s + v, 0)

  if (totalLive === 0 && history.length === 0) return null

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
          Tráfico desde IAs
        </h3>
        <span className="text-xs text-gray-400 dark:text-gray-500">Últimos 30 días</span>
      </div>

      {/* Tarjetas live (solo fuentes con > 0 sesiones) */}
      {activeSources.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {activeSources.map(([key, sessions]) => {
            const meta = AI_META[key] ?? { label: key, color: 'bg-gray-400' }
            const pct  = totalLive > 0 ? Math.round((sessions / totalLive) * 100) : 0
            return (
              <div key={key} className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-3 flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${meta.color}`} />
                  <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">{meta.label}</span>
                </div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white leading-tight">
                  {sessions.toLocaleString('es-AR')}
                </p>
                <div className="flex items-center gap-1">
                  <div className="flex-1 bg-gray-200 dark:bg-gray-600 rounded-full h-1">
                    <div className={`h-1 rounded-full ${meta.color}`} style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-xs text-gray-400 dark:text-gray-500">{pct}%</span>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <p className="text-sm text-gray-400 dark:text-gray-500 italic">
          Sin visitas desde IAs en los últimos 30 días.
        </p>
      )}

      {/* Total */}
      {totalLive > 0 && (
        <p className="text-xs text-gray-400 dark:text-gray-500">
          Total: <strong className="text-gray-600 dark:text-gray-300">{totalLive.toLocaleString('es-AR')} sesiones</strong> referidas desde IAs en los últimos 30 días.
        </p>
      )}

      {/* Histórico */}
      {history.length >= 2 && (
        <div className="border-t border-gray-100 dark:border-gray-700 pt-3">
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-2">Evolución mensual por IA (pasá el mouse por una barra para el detalle)</p>
          <AiBarChart history={history} geoResolutions={geoResolutions} />
        </div>
      )}
    </div>
  )
}
