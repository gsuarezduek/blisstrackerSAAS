// Helpers, charts y cards presentacionales del informe. Extraído de ReportViewer.jsx.
// Todas piezas sin estado (props → JSX); se comparten entre el viewer y entre sí.
import { createContext, useContext } from 'react'

export const PRINT_STYLES = `
@media print {
  .no-print { display: none !important; }
  body { background: white !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .bg-gray-50, .dark\\:bg-gray-700\\/50 { background-color: #f9fafb !important; }
  .bg-white { background-color: white !important; }
  .border { border-color: #e5e7eb !important; }
  .text-gray-900 { color: #111827 !important; }
  .text-gray-700 { color: #374151 !important; }
  .text-gray-600 { color: #4b5563 !important; }
  .text-gray-500 { color: #6b7280 !important; }
  .text-gray-400 { color: #9ca3af !important; }
  svg { display: block; }
  .rounded-2xl { border-radius: 1rem; border: 1px solid #e5e7eb; }
  .space-y-5 > * + * { margin-top: 1.25rem; }
  .print-break-avoid { break-inside: avoid; }
}
`

// ─── Contexto de edición (solo vista agencia) ──────────────────────────────────
// Permite borrar secciones/grupos del informe generado. En la vista del cliente
// (isPublic) el contexto queda deshabilitado y no se renderiza ningún control.
export const ReportEditContext = createContext({ enabled: false, requestRemove: () => {} })

