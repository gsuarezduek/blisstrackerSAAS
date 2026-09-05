import { useState, useEffect } from 'react'
import api from '../../api/client'
import SocialIcon from './SocialIcon'
import CrossProjectRRSSPanel from './CrossProjectRRSSPanel'

// ── Helpers ───────────────────────────────────────────────────────────────────

export function fmtNum(n) {
  if (n == null) return '—'
  return n.toLocaleString('es-AR')
}

export function fmtK(n) {
  if (n == null) return '—'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 10_000)    return `${(n / 1_000).toFixed(1)}K`
  return n.toLocaleString('es-AR')
}

export function engagementColor(rate) {
  if (rate == null) return 'text-gray-400'
  if (rate >= 3)    return 'text-green-600 dark:text-green-400'
  if (rate >= 1)    return 'text-yellow-600 dark:text-yellow-400'
  return 'text-red-600 dark:text-red-400'
}

export function engagementLabel(rate) {
  if (rate == null) return null
  if (rate >= 3)    return 'Excelente'
  if (rate >= 1)    return 'Promedio'
  return 'Bajo'
}

export function hourRange(h) {
  const end = (h + 3) % 24
  return `${String(h).padStart(2, '0')}:00 – ${String(end).padStart(2, '0')}:00`
}

export function subtractDays(dateStr, days) {
  const d = new Date(dateStr)
  d.setDate(d.getDate() - days)
  return d.toISOString().slice(0, 10)
}

export function todayAR() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' }))
    .toISOString().slice(0, 10)
}

// ── SVG Line Chart genérico ────────────────────────────────────────────────────

export function LineChart({ data, valueAccessor, labelAccessor, label, color = '#a855f7', formatY = v => v, chartHeight = 90, displayHeight = 100, bare = false }) {
  if (!data || data.length < 2) return null

  const values = data.map(valueAccessor)
  const minV   = Math.min(...values)
  const maxV   = Math.max(...values)
  const range  = maxV - minV || 1

  const W   = 500
  const H   = chartHeight
  const PAD = { top: 10, right: 10, bottom: 26, left: 54 }
  const inner = { w: W - PAD.left - PAD.right, h: H - PAD.top - PAD.bottom }

  const xScale = i => PAD.left + (i / (data.length - 1)) * inner.w
  const yScale = v => PAD.top + inner.h - ((v - minV) / range) * inner.h

  // Mostrar máximo ~10 etiquetas en X para no saturar
  const step = Math.max(1, Math.floor(data.length / 10))

  const pathD = data
    .map((d, i) => `${i === 0 ? 'M' : 'L'} ${xScale(i).toFixed(1)} ${yScale(valueAccessor(d)).toFixed(1)}`)
    .join(' ')

  const chart = (
    <>
      {label && <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">{label}</p>}
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: displayHeight }}>
        {[0, 0.5, 1].map(t => {
          const y = PAD.top + inner.h * (1 - t)
          return (
            <g key={t}>
              <line x1={PAD.left} y1={y} x2={PAD.left + inner.w} y2={y} stroke="#e2e8f0" strokeWidth={1} />
              <text x={PAD.left - 6} y={y + 4} textAnchor="end" fontSize={9} fill="#94a3b8">
                {formatY(minV + t * range)}
              </text>
            </g>
          )
        })}
        <path d={pathD} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
        {data.map((d, i) => (
          <g key={i}>
            <circle cx={xScale(i)} cy={yScale(valueAccessor(d))} r={2.5} fill={color} />
            {i % step === 0 && (
              <text x={xScale(i)} y={H - 4} textAnchor="middle" fontSize={8} fill="#94a3b8">
                {labelAccessor(d)}
              </text>
            )}
          </g>
        ))}
      </svg>
    </>
  )

  if (bare) return chart
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5">
      {chart}
    </div>
  )
}

// ── Navegación por mes ────────────────────────────────────────────────────────

export function monthLabel(ym) {
  const [y, m] = ym.split('-')
  const label = new Date(Number(y), Number(m) - 1, 1)
    .toLocaleString('es-AR', { month: 'long', year: 'numeric' })
  return label.charAt(0).toUpperCase() + label.slice(1)
}

