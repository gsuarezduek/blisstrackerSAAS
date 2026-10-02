import SocialIcon from '../SocialIcon'
import { fmtK, fmtNum, monthLabel } from './format'
import { Trash2 } from 'lucide-react'
import { Icon } from '../../ui/Icon'

// Primitivas visuales compartidas por las pestañas de redes y anuncios.

// Sello de la red: logo sobre el color/gradiente de la marca.
export function NetworkMark({ brand, size = 'md', className = '' }) {
  const box  = size === 'lg' ? 'w-16 h-16 rounded-2xl' : size === 'sm' ? 'w-10 h-10 rounded-xl' : 'w-14 h-14'
  const icon = size === 'lg' ? 'w-8 h-8' : size === 'sm' ? 'w-5 h-5' : 'w-7 h-7'
  const shape = size === 'md' ? (brand.square ? 'rounded-xl' : 'rounded-full') : ''
  return (
    <div className={`${box} ${shape} shrink-0 flex items-center justify-center text-white ${brand.markBorder ? 'border border-gray-200 dark:border-gray-700 shadow-sm' : ''} ${className}`}
      style={{ background: brand.mark }}>
      {brand.network
        ? <SocialIcon network={brand.network} className={icon} />
        : <Icon as={brand.glyph} size={size === 'lg' ? 30 : size === 'sm' ? 20 : 26} className={brand.glyphClass ?? ''} />}
    </div>
  )
}

export function BrandSpinner({ brand, className = 'py-20' }) {
  const c = brand?.color ?? '#9ca3af'
  return (
    <div className={`flex items-center justify-center ${className}`} role="status" aria-label="Cargando">
      <div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: `${c} transparent ${c} ${c}` }} />
    </div>
  )
}

export function LineChart({ data, valueAccessor, labelAccessor, label, color = '#a855f7', formatY = v => v, chartHeight = 90, displayHeight = 100, bare = false }) {
  if (!data || data.length < 2) return null
  const values = data.map(valueAccessor)
  const minV = Math.min(...values)
  const maxV = Math.max(...values)
  const range = maxV - minV || 1
  const W = 500, H = chartHeight
  const PAD = { top: 10, right: 10, bottom: 26, left: 54 }
  const inner = { w: W - PAD.left - PAD.right, h: H - PAD.top - PAD.bottom }
  const xScale = i => PAD.left + (i / (data.length - 1)) * inner.w
  const yScale = v => PAD.top + inner.h - ((v - minV) / range) * inner.h
  // Máximo ~10 etiquetas en X para no saturar.
  const step = Math.max(1, Math.floor(data.length / 10))
  const pathD = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${xScale(i).toFixed(1)} ${yScale(valueAccessor(d)).toFixed(1)}`).join(' ')
  const chart = (
    <>
      {label && <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">{label}</p>}
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: displayHeight }}>
        {[0, 0.5, 1].map(t => {
          const y = PAD.top + inner.h * (1 - t)
          return (
            <g key={t}>
              <line x1={PAD.left} y1={y} x2={PAD.left + inner.w} y2={y} stroke="#e2e8f0" strokeWidth={1} />
              <text x={PAD.left - 6} y={y + 4} textAnchor="end" fontSize={9} fill="#94a3b8">{formatY(minV + t * range)}</text>
            </g>
          )
        })}
        <path d={pathD} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
        {data.map((d, i) => (
          <g key={i}>
            <circle cx={xScale(i)} cy={yScale(valueAccessor(d))} r={2.5} fill={color} />
            {i % step === 0 && (
              <text x={xScale(i)} y={H - 4} textAnchor="middle" fontSize={8} fill="#94a3b8">{labelAccessor(d)}</text>
            )}
          </g>
        ))}
      </svg>
    </>
  )
  if (bare) return chart
  return <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5">{chart}</div>
}

export function MonthNav({ selectedMonth, availableMonths, onChange, canDelete, onDelete, deleting }) {
  const idx = availableMonths.indexOf(selectedMonth)
  const canPrev = idx < availableMonths.length - 1
  const canNext = idx > 0
  const isCurrentMonth = idx === 0
  const arrow = 'w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-lg'
  return (
    <div className="flex items-center justify-between bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3">
      <button onClick={() => canPrev && onChange(availableMonths[idx + 1])} disabled={!canPrev} aria-label="Mes anterior" className={arrow}>‹</button>
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">{monthLabel(selectedMonth)}</span>
        {isCurrentMonth
          ? <span className="text-[10px] bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400 px-2 py-0.5 rounded-full font-medium">En vivo</span>
          : <span className="text-[10px] bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 px-2 py-0.5 rounded-full font-medium">Snapshot</span>}
        {canDelete && (
          <button onClick={onDelete} disabled={deleting} title="Borrar el snapshot de este mes"
            className="text-gray-400 hover:text-red-500 dark:hover:text-red-400 disabled:opacity-40 transition-colors text-sm leading-none">
            {deleting ? '…' : <Icon as={Trash2} size={14} />}
          </button>
        )}
      </div>
      <button onClick={() => canNext && onChange(availableMonths[idx - 1])} disabled={!canNext} aria-label="Mes siguiente" className={arrow}>›</button>
    </div>
  )
}

export function KpiCard({ label, value, sub, valueClass = '', className = '' }) {
  return (
    <div className={`bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 flex flex-col gap-1 ${className}`}>
      <div className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400 text-xs"><span>{label}</span></div>
      <div className={`text-2xl font-bold text-gray-900 dark:text-white ${valueClass}`}>{value}</div>
      {sub && <div className="text-xs text-gray-400 dark:text-gray-500">{sub}</div>}
    </div>
  )
}

// Tarjeta de audiencia (seguidores / suscriptores) con la variación del mes.
export function AudienceCard({ label = 'Seguidores', count, monthlyGain, sub, className = '' }) {
  const gainCls = monthlyGain > 0 ? 'text-green-600 dark:text-green-400' : monthlyGain < 0 ? 'text-red-500 dark:text-red-400' : 'text-gray-400 dark:text-gray-500'
  return (
    <div className={`bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 flex flex-col gap-1 ${className}`}>
      <div className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400 text-xs"><span>{label}</span></div>
      <div className="text-2xl font-bold text-gray-900 dark:text-white">{fmtK(count)}</div>
      {monthlyGain != null && (
        <div className={`text-xs font-semibold ${gainCls}`}>{monthlyGain > 0 ? '+' : ''}{fmtNum(monthlyGain)} este mes</div>
      )}
      {sub && <div className="text-xs text-gray-400 dark:text-gray-500">{sub}</div>}
    </div>
  )
}