export function DeleteSectionBtn({ keys, label, className = '' }) {
  const { enabled, requestRemove } = useContext(ReportEditContext)
  if (!enabled || !keys || keys.length === 0) return null
  return (
    <button
      onClick={(e) => { e.stopPropagation(); requestRemove(keys, label) }}
      title={`Eliminar "${label}" del informe`}
      className={`no-print text-gray-300 hover:text-red-500 dark:text-gray-600 dark:hover:text-red-400 transition-colors ${className}`}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
        <line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" />
      </svg>
    </button>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function fmt(n, decimals = 0) {
  if (n == null) return '—'
  return Number(n).toLocaleString('es-AR', { maximumFractionDigits: decimals })
}

export function fmtDuration(secs) {
  if (!secs) return '0s'
  const m = Math.floor(secs / 60)
  const s = Math.round(secs % 60)
  if (m === 0) return `${s}s`
  return `${m}m ${s}s`
}

export function monthLabel(month) {
  if (!month) return ''
  const [y, m] = month.split('-').map(Number)
  const date = new Date(y, m - 1, 1)
  return date.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
}

export function dataPeriodLabel(dataMonth) {
  if (!dataMonth) return null
  const [y, m] = dataMonth.split('-').map(Number)
  const lastDay = new Date(y, m, 0).getDate()
  const monthName = new Date(y, m - 1, 1).toLocaleDateString('es-AR', { month: 'long' })
  return `Datos del 1 al ${lastDay} de ${monthName} de ${y}`
}

export function monthShort(month) {
  if (!month) return ''
  const [y, m] = month.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('es-AR', { month: 'short', year: '2-digit' })
}

export function geoBandColor(band) {
  if (band === 'Excelente') return { stroke: '#3b82f6', text: 'text-blue-600',   bg: 'bg-blue-50 dark:bg-blue-900/20'   }
  if (band === 'Bueno')     return { stroke: '#22c55e', text: 'text-green-600',  bg: 'bg-green-50 dark:bg-green-900/20' }
  if (band === 'Base')      return { stroke: '#eab308', text: 'text-yellow-600', bg: 'bg-yellow-50 dark:bg-yellow-900/20'}
  return                           { stroke: '#ef4444', text: 'text-red-600',    bg: 'bg-red-50 dark:bg-red-900/20'     }
}

export function DeltaChip({ delta, invert = false }) {
  if (delta == null) return null
  const good  = invert ? delta < 0 : delta > 0
  const color = good ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'
  return (
    <span className={`text-xs font-semibold ${color}`}>
      {delta > 0 ? '↑' : '↓'} {Math.abs(delta)}%
    </span>
  )
}

// Score ring SVG
export function ScoreRing({ score, band }) {
  if (score == null) return null
  const r      = 52
  const circ   = 2 * Math.PI * r
  const filled = (score / 100) * circ
  const colors = geoBandColor(band)

  return (
    <div className="flex flex-col items-center gap-2">
      <svg width="130" height="130" viewBox="0 0 130 130">
        <circle cx="65" cy="65" r={r} fill="none" stroke="#e5e7eb" strokeWidth="10" />
        <circle
          cx="65" cy="65" r={r} fill="none"
          stroke={colors.stroke} strokeWidth="10"
          strokeDasharray={`${filled} ${circ}`}
          strokeLinecap="round"
          transform="rotate(-90 65 65)"
        />
        <text x="65" y="60" textAnchor="middle" fontSize="26" fontWeight="700" fill="currentColor" className="fill-gray-900 dark:fill-white">{score}</text>
        <text x="65" y="78" textAnchor="middle" fontSize="12" fill="#94a3b8">/100</text>
      </svg>
      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${colors.bg} ${colors.text}`}>{band}</span>
    </div>
  )
}

// Barra horizontal simple
export function BarChart({ items, maxVal, color = '#f97316' }) {
  if (!items || items.length === 0) return null
  const max = maxVal || Math.max(...items.map(i => i.value), 1)
  return (
    <div className="space-y-1.5">
      {items.slice(0, 5).map((item, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="text-xs text-gray-500 dark:text-gray-400 w-28 truncate text-right">{item.label}</span>
          <div className="flex-1 h-3 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{ width: `${Math.max((item.value / max) * 100, 2)}%`, backgroundColor: color }}
            />
          </div>
          <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 w-12 text-right">{fmt(item.value)}</span>
        </div>
      ))}
    </div>
  )
}

// Línea SVG — soporta una o dos series
export function LineChart({ points, color = '#f97316', height = 60, showLabels = true, secondPoints, secondColor = '#3b82f6' }) {
  if (!points || points.length < 2) return null

  const values1   = points.map(p => p.value)
  const values2   = secondPoints ? secondPoints.map(p => p.value) : []
  const allValues = [...values1, ...values2]
  const min       = Math.min(...allValues)
  const max       = Math.max(...allValues)
  const range     = max - min || 1
  const w = 300
  const h = height
  const pad = 12

  function coordsFor(pts) {
    return pts.map((p, i) => ({
      x: pad + (i / (pts.length - 1)) * (w - pad * 2),
      y: h - pad - ((p.value - min) / range) * (h - pad * 2),
      ...p,
    }))
  }

  function pathD(coords) {
    return coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x} ${c.y}`).join(' ')
  }
  function areaD(coords) {
    return `${pathD(coords)} L ${coords[coords.length - 1].x} ${h - pad} L ${coords[0].x} ${h - pad} Z`
  }

  const coords1 = coordsFor(points)
  const coords2 = secondPoints ? coordsFor(secondPoints) : null

  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" preserveAspectRatio="none">
        <defs>
          <linearGradient id="cg1" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.2" />
            <stop offset="100%" stopColor={color} stopOpacity="0.02" />
          </linearGradient>
          {coords2 && (
            <linearGradient id="cg2" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={secondColor} stopOpacity="0.15" />
              <stop offset="100%" stopColor={secondColor} stopOpacity="0.02" />
            </linearGradient>
          )}
        </defs>
        <path d={areaD(coords1)} fill="url(#cg1)" />
        <path d={pathD(coords1)} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
        {coords1.map((c, i) => <circle key={i} cx={c.x} cy={c.y} r="3" fill={color} />)}
        {coords2 && (
          <>
            <path d={areaD(coords2)} fill="url(#cg2)" />
            <path d={pathD(coords2)} fill="none" stroke={secondColor} strokeWidth="2" strokeLinejoin="round" />
            {coords2.map((c, i) => <circle key={i} cx={c.x} cy={c.y} r="3" fill={secondColor} />)}
          </>
        )}
      </svg>
      {showLabels && (
        <div className="flex justify-between mt-1">
          {coords1.map((c, i) => (
            <span key={i} className="text-xs text-gray-400 dark:text-gray-500">{c.label}</span>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Secciones ────────────────────────────────────────────────────────────────

export function SectionCard({ title, icon, children, className = '', action, sectionKey = null, sectionLabel = null }) {
  return (
    <div className={`bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-6 print-break-avoid ${className}`}>
      <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4 flex items-center justify-between gap-2">
        <span className="flex items-center gap-2"><span>{icon}</span> {title}</span>
        <span className="flex items-center gap-2">
          {action}
          {sectionKey && <DeleteSectionBtn keys={[sectionKey]} label={sectionLabel || title} />}
        </span>
      </h3>
      {children}
    </div>
  )
}

export function GroupHeader({ title, groupKeys = null }) {
  return (
    <div className="flex items-center gap-3 pt-1">
      <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
      <span className="flex items-center gap-1.5">
        <span className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">{title}</span>
        {groupKeys && <DeleteSectionBtn keys={groupKeys} label={`todo: ${title}`} />}
      </span>
      <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
    </div>
  )
}

export function KpiGrid({ items }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {items.map((item, i) => (
        <div key={i} className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-3 text-center min-w-0">
          <p className="text-lg font-bold text-gray-900 dark:text-white leading-tight [overflow-wrap:anywhere]">{item.value ?? '—'}</p>
          {item.delta !== undefined && <DeltaChip delta={item.delta} invert={item.invertDelta} />}
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{item.label}</p>
        </div>
      ))}
    </div>
  )
}

// Mejor publicación del mes (Instagram)
export function BestInstagramPost({ post, label = 'Mejor publicación del mes', medal = '🏆' }) {
  if (!post) return null
  const score = (post.likeCount ?? 0) + (post.commentsCount ?? 0)
  const inner = (
    <div className="flex items-stretch gap-3">
      <div className="relative w-20 h-20 flex-shrink-0 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-700">
        {post.imgSrc ? (
          <img src={post.imgSrc} alt="" className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-purple-400 to-pink-400" />
        )}
        <div className="absolute top-1 left-1 text-base leading-none">{medal}</div>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-semibold text-purple-700 dark:text-purple-300 uppercase tracking-wide">
          {label}
        </p>
        <div className="flex items-center gap-3 text-xs text-gray-600 dark:text-gray-400 mt-1">
          {post.likeCount     != null && <span>❤️ {fmt(post.likeCount)}</span>}
          {post.commentsCount != null && <span>💬 {fmt(post.commentsCount)}</span>}
          {score > 0 && <span className="text-gray-400">· {fmt(score)} interacciones</span>}
        </div>
        {(post.reach != null || post.saved != null || post.shares != null) && (
          <div className="flex items-center gap-3 text-[11px] text-gray-500 dark:text-gray-400 mt-1">
            {post.reach  != null && <span>📡 {fmt(post.reach)}</span>}
            {post.saved  != null && <span>🔖 {fmt(post.saved)}</span>}
            {post.shares != null && <span>↗️ {fmt(post.shares)}</span>}
          </div>
        )}
        {post.caption && (
          <p className="text-[11px] text-gray-500 dark:text-gray-400 line-clamp-2 leading-tight mt-1">
            {post.caption}
          </p>
        )}
      </div>
    </div>
  )

  return (
    <div className="mt-4 rounded-xl border border-purple-200 dark:border-purple-800 bg-purple-50/50 dark:bg-purple-900/10 p-3">
      {post.permalink ? (
        <a href={post.permalink} target="_blank" rel="noopener noreferrer" className="block hover:opacity-90 transition-opacity">
          {inner}
        </a>
      ) : inner}
    </div>
  )
}

// Stories de Instagram del mes (efímeras — capturadas a diario). Muestra cantidad,
// alcance/retención y las miniaturas de las mejores. `stories` puede ser null.
export function StoriesBlock({ stories }) {
  if (!stories || !stories.count) return null
  const thumbs = (stories.topStories?.length ? stories.topStories : stories.recent) ?? []
  return (
    <div className="mt-4 rounded-xl border border-fuchsia-200 dark:border-fuchsia-800 bg-fuchsia-50/50 dark:bg-fuchsia-900/10 p-3">
      <p className="text-[10px] font-semibold text-fuchsia-700 dark:text-fuchsia-300 uppercase tracking-wide mb-2">
        📸 Stories del mes
      </p>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-600 dark:text-gray-400">
        <span><strong className="text-gray-800 dark:text-gray-200">{fmt(stories.count)}</strong> publicadas</span>
        {stories.avgReach     != null && <span>👁️ {fmt(stories.avgReach)} alcance prom.</span>}
        {stories.avgViews     != null && <span>▶️ {fmt(stories.avgViews)} vistas prom.</span>}
        {stories.totalReplies != null && <span>💬 {fmt(stories.totalReplies)} respuestas</span>}
        {stories.retentionRate != null && <span>📈 {stories.retentionRate}% retención</span>}
      </div>
      {thumbs.length > 0 && (
        <div className="flex gap-2 mt-3 overflow-x-auto">
          {thumbs.map(st => (
            <div key={st.id} className="relative w-14 h-24 flex-shrink-0 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-700">
              {st.imgSrc
                ? <img src={st.imgSrc} alt="" className="w-full h-full object-cover" loading="lazy" />
                : <div className="w-full h-full bg-gradient-to-br from-fuchsia-400 to-purple-400" />}
              {st.reach != null && (
                <div className="absolute bottom-0 inset-x-0 bg-black/50 text-white text-[9px] text-center py-0.5">
                  👁️ {fmt(st.reach)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {!stories.hasInsights && (
        <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-2">
          Métricas de rendimiento no disponibles todavía (requiere el permiso de insights de Meta).
        </p>
      )}
    </div>
  )
}

// Anuncio destacado del mes (Meta con creativo / Google con preview de texto)
export function BestAd({ ad, accent = 'blue' }) {
  if (!ad) return null
  const ACCENT = {
    blue:  { box: 'border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-900/10',   text: 'text-blue-700 dark:text-blue-300' },
    green: { box: 'border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-900/10', text: 'text-green-700 dark:text-green-300' },
  }[accent] ?? {}
  const spend = ad.spend ?? ad.cost
  return (
    <div className={`mt-4 rounded-xl border p-3 ${ACCENT.box}`}>
      <p className={`text-[10px] font-semibold uppercase tracking-wide mb-2 ${ACCENT.text}`}>
        🏆 Anuncio destacado
      </p>
      <div className="flex items-stretch gap-3">
        {ad.thumbnailUrl && (
          <div className="w-20 h-20 flex-shrink-0 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-700">
            <img src={ad.thumbnailUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          {ad.headline ? (
            <>
              <p className="text-sm font-medium text-gray-800 dark:text-gray-200 line-clamp-2" title={ad.headline}>{ad.headline}</p>
              {ad.description && <p className="text-[11px] text-gray-500 dark:text-gray-400 line-clamp-2 mt-0.5">{ad.description}</p>}
            </>
          ) : (
            <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate" title={ad.name}>{ad.name || 'Anuncio'}</p>
          )}
          <div className="flex flex-wrap items-center gap-3 text-xs text-gray-600 dark:text-gray-400 mt-1.5">
            {ad.reach       != null && ad.reach > 0 && <span>👁️ {fmt(ad.reach)} alcance</span>}
            {ad.impressions != null && <span>📢 {fmt(ad.impressions)} imp.</span>}
            {ad.ctr         != null && <span>📊 {Number(ad.ctr).toFixed(2)}% CTR</span>}
            {spend          != null && spend > 0 && <span>💰 ${fmt(spend, 2)}</span>}
          </div>
        </div>
      </div>
    </div>
  )
}

// Mejor video del mes (TikTok)
export function BestTikTokVideo({ video }) {
  if (!video) return null
  const inner = (
    <div className="flex items-stretch gap-3">
      <div className="relative w-20 h-20 flex-shrink-0 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-700">
        {video.coverUrl ? (
          <img src={video.coverUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-cyan-400 to-pink-500" />
        )}
        <div className="absolute top-1 left-1 text-base leading-none">🏆</div>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-semibold text-cyan-700 dark:text-cyan-300 uppercase tracking-wide">
          Mejor video del mes
        </p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-600 dark:text-gray-400 mt-1">
          {video.viewCount    != null && <span>▶️ {fmt(video.viewCount)}</span>}
          {video.likeCount    != null && <span>❤️ {fmt(video.likeCount)}</span>}
          {video.commentCount != null && <span>💬 {fmt(video.commentCount)}</span>}
          {video.shareCount   != null && <span>🔁 {fmt(video.shareCount)}</span>}
        </div>
        {video.title && (
          <p className="text-[11px] text-gray-500 dark:text-gray-400 line-clamp-2 leading-tight mt-1">
            {video.title}
          </p>
        )}
      </div>
    </div>
  )

  return (
    <div className="mt-4 rounded-xl border border-cyan-200 dark:border-cyan-800 bg-cyan-50/50 dark:bg-cyan-900/10 p-3">
      {video.shareUrl ? (
        <a href={video.shareUrl} target="_blank" rel="noopener noreferrer" className="block hover:opacity-90 transition-opacity">
          {inner}
        </a>
      ) : inner}
    </div>
  )
}

// Mejor video del mes (YouTube)
export function BestYouTubeVideo({ video }) {
  if (!video) return null
  const inner = (
    <div className="flex items-stretch gap-3">
      <div className="relative w-28 h-16 flex-shrink-0 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-700">
        {video.coverUrl ? (
          <img src={video.coverUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-red-500 to-red-700" />
        )}
        <div className="absolute top-1 left-1 text-base leading-none">🏆</div>
        {video.isShort && <span className="absolute bottom-1 right-1 text-[8px] bg-black/70 text-white px-1 py-0.5 rounded-full font-semibold">SHORT</span>}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-semibold text-red-700 dark:text-red-300 uppercase tracking-wide">
          Mejor video del mes
        </p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-600 dark:text-gray-400 mt-1">
          {video.viewCount    != null && <span>▶️ {fmt(video.viewCount)}</span>}
          {video.likeCount    != null && <span>❤️ {fmt(video.likeCount)}</span>}
          {video.commentCount != null && <span>💬 {fmt(video.commentCount)}</span>}
        </div>
        {video.title && (
          <p className="text-[11px] text-gray-500 dark:text-gray-400 line-clamp-2 leading-tight mt-1">
            {video.title}
          </p>
        )}
      </div>
    </div>
  )

  return (
    <div className="mt-4 rounded-xl border border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-900/10 p-3">
      {video.url ? (
        <a href={video.url} target="_blank" rel="noopener noreferrer" className="block hover:opacity-90 transition-opacity">
          {inner}
        </a>
      ) : inner}
    </div>
  )
}

// Mejor post del mes (LinkedIn)
export function BestLinkedinPost({ post }) {
  if (!post) return null
  const inner = (
    <div className="flex items-stretch gap-3">
      <div className="relative w-20 h-20 flex-shrink-0 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-700">
        {post.imgSrc ? (
          <img src={post.imgSrc} alt="" className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-blue-500 to-sky-400" />
        )}
        <div className="absolute top-1 left-1 text-base leading-none">🏆</div>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-semibold text-blue-700 dark:text-blue-300 uppercase tracking-wide">
          Mejor post del mes
        </p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-600 dark:text-gray-400 mt-1">
          {post.impressions != null && <span>👁 {fmt(post.impressions)}</span>}
          {post.likes       != null && <span>❤️ {fmt(post.likes)}</span>}
          {post.comments    != null && <span>💬 {fmt(post.comments)}</span>}
          {post.shares      != null && <span>↗ {fmt(post.shares)}</span>}
        </div>
        {post.text && (
          <p className="text-[11px] text-gray-500 dark:text-gray-400 line-clamp-2 leading-tight mt-1">
            {post.text}
          </p>
        )}
      </div>
    </div>
  )

  return (
    <div className="mt-4 rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-900/10 p-3">
      {post.url ? (
        <a href={post.url} target="_blank" rel="noopener noreferrer" className="block hover:opacity-90 transition-opacity">
          {inner}
        </a>
      ) : inner}
    </div>
  )
}

export function BestFacebookPost({ post }) {
  if (!post) return null
  const inner = (
    <div className="flex items-stretch gap-3">
      <div className="relative w-20 h-20 flex-shrink-0 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-700">
        {post.imgSrc ? (
          <img src={post.imgSrc} alt="" className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-blue-600 to-sky-500" />
        )}
        <div className="absolute top-1 left-1 text-base leading-none">🏆</div>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-semibold text-blue-700 dark:text-blue-300 uppercase tracking-wide">
          Mejor post del mes
        </p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-600 dark:text-gray-400 mt-1">
          {post.reach    != null && <span>👁 {fmt(post.reach)}</span>}
          {post.likes    != null && <span>👍 {fmt(post.likes)}</span>}
          {post.comments != null && <span>💬 {fmt(post.comments)}</span>}
          {post.shares   != null && <span>↗ {fmt(post.shares)}</span>}
        </div>
        {post.text && (
          <p className="text-[11px] text-gray-500 dark:text-gray-400 line-clamp-2 leading-tight mt-1">
            {post.text}
          </p>
        )}
      </div>
    </div>
  )

  return (
    <div className="mt-4 rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-900/10 p-3">
      {post.permalink ? (
        <a href={post.permalink} target="_blank" rel="noopener noreferrer" className="block hover:opacity-90 transition-opacity">
          {inner}
        </a>
      ) : inner}
    </div>
  )
}

// Audiencia de LinkedIn (demographics) — bloque compacto, solo si hay datos
export function LinkedinAudience({ demographics }) {
  if (!demographics) return null
  const cats = [
    { key: 'region',    icon: '🌎', title: 'Región' },
    { key: 'seniority', icon: '📊', title: 'Seniority' },
    { key: 'industry',  icon: '🏢', title: 'Industria' },
    { key: 'function',  icon: '💼', title: 'Función' },
  ].filter(c => Array.isArray(demographics[c.key]) && demographics[c.key].length)
  if (!cats.length) return null
  const labelOf = (item) => item.label || (item.urn ? String(item.urn).split(':').pop().replace(/_/g, ' ') : '—')
  return (
    <div className="mt-4 grid grid-cols-2 gap-3">
      {cats.map(c => {
        const items = demographics[c.key]
        const total = items.reduce((sm, x) => sm + (x.count ?? 0), 0) || 1
        return (
          <div key={c.key} className="rounded-lg bg-gray-50 dark:bg-gray-700/40 p-2.5">
            <p className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">{c.icon} {c.title}</p>
            <div className="space-y-1">
              {items.slice(0, 3).map((item, i) => (
                <div key={i} className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="truncate text-gray-700 dark:text-gray-300 capitalize">{labelOf(item)}</span>
                  <span className="tabular-nums text-gray-400">{Math.round((item.count / total) * 100)}%</span>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// Tabla de objetivos vs real
// Formatea un valor de objetivo según la unidad
export function fmtObjVal(value, unit) {
  if (value == null) return '—'
  if (unit === '$')   return `$${fmt(value)}`
  if (unit === '%')   return `${value}%`
  if (unit === 'pos') return `#${value}`
  return fmt(value)
}

// Mensajes y colores por estado de un objetivo
export const OBJ_STATUS = {
  ok:           { label: 'Cumplido',     bar: 'bg-green-500',  chip: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  partial:      { label: 'En camino',    bar: 'bg-yellow-500', chip: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' },
  fail:         { label: 'Por debajo',   bar: 'bg-red-500',    chip: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  info:         { label: 'Informativo',  bar: 'bg-blue-500',   chip: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  no_data:      { label: 'Sin datos',    bar: 'bg-gray-300',   chip: 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400' },
  orphaned:     { label: 'Sin referencia', bar: 'bg-gray-300', chip: 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400' },
  disconnected: { label: 'Desconectado', bar: 'bg-amber-400',  chip: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
}

// Head-to-head propio vs competidor (objetivo "superar competidor")
export function CompetitorHeadToHead({ h2h }) {
  if (!h2h) return null
  return (
    <div className="mt-2 rounded-lg border border-gray-100 dark:border-gray-700 overflow-hidden">
      <table className="w-full text-xs table-fixed">
        <thead>
          <tr className="bg-gray-50 dark:bg-gray-700/40 text-gray-500 dark:text-gray-400">
            <th className="text-left py-1.5 px-2 font-medium w-2/5">Métrica</th>
            <th className="text-right py-1.5 px-2 font-medium break-words">{h2h.ownLabel}</th>
            <th className="text-right py-1.5 px-2 font-medium break-words">{h2h.competitorLabel}</th>
          </tr>
        </thead>
        <tbody>
          {h2h.metrics.map((m, i) => (
            <tr key={i} className="border-t border-gray-50 dark:border-gray-700/50">
              <td className="py-1.5 px-2 text-gray-600 dark:text-gray-300">{m.label}</td>
              <td className={`py-1.5 px-2 text-right font-semibold ${m.won === true ? 'text-green-600 dark:text-green-400' : 'text-gray-700 dark:text-gray-300'}`}>
                {m.own != null ? `${m.own}${m.unit}` : '—'}{m.won === true && ' 🏆'}
              </td>
              <td className={`py-1.5 px-2 text-right ${m.won === false ? 'text-green-600 dark:text-green-400 font-semibold' : 'text-gray-500 dark:text-gray-400'}`}>
                {m.competitor != null ? `${m.competitor}${m.unit}` : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function ObjectiveCard({ obj }) {
  const st = OBJ_STATUS[obj.status] || OBJ_STATUS.no_data
  const pct = obj.pct
  const barPct = pct == null ? 0 : Math.max(0, Math.min(100, pct))
  const isCompetitor = obj.metric === 'competidores'
  const bd = obj.detail?.breakdown
  const partial = obj.detail?.monthsExpected > 1 && obj.detail?.monthsWithData != null && obj.detail.monthsWithData < obj.detail.monthsExpected

  return (
    <div className="rounded-xl border border-gray-100 dark:border-gray-700 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{obj.label}</p>
          <p className="text-[11px] text-gray-400">{obj.periodLabel}</p>
        </div>
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${st.chip}`}>
          {pct != null ? `${pct}%` : st.label}
        </span>
      </div>

      {/* Estados sin comparación numérica */}
      {(obj.status === 'no_data' || obj.status === 'orphaned' || obj.status === 'disconnected') && !isCompetitor && (
        <p className="text-xs text-gray-400 mt-2">
          {obj.status === 'orphaned'     && 'La keyword o competidor asociado fue eliminado. Editá el objetivo.'}
          {obj.status === 'disconnected' && 'Sin datos ni conexión activa para este período.'}
          {obj.status === 'no_data'      && 'Todavía no hay datos para comparar en este período.'}
        </p>
      )}

      {/* Comparación numérica estándar */}
      {!isCompetitor && obj.actual != null && (
        <>
          <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mt-2 mb-1">
            <span>Real: <strong className="text-gray-800 dark:text-gray-200">{fmtObjVal(obj.actual, obj.unit)}</strong></span>
            <span>{obj.status === 'info' ? 'Presupuesto' : 'Objetivo'}: {fmtObjVal(obj.target, obj.unit)}</span>
          </div>
          {obj.status !== 'info' && (
            <div className="h-1.5 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
              <div className={`h-full ${st.bar}`} style={{ width: `${barPct}%` }} />
            </div>
          )}
          {obj.status === 'info' && obj.detail?.delta != null && (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {obj.detail.delta >= 0 ? `Se invirtió $${fmt(Math.abs(obj.detail.delta))} más que lo presupuestado` : `Se invirtió $${fmt(Math.abs(obj.detail.delta))} menos que lo presupuestado`}
            </p>
          )}
          {partial && (
            <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1">Datos parciales ({obj.detail.monthsWithData} de {obj.detail.monthsExpected} meses)</p>
          )}
          {bd && (
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5 text-[11px] text-gray-400">
              {bd.filter(n => n.value != null).map((n, i) => (
                <span key={i} className="capitalize">{n.network}: {n.approx ? '≈' : ''}{fmt(n.value)}</span>
              ))}
            </div>
          )}
        </>
      )}

      {/* Performance: aclaración de que es el último valor global */}
      {obj.metric === 'performance' && obj.detail?.latestGlobal && obj.actual != null && (
        <p className="text-[11px] text-gray-400 mt-1">Último análisis disponible (PageSpeed desktop)</p>
      )}

      {/* Competidor: head-to-head siempre visible */}
      {isCompetitor && (
        obj.detail?.headToHead
          ? <CompetitorHeadToHead h2h={obj.detail.headToHead} />
          : <p className="text-xs text-gray-400 mt-2">{obj.status === 'orphaned' ? 'El competidor fue eliminado. Editá el objetivo.' : 'Todavía no hay datos para comparar contra el competidor.'}</p>
      )}
    </div>
  )
}

export function ObjectivesResults({ objectives }) {
  if (!objectives || objectives.length === 0) return null
  return (
    <SectionCard title="Objetivos" icon="🎯" sectionKey="objectives">
      <div className="grid sm:grid-cols-2 gap-3">
        {objectives.map(o => <ObjectiveCard key={o.id} obj={o} />)}
      </div>
    </SectionCard>
  )
}

// Comparación con competidores — solo se renderiza cuando la cuenta propia lidera (rank #1)
export function CompetitorComparison({ data }) {
  if (!data || !data.wins?.length) return null
  const fmtVal = (v, w) => w.metric === 'avgLikes'
    ? fmt(Math.round(v), 0)
    : `${Number(v).toFixed(w.decimals ?? 1)}${w.unit ?? ''}`

  return (
    <SectionCard title="Comparación con competidores" icon="🏁" className="mt-5" sectionKey="competitors">
      <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
        Frente a {data.competitorsCount} competidor{data.competitorsCount > 1 ? 'es' : ''} analizado{data.competitorsCount > 1 ? 's' : ''}, la cuenta lidera en:
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        {data.wins.map(w => (
          <div key={w.metric} className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-3.5">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">{w.label}</span>
              <span className="text-[10px] font-bold bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 px-1.5 py-0.5 rounded-full">#1</span>
            </div>
            <div className="space-y-1">
              {w.ranking.map((r, i) => (
                <div
                  key={i}
                  className={`flex items-center justify-between text-xs rounded-lg px-2 py-1.5 ${
                    r.isOwn
                      ? 'bg-emerald-50 dark:bg-emerald-900/20 font-semibold text-emerald-800 dark:text-emerald-300'
                      : 'text-gray-600 dark:text-gray-400'
                  }`}
                >
                  <span className="truncate min-w-0">{i + 1}. {r.name}</span>
                  <span className="tabular-nums shrink-0 ml-2">{fmtVal(r.value, w)}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