export function MonthNav({ selectedMonth, availableMonths, onChange, canDelete, onDelete, deleting }) {
  const idx = availableMonths.indexOf(selectedMonth)
  const canPrev = idx < availableMonths.length - 1
  const canNext = idx > 0
  const isCurrentMonth = idx === 0

  return (
    <div className="flex items-center justify-between bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3">
      <button
        onClick={() => canPrev && onChange(availableMonths[idx + 1])}
        disabled={!canPrev}
        className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-lg"
      >‹</button>

      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">
          {monthLabel(selectedMonth)}
        </span>
        {isCurrentMonth ? (
          <span className="text-[10px] bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400 px-2 py-0.5 rounded-full font-medium">
            En vivo
          </span>
        ) : (
          <span className="text-[10px] bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 px-2 py-0.5 rounded-full font-medium">
            Snapshot
          </span>
        )}
        {canDelete && (
          <button onClick={onDelete} disabled={deleting} title="Borrar el snapshot de este mes"
            className="text-gray-400 hover:text-red-500 dark:hover:text-red-400 disabled:opacity-40 transition-colors text-sm leading-none">
            {deleting ? '…' : '🗑'}
          </button>
        )}
      </div>

      <button
        onClick={() => canNext && onChange(availableMonths[idx - 1])}
        disabled={!canNext}
        className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-lg"
      >›</button>
    </div>
  )
}

// ── KPI Card — seguidores ────────────────────────────────────────────────────

export const FOLLOWER_FILTERS = [
  { key: '7d',    label: '7 días',   days: 7   },
  { key: '30d',   label: '30 días',  days: 30  },
  { key: '90d',   label: '3 meses',  days: 90  },
  { key: '180d',  label: '6 meses',  days: 180 },
  { key: 'all',   label: 'Todo',     days: null },
]

export function FollowersCard({ followersCount, mediaCount, monthlyGain }) {
  return (
    <div className="col-span-2 sm:col-span-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 flex flex-col gap-1">
      <div className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400 text-xs">
        <span>👥</span>
        <span>Seguidores</span>
      </div>
      <div className="text-2xl font-bold text-gray-900 dark:text-white">{fmtK(followersCount)}</div>
      {monthlyGain != null && (
        <div className={`text-xs font-semibold ${monthlyGain > 0 ? 'text-green-600 dark:text-green-400' : monthlyGain < 0 ? 'text-red-500 dark:text-red-400' : 'text-gray-400 dark:text-gray-500'}`}>
          {monthlyGain > 0 ? '+' : ''}{fmtNum(monthlyGain)} este mes
        </div>
      )}
      <div className="text-xs text-gray-400 dark:text-gray-500">{fmtNum(mediaCount)} publicaciones</div>
    </div>
  )
}

// ── KPI Card simple ───────────────────────────────────────────────────────────

export function KpiCard({ icon, label, value, sub, valueClass = '' }) {
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 flex flex-col gap-1">
      <div className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400 text-xs">
        <span>{icon}</span>
        <span>{label}</span>
      </div>
      <div className={`text-2xl font-bold text-gray-900 dark:text-white ${valueClass}`}>
        {value}
      </div>
      {sub && <div className="text-xs text-gray-400 dark:text-gray-500">{sub}</div>}
    </div>
  )
}

// ── TOP del mes ───────────────────────────────────────────────────────────────

const RANK_META = [
  { medal: '🥇', label: 'Mejor publicación',  highlight: true  },
  { medal: '🥈', label: '2ª mejor del mes',   highlight: false },
  { medal: '🥉', label: '3ª mejor del mes',   highlight: false },
]

function TopPostCard({ post, medal, label, highlight }) {
  if (!post) return (
    <div className="bg-white dark:bg-gray-800 border border-dashed border-gray-200 dark:border-gray-700 rounded-xl p-4 flex flex-col items-center justify-center gap-2 min-h-[160px]">
      <span className="text-2xl opacity-30">📭</span>
      <p className="text-xs text-gray-400 text-center">Sin más publicaciones este mes</p>
    </div>
  )

  const score = (post.likeCount ?? 0) + (post.commentsCount ?? 0)

  return (
    <a
      href={post.permalink ?? '#'}
      target="_blank"
      rel="noopener noreferrer"
      className={`bg-white dark:bg-gray-800 rounded-xl overflow-hidden flex flex-col group transition-colors ${
        highlight
          ? 'border-2 border-purple-400 dark:border-purple-500 shadow-md hover:border-purple-500 dark:hover:border-purple-400'
          : 'border border-gray-200 dark:border-gray-700 hover:border-purple-300 dark:hover:border-purple-700'
      }`}
    >
      {/* Imagen */}
      <div className="relative aspect-square bg-gray-100 dark:bg-gray-700">
        {post.imgSrc ? (
          <img src={post.imgSrc} alt="" referrerPolicy="no-referrer" className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-purple-400 to-pink-400" />
        )}
        <div className="absolute top-2 left-2 text-xl leading-none">{medal}</div>
        {post.mediaType === 'VIDEO'          && <div className="absolute top-2 right-2 bg-black/60 rounded px-1 text-white text-[10px]">▶</div>}
        {post.mediaType === 'CAROUSEL_ALBUM' && <div className="absolute top-2 right-2 bg-black/60 rounded px-1 text-white text-[10px]">❏</div>}
      </div>

      {/* Info */}
      <div className="p-3 space-y-1.5">
        <p className={`text-[10px] font-semibold uppercase tracking-wide ${
          highlight ? 'text-purple-700 dark:text-purple-300' : 'text-gray-500 dark:text-gray-400'
        }`}>
          {label}
        </p>
        <div className="flex items-center gap-3 text-xs text-gray-600 dark:text-gray-400">
          {post.likeCount     != null && <span>❤️ {fmtK(post.likeCount)}</span>}
          {post.commentsCount != null && <span>💬 {fmtK(post.commentsCount)}</span>}
          {score > 0 && (
            <span className="ml-auto text-[10px] text-gray-400">
              {fmtK(score)} interacciones
            </span>
          )}
        </div>
        {(post.reach != null || post.saved != null || post.shares != null) && (
          <div className="flex items-center gap-3 text-[11px] text-gray-500 dark:text-gray-400">
            {post.reach  != null && <span>📡 {fmtK(post.reach)}</span>}
            {post.saved  != null && <span>🔖 {fmtK(post.saved)}</span>}
            {post.shares != null && <span>↗️ {fmtK(post.shares)}</span>}
          </div>
        )}
        {post.caption && (
          <p className="text-[11px] text-gray-500 dark:text-gray-400 line-clamp-2 leading-tight">
            {post.caption}
          </p>
        )}
      </div>
    </a>
  )
}

// Publicación de mayor alcance del mes (requiere Insights).
export function ReachHighlight({ post }) {
  if (!post || post.reach == null) return null
  return (
    <div className="bg-white dark:bg-gray-800 border border-purple-200 dark:border-purple-800/50 rounded-xl p-5">
      <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">📡 Publicación de mayor alcance</p>
      <a href={post.permalink ?? '#'} target="_blank" rel="noopener noreferrer" className="flex gap-4 group">
        <div className="w-20 h-20 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-700 shrink-0">
          {post.imgSrc
            ? <img src={post.imgSrc} alt="" referrerPolicy="no-referrer" className="w-full h-full object-cover" loading="lazy" />
            : <div className="w-full h-full bg-gradient-to-br from-purple-400 to-pink-400" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-lg font-bold text-purple-600 dark:text-purple-400 leading-tight">{fmtNum(post.reach)} <span className="text-sm font-medium text-gray-500 dark:text-gray-400">cuentas alcanzadas</span></p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-600 dark:text-gray-400 mt-1">
            {post.likeCount != null && <span>❤️ {fmtK(post.likeCount)}</span>}
            {post.commentsCount != null && <span>💬 {fmtK(post.commentsCount)}</span>}
            {post.saved  != null && <span>🔖 {fmtK(post.saved)}</span>}
            {post.shares != null && <span>↗️ {fmtK(post.shares)}</span>}
          </div>
          {post.caption && <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 mt-1.5 leading-tight">{post.caption}</p>}
        </div>
      </a>
    </div>
  )
}

export function TopOfMonth({ topPosts, postsThisMonth, label, isPast = false }) {
  const list = Array.isArray(topPosts) ? topPosts : []

  const heading = label || new Date().toLocaleString('es-AR', { month: 'long', timeZone: 'America/Argentina/Buenos_Aires' })

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            🏆 Mejores publicaciones — {heading}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">
            {postsThisMonth > 0
              ? `${postsThisMonth} publicación${postsThisMonth !== 1 ? 'es' : ''} ${isPast ? 'ese mes' : 'este mes'} · ranking por likes + comentarios`
              : (isPast ? 'Sin publicaciones ese mes' : 'Sin publicaciones en lo que va del mes')}
          </p>
        </div>
      </div>

      {list.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-6">
          {isPast ? 'No hay publicaciones con datos de interacción de ese mes.' : 'Aún no hay publicaciones con datos de interacción este mes.'}
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[0, 1, 2].map(i => (
            <TopPostCard
              key={list[i]?.id ?? `slot-${i}`}
              post={list[i] ?? null}
              medal={RANK_META[i].medal}
              label={RANK_META[i].label}
              highlight={RANK_META[i].highlight}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Insights de contenido ─────────────────────────────────────────────────────

export function ContentInsights({ byType, bestHour }) {
  const hasType = byType && byType.length > 0
  const maxAvg  = hasType ? byType[0].avgLikes : 1

  if (!hasType && !bestHour) return null

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {hasType && (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5">
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
            Rendimiento por tipo de contenido
          </p>
          <div className="space-y-3">
            {byType.map(t => (
              <div key={t.type} className="flex items-center gap-3">
                <span className="text-xs text-gray-600 dark:text-gray-400 w-20 shrink-0">{t.label}</span>
                <div className="flex-1 bg-gray-100 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
                  <div className="h-2 rounded-full bg-purple-500" style={{ width: `${(t.avgLikes / maxAvg) * 100}%` }} />
                </div>
                <span className="text-xs font-semibold text-gray-700 dark:text-gray-200 w-16 text-right shrink-0">
                  {fmtNum(t.avgLikes)} ❤️
                </span>
                <span className="text-xs text-gray-400 w-12 shrink-0">{t.count} posts</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5">
        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
          Mejor horario para publicar
        </p>
        {bestHour ? (
          <div className="flex items-start gap-3">
            <span className="text-3xl mt-0.5">🕐</span>
            <div>
              <p className="text-lg font-bold text-gray-900 dark:text-white leading-tight">
                {hourRange(bestHour.hour)}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                {fmtNum(Math.round(bestHour.avgLikes))} likes promedio · {bestHour.count} posts analizados
              </p>
              <p className="text-xs text-gray-400">Basado en las últimas publicaciones · Horario ART</p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-400 dark:text-gray-500">
            No hay suficientes publicaciones con datos de engagement para este análisis.
          </p>
        )}
      </div>
    </div>
  )
}

// ── Header de cuenta ──────────────────────────────────────────────────────────

export function AccountHeader({ metrics, integration, onDisconnect, disconnecting, onRefresh, refreshing }) {
  const [imgError, setImgError] = useState(false)
  const isScrape = integration?.scopes === 'scrape' || metrics?.scraped

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5">
      <div className="flex items-start gap-4">
        <div className="shrink-0">
          {metrics?.profilePicUrl && !imgError ? (
            <img
              src={metrics.profilePicUrl}
              alt={metrics.username ?? 'Instagram'}
              onError={() => setImgError(true)}
              referrerPolicy="no-referrer"
              className="w-14 h-14 rounded-full object-cover border-2 border-purple-200 dark:border-purple-800"
            />
          ) : (
            <div className="w-14 h-14 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center text-white">
              <SocialIcon network="instagram" className="w-7 h-7" />
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <p className="font-semibold text-gray-900 dark:text-white">
                  {metrics?.username ? `@${metrics.username}` : (metrics?.name ?? 'Instagram')}
                </p>
                {isScrape && (
                  <span className="text-[10px] bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-1.5 py-0.5 rounded-full font-medium">
                    scraping
                  </span>
                )}
              </div>
              {metrics?.name && metrics?.username && (
                <p className="text-xs text-gray-500 dark:text-gray-400">{metrics.name}</p>
              )}
            </div>
            <div className="flex items-center gap-3 shrink-0">
              {isScrape && onRefresh && (
                <button
                  onClick={onRefresh}
                  disabled={refreshing}
                  className="text-xs text-purple-500 hover:text-purple-600 dark:text-purple-400 transition-colors disabled:opacity-50"
                >
                  {refreshing ? 'Actualizando…' : '↻ Actualizar'}
                </button>
              )}
              <button
                onClick={onDisconnect}
                disabled={disconnecting}
                className="text-xs text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors disabled:opacity-50"
              >
                {disconnecting ? 'Desconectando…' : 'Desconectar'}
              </button>
            </div>
          </div>

          {metrics?.biography && (
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1.5 line-clamp-2 whitespace-pre-line">
              {metrics.biography}
            </p>
          )}
          {metrics?.website && (
            <a
              href={metrics.website.startsWith('http') ? metrics.website : `https://${metrics.website}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-primary-600 dark:text-primary-400 hover:underline mt-1 inline-block"
            >
              🌐 {metrics.website}
            </a>
          )}
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1.5">
            Conectado el {new Date(integration.connectedAt).toLocaleDateString('es-AR')}
            {isScrape && metrics?.lastScrapedAt && (
              <> · datos del {new Date(metrics.lastScrapedAt).toLocaleDateString('es-AR')}</>
            )}
          </p>
        </div>
      </div>
    </div>
  )
}

// ── Panel cross-proyecto ──────────────────────────────────────────────────────

export function CrossProjectInstagramPanel({ onSelectProject }) {
  const [data,       setData]       = useState(null)
  const [loading,    setLoading]    = useState(true)
  const [deleting,   setDeleting]   = useState(null)
  const [refreshing, setRefreshing] = useState(false)
  const [flash,      setFlash]      = useState(null) // { ok, cooldown, error }

  const load = () =>
    api.get('/marketing/summary/instagram')
      .then(r => setData(r.data))
      .catch(() => setData([]))

  useEffect(() => { load().finally(() => setLoading(false)) }, [])

  const refreshAll = async () => {
    setRefreshing(true)
    setFlash(null)
    try {
      const { data: res } = await api.post('/marketing/summary/rrss/instagram/refresh')
      const cooldown = res.results.filter(r => r.status === 'cooldown').length
      const error    = res.results.filter(r => r.status === 'error').length
      setFlash({ ok: res.refreshed, cooldown, error })
      await load()
    } catch {
      setFlash({ ok: 0, cooldown: 0, error: -1 }) // -1 = falló la request entera
    } finally {
      setRefreshing(false)
    }
  }

  async function handleDelete(p) {
    if (!window.confirm(`¿Borrar el último snapshot de Instagram de "${p.projectName}" (${p.month})? También se eliminarán los registros diarios de seguidores de ese mes. No se puede deshacer.`)) return
    setDeleting(p.projectId)
    try {
      await api.delete(`/marketing/projects/${p.projectId}/instagram/snapshots/${p.month}`)
      const r = await api.get('/marketing/summary/instagram')
      setData(r.data)
    } catch (err) {
      alert(err.response?.data?.error || 'No se pudo borrar el snapshot.')
    } finally { setDeleting(null) }
  }

  if (loading) return (
    <div className="flex justify-center py-12"><div className="w-6 h-6 border-2 border-pink-500 border-t-transparent rounded-full animate-spin" /></div>
  )
  if (!data?.length) return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-10 text-center">
      <div className="flex justify-center mb-3"><SocialIcon network="instagram" className="w-10 h-10 text-gray-300 dark:text-gray-600" /></div>
      <p className="text-sm text-gray-500 dark:text-gray-400">Todavía no hay snapshots de Instagram. Seleccioná un proyecto para empezar.</p>
    </div>
  )

  function engColor(rate) {
    if (rate == null) return 'text-gray-400'
    if (rate >= 3)    return 'text-green-600 dark:text-green-400'
    if (rate >= 1)    return 'text-yellow-600 dark:text-yellow-400'
    return 'text-red-500 dark:text-red-400'
  }

  return (
    <CrossProjectRRSSPanel
      data={data}
      title="Instagram por proyecto"
      gradient="linear-gradient(90deg, #a855f7 0%, #ec4899 100%)"
      onSelectProject={onSelectProject}
      headerAction={
        <button
          onClick={refreshAll}
          disabled={refreshing}
          className="flex-shrink-0 inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors"
        >
          {refreshing
            ? <><span className="w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" /> Actualizando…</>
            : <>🔄 Actualizar todo</>}
        </button>
      }
      banner={flash && (
        <div className={`mb-4 text-xs rounded-lg px-3 py-2 border ${
          flash.error === -1
            ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300'
            : 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300'
        }`}>
          {flash.error === -1
            ? 'No se pudo ejecutar la actualización. Reintentá en unos segundos.'
            : <>
                {flash.ok} proyecto(s) actualizado(s).
                {flash.cooldown > 0 && <span className="text-amber-600 dark:text-amber-400"> · {flash.cooldown} en cooldown (esperá unos min)</span>}
                {flash.error > 0    && <span className="text-red-600 dark:text-red-400"> · {flash.error} con error</span>}
              </>}
        </div>
      )}
      renderRowAction={p => (
        <button onClick={() => handleDelete(p)} disabled={deleting === p.projectId}
          title="Borrar este snapshot"
          className="text-gray-300 dark:text-gray-600 hover:text-red-500 dark:hover:text-red-400 disabled:opacity-40 transition-colors text-sm leading-none">
          {deleting === p.projectId ? '…' : '🗑'}
        </button>
      )}
      renderSecondary={p => (
        <>
          <span className="text-gray-400">{fmtK(p.followersCount)} seguidores</span>
          {p.engagementRate != null && <span className={engColor(p.engagementRate)}>{p.engagementRate.toFixed(2)}% eng.</span>}
          {p.avgLikes != null && <span className="text-gray-400">❤️ {fmtK(Math.round(p.avgLikes))}</span>}
          {p.postsCount != null && <span className="text-gray-400">{p.postsCount} posts</span>}
        </>
      )}
    />
  )
}

// ── Sección de Stories (historias del mes) ─────────────────────────────────────

export function StoriesSection({ stories, isCurrentMonth, onCapture, capturing }) {
  const thumbs = (stories?.topStories?.length ? stories.topStories : stories?.recent) ?? []
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">📸 Stories del mes</p>
        {isCurrentMonth && (
          <button
            onClick={onCapture}
            disabled={capturing}
            className="text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
          >
            {capturing ? 'Capturando…' : '🔄 Capturar ahora'}
          </button>
        )}
      </div>

      {!stories || !stories.count ? (
        <div className="p-6 text-center">
          <p className="text-sm text-gray-400 dark:text-gray-500">
            {isCurrentMonth
              ? 'Todavía no se capturaron stories este mes. Se capturan automáticamente cada 6 horas; podés forzar una captura ahora.'
              : 'No se capturaron stories en este mes.'}
          </p>
        </div>
      ) : (
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <StoryKpi label="Publicadas" value={fmtNum(stories.count)} />
            {stories.avgReach      != null && <StoryKpi label="Alcance prom." value={fmtK(stories.avgReach)} />}
            {stories.totalReach    != null && <StoryKpi label="Alcance total" value={fmtK(stories.totalReach)} />}
            {stories.avgViews      != null && <StoryKpi label="Vistas prom."  value={fmtK(stories.avgViews)} />}
            {stories.totalReplies  != null && <StoryKpi label="Respuestas"    value={fmtNum(stories.totalReplies)} />}
            {stories.retentionRate != null && <StoryKpi label="Retención"     value={`${stories.retentionRate}%`} />}
          </div>

          {thumbs.length > 0 && (
            <div className="flex gap-2.5 overflow-x-auto pb-1">
              {thumbs.map(st => {
                const inner = (
                  <div className="relative w-20 h-36 flex-shrink-0 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-700">
                    {st.imgSrc
                      ? <img src={st.imgSrc} alt="" className="w-full h-full object-cover" loading="lazy" />
                      : <div className="w-full h-full bg-gradient-to-br from-fuchsia-400 to-purple-400" />}
                    {(st.reach != null || st.replies != null) && (
                      <div className="absolute bottom-0 inset-x-0 bg-black/50 text-white text-[10px] flex items-center justify-center gap-2 py-0.5">
                        {st.reach   != null && <span>👁️ {fmtK(st.reach)}</span>}
                        {st.replies != null && st.replies > 0 && <span>💬 {fmtK(st.replies)}</span>}
                      </div>
                    )}
                  </div>
                )
                return st.permalink
                  ? <a key={st.id} href={st.permalink} target="_blank" rel="noopener noreferrer" className="hover:opacity-90 transition-opacity">{inner}</a>
                  : <div key={st.id}>{inner}</div>
              })}
            </div>
          )}

          {!stories.hasInsights && (
            <p className="text-[11px] text-gray-400 dark:text-gray-500">
              Se registran las stories publicadas, pero las métricas de rendimiento (alcance, respuestas, retención) aún no están disponibles — requieren el permiso de insights de Meta.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function StoryKpi({ label, value }) {
  return (
    <div className="bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700 rounded-lg p-3">
      <div className="text-xs text-gray-500 dark:text-gray-400">{label}</div>
      <div className="text-xl font-bold text-gray-900 dark:text-white">{value}</div>
    </div>
  )
}
