import { useState, useEffect, useRef, useCallback } from 'react'
import api from '../../api/client'
import ObjectiveProgressBars from './ObjectiveProgressBars'
import CrossProjectRRSSPanel from './CrossProjectRRSSPanel'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtNum(n) {
  if (n == null) return '—'
  return n.toLocaleString('es-AR')
}

function fmtK(n) {
  if (n == null) return '—'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 10_000)    return `${(n / 1_000).toFixed(1)}K`
  return n.toLocaleString('es-AR')
}

function engagementColor(rate) {
  if (rate == null) return 'text-gray-400'
  if (rate >= 3)    return 'text-green-600 dark:text-green-400'
  if (rate >= 1)    return 'text-yellow-600 dark:text-yellow-400'
  return 'text-red-600 dark:text-red-400'
}

function engagementLabel(rate) {
  if (rate == null) return null
  if (rate >= 3)    return 'Excelente'
  if (rate >= 1)    return 'Promedio'
  return 'Bajo'
}

function hourRange(h) {
  const end = (h + 3) % 24
  return `${String(h).padStart(2, '0')}:00 – ${String(end).padStart(2, '0')}:00`
}

function subtractDays(dateStr, days) {
  const d = new Date(dateStr)
  d.setDate(d.getDate() - days)
  return d.toISOString().slice(0, 10)
}

function todayAR() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' }))
    .toISOString().slice(0, 10)
}

// ── SVG Line Chart genérico ────────────────────────────────────────────────────

function LineChart({ data, valueAccessor, labelAccessor, label, color = '#a855f7', formatY = v => v, chartHeight = 90, displayHeight = 100, bare = false }) {
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

function monthLabel(ym) {
  const [y, m] = ym.split('-')
  const label = new Date(Number(y), Number(m) - 1, 1)
    .toLocaleString('es-AR', { month: 'long', year: 'numeric' })
  return label.charAt(0).toUpperCase() + label.slice(1)
}

function MonthNav({ selectedMonth, availableMonths, onChange }) {
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

const FOLLOWER_FILTERS = [
  { key: '7d',    label: '7 días',   days: 7   },
  { key: '30d',   label: '30 días',  days: 30  },
  { key: '90d',   label: '3 meses',  days: 90  },
  { key: '180d',  label: '6 meses',  days: 180 },
  { key: 'all',   label: 'Todo',     days: null },
]

function FollowersCard({ followersCount, mediaCount, monthlyGain }) {
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

function KpiCard({ icon, label, value, sub, valueClass = '' }) {
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
function ReachHighlight({ post }) {
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

function TopOfMonth({ topPosts, postsThisMonth, label, isPast = false }) {
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

function ContentInsights({ byType, bestHour }) {
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

function AccountHeader({ metrics, integration, onDisconnect, disconnecting, onRefresh, refreshing }) {
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
            <div className="w-14 h-14 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center text-white text-2xl">
              📸
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

// ── Estado vacío (sin integración) ────────────────────────────────────────────

function ConnectPrompt({ projectId, onConnected }) {
  const [loading,       setLoading]       = useState(false)
  const [error,         setError]         = useState(null)
  const [expanded,      setExpanded]      = useState('token') // 'official' | 'token' | 'scrape' | null
  const [manualToken,   setManualToken]   = useState('')
  const [manualLoading, setManualLoading] = useState(false)
  const [accounts,      setAccounts]      = useState(null) // lista cuando hay múltiples
  const [scrapeInput,   setScrapeInput]   = useState('')
  const [scrapeLoading, setScrapeLoading] = useState(false)
  const pollRef = useRef(null)

  const toggle = (key) => { setExpanded(prev => prev === key ? null : key); setError(null) }

  const handleScrapeConnect = async () => {
    if (!scrapeInput.trim()) { setError('Pegá el usuario o la URL del perfil.'); return }
    setScrapeLoading(true)
    setError(null)
    try {
      await api.post(
        `/marketing/projects/${projectId}/integrations/instagram/connect-scrape`,
        { url: scrapeInput.trim() },
      )
      onConnected()
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo conectar por scraping.')
    } finally {
      setScrapeLoading(false)
    }
  }

  const handleConnect = async () => {
    if (!projectId) { setError('Seleccioná un proyecto primero.'); return }
    setLoading(true)
    setError(null)
    try {
      const { data } = await api.get('/marketing/integrations/meta/auth-url', { params: { projectId } })
      localStorage.removeItem('__ga_oauth_result')
      const popup = window.open(data.url, 'meta_oauth', 'width=520,height=660,left=200,top=100')

      let elapsed = 0
      pollRef.current = setInterval(async () => {
        elapsed += 600
        try {
          const raw = localStorage.getItem('__ga_oauth_result')
          if (raw) {
            const result = JSON.parse(raw)
            localStorage.removeItem('__ga_oauth_result')
            clearInterval(pollRef.current)
            setLoading(false)
            if (result.success && result.integrationType === 'instagram') onConnected()
            else setError(result.error || 'Error al conectar Instagram.')
            return
          }
        } catch { /* ignorar */ }
        if (popup?.closed) { clearInterval(pollRef.current); setLoading(false) }
        if (elapsed >= 5 * 60 * 1000) {
          clearInterval(pollRef.current); setLoading(false)
          setError('La conexión tardó demasiado. Intentá de nuevo.')
        }
      }, 600)
    } catch (err) {
      setLoading(false)
      setError(err.response?.data?.error || 'No se pudo iniciar la conexión.')
    }
  }

  const handleManualConnect = async (igAccountId = null) => {
    if (!manualToken.trim()) { setError('Pegá el token de acceso.'); return }
    setManualLoading(true)
    setError(null)
    try {
      const body = { accessToken: manualToken.trim() }
      if (igAccountId) body.igAccountId = igAccountId
      const { data } = await api.post(
        `/marketing/projects/${projectId}/integrations/instagram/connect-token`,
        body,
      )
      if (data.accounts) {
        // Múltiples cuentas — mostrar picker
        setAccounts(data.accounts)
      } else {
        onConnected()
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Token inválido o sin permisos suficientes.')
    } finally {
      setManualLoading(false)
    }
  }

  const chevron = (open) => (
    <svg className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
  )

  return (
    <div className="max-w-lg mx-auto py-10">
      <div className="text-center mb-6">
        <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-pink-500 rounded-2xl flex items-center justify-center text-3xl mb-4 mx-auto">📸</div>
        <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-1">Conectá Instagram</h3>
        <p className="text-sm text-gray-400 dark:text-gray-500">Elegí cómo querés traer los datos de la cuenta.</p>
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400 mb-4 text-center">{error}</p>}
      {!projectId && <p className="text-xs text-gray-400 mb-4 text-center">Seleccioná un proyecto para continuar.</p>}

      <div className="space-y-3">

        {/* Método 1 — Conexión oficial (Instagram Business Login) */}
        <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
          <div className="w-full flex items-center gap-3 px-4 py-3">
            <span className="text-xl shrink-0">🔗</span>
            <div className="flex-1 min-w-0 text-left">
              <p className="text-sm font-medium text-gray-800 dark:text-gray-200">Conexión oficial</p>
              <p className="text-xs text-gray-400 dark:text-gray-500">Instagram Business Login — directo, sin tokens</p>
            </div>
          </div>
          <div className="px-4 pb-3 -mt-1">
            <button
              onClick={handleConnect}
              disabled={loading || !projectId}
              className="w-full py-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white text-xs font-semibold rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
            >
              {loading ? 'Conectando…' : 'Conectar con Instagram'}
            </button>
          </div>
        </div>

        {/* Método 2 — Token de Business Manager (recomendado) */}
        <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
          <button
            onClick={() => toggle('token')}
            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
          >
            <span className="text-xl shrink-0">🔑</span>
            <div className="flex-1 min-w-0 text-left">
              <p className="text-sm font-medium text-gray-800 dark:text-gray-200">Token de Business Manager</p>
              <p className="text-xs text-gray-400 dark:text-gray-500">System User Token — datos completos vía API</p>
            </div>
            <span className="text-xs bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 px-2 py-1 rounded-full shrink-0">Recomendado</span>
            {chevron(expanded === 'token')}
          </button>

          {expanded === 'token' && (
            <div className="px-4 pb-4 pt-1 text-left space-y-3 border-t border-gray-100 dark:border-gray-700/50">
              {/* Picker de cuentas (paso 2 cuando hay múltiples) */}
              {accounts ? (
                <>
                  <p className="text-xs font-semibold text-gray-600 dark:text-gray-300">
                    Encontramos {accounts.length} cuentas. Elegí cuál conectar a este proyecto:
                  </p>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {accounts.map(acc => (
                      <button
                        key={acc.id}
                        onClick={() => handleManualConnect(acc.id)}
                        disabled={manualLoading}
                        className="w-full flex items-center gap-2.5 px-3 py-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-600 rounded-lg hover:border-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors text-left disabled:opacity-50"
                      >
                        <span className="w-7 h-7 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
                          {(acc.username || acc.name || '?')[0].toUpperCase()}
                        </span>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-gray-800 dark:text-gray-200 truncate">
                            {acc.username ? `@${acc.username}` : acc.name || acc.id}
                          </p>
                          {acc.username && acc.name && acc.name !== acc.username && (
                            <p className="text-[10px] text-gray-400 truncate">{acc.name}</p>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => setAccounts(null)}
                    className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 underline underline-offset-2"
                  >
                    ← Usar otro token
                  </button>
                </>
              ) : (
                <>
                  <div>
                    <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Cómo obtener el token desde Business Manager:</p>
                    <ol className="text-xs text-gray-500 dark:text-gray-400 list-decimal list-inside space-y-1 leading-relaxed">
                      <li>Abrí <span className="font-mono">business.facebook.com</span> → Configuración del negocio</li>
                      <li>Usuarios del sistema → Agregar usuario del sistema (rol: Empleado o Admin)</li>
                      <li>Asegurate de que las cuentas de Instagram estén asignadas al usuario del sistema</li>
                      <li>Hacé clic en el usuario del sistema → <strong>Generar nuevo token de acceso</strong></li>
                      <li>Seleccioná la app <strong>BlissTracker</strong> y activá: <span className="font-mono">business_management</span>, <span className="font-mono">instagram_basic</span>, <span className="font-mono">instagram_manage_insights</span>, <span className="font-mono">pages_show_list</span>. <strong>El permiso <span className="font-mono">business_management</span> es clave</strong> para ver las cuentas de clientes administradas vía Business Manager.</li>
                      <li>Copiá el token y pegalo abajo</li>
                    </ol>
                  </div>
                  <textarea
                    value={manualToken}
                    onChange={e => setManualToken(e.target.value)}
                    placeholder="EAABwz..."
                    rows={3}
                    className="w-full text-xs font-mono bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-gray-700 dark:text-gray-200 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-purple-500 resize-none"
                  />
                  <button
                    onClick={() => handleManualConnect()}
                    disabled={manualLoading || !manualToken.trim()}
                    className="w-full py-2 bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {manualLoading ? 'Verificando…' : 'Conectar con token'}
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {/* Método 3 — Scraping (oculto temporalmente durante el App Review de Meta) */}
        {false && (
        <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
          <button
            onClick={() => toggle('scrape')}
            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
          >
            <span className="text-xl shrink-0">🔎</span>
            <div className="flex-1 min-w-0 text-left">
              <p className="text-sm font-medium text-gray-800 dark:text-gray-200">Scraping</p>
              <p className="text-xs text-gray-400 dark:text-gray-500">Sin conexión — datos públicos del perfil</p>
            </div>
            {chevron(expanded === 'scrape')}
          </button>

          {expanded === 'scrape' && (
            <div className="px-4 pb-4 pt-1 text-left space-y-3 border-t border-gray-100 dark:border-gray-700/50">
              <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                Pegá el usuario o la URL del perfil <strong>público</strong>. Traemos seguidores, publicaciones e interacciones por scraping. Ideal cuando no podés usar la API. Las cuentas privadas no se pueden analizar.
              </p>
              <input
                type="text"
                value={scrapeInput}
                onChange={e => setScrapeInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleScrapeConnect() }}
                placeholder="@usuario o https://instagram.com/usuario"
                className="w-full text-xs bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-gray-700 dark:text-gray-200 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-purple-500"
              />
              <button
                onClick={handleScrapeConnect}
                disabled={scrapeLoading || !scrapeInput.trim()}
                className="w-full py-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white text-xs font-semibold rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
              >
                {scrapeLoading ? 'Analizando perfil…' : 'Conectar por scraping'}
              </button>
            </div>
          )}
        </div>
        )}

      </div>
    </div>
  )
}

// ── Panel cross-proyecto ──────────────────────────────────────────────────────

function CrossProjectInstagramPanel({ onSelectProject }) {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/marketing/summary/instagram')
      .then(r => setData(r.data))
      .catch(() => setData([]))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="flex justify-center py-12"><div className="w-6 h-6 border-2 border-pink-500 border-t-transparent rounded-full animate-spin" /></div>
  )
  if (!data?.length) return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-10 text-center">
      <div className="text-4xl mb-3">📸</div>
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

// ── Componente principal ──────────────────────────────────────────────────────

export default function InstagramTab({ projectId, onSelectProject }) {
  const currentMonth = todayAR().slice(0, 7)

  const [integration,    setIntegration]    = useState(null)
  const [metrics,        setMetrics]        = useState(null)
  const [snapshots,      setSnapshots]      = useState([])
  const [objectives,     setObjectives]     = useState([])
  const [selectedMonth,  setSelectedMonth]  = useState(currentMonth)
  const [followerLogs,   setFollowerLogs]   = useState([])
  const [monthStartFollowers, setMonthStartFollowers] = useState(null)
  const [followerFilter, setFollowerFilter] = useState('30d')
  const [followerLoading,setFollowerLoading]= useState(false)
  const [loading,        setLoading]        = useState(false)
  const [error,          setError]          = useState(null)
  const [disconnecting,  setDisconnecting]  = useState(false)

  const fetchData = useCallback(async () => {
    if (!projectId) return
    setLoading(true)
    setError(null)
    try {
      const intgsRes = await api.get(`/marketing/projects/${projectId}/integrations`)
      const ig = intgsRes.data.find(i => i.type === 'instagram')
      setIntegration(ig ?? null)
      if (!ig) { setLoading(false); return }

      const [metricsRes, snapshotsRes, logsRes, objsRes] = await Promise.allSettled([
        api.get(`/marketing/projects/${projectId}/instagram`),
        api.get(`/marketing/projects/${projectId}/instagram/snapshots`),
        api.get(`/marketing/projects/${projectId}/instagram/followers`, { params: { to: todayAR() } }),
        api.get(`/marketing/projects/${projectId}/objectives/progress`),
      ])

      if (metricsRes.status   === 'fulfilled') setMetrics(metricsRes.value.data)
      if (snapshotsRes.status === 'fulfilled') setSnapshots(snapshotsRes.value.data.snapshots ?? [])
      if (objsRes.status      === 'fulfilled') {
        const all = objsRes.value.data.objectives ?? []
        setObjectives(all.filter(o => ['seguidores', 'interaccion'].includes(o.metric) && o.detail?.platform === 'instagram'))
      }
      if (logsRes.status      === 'fulfilled') {
        const logs = logsRes.value.data.logs ?? []
        setFollowerLogs(logs)
        const monthStart = todayAR().slice(0, 7) + '-01'
        const firstInMonth = logs.find(l => l.date >= monthStart)
        setMonthStartFollowers(firstInMonth?.followersCount ?? null)
      }
      if (metricsRes.status   === 'rejected')  setError(metricsRes.reason?.response?.data?.error || 'No se pudieron cargar las métricas.')
    } catch (err) {
      setError(err.response?.data?.error || 'Error al cargar datos de Instagram.')
    } finally {
      setLoading(false)
    }
  }, [projectId])

  const fetchFollowerLogs = useCallback(async (filterKey) => {
    if (!projectId) return
    setFollowerLoading(true)
    try {
      const today = todayAR()
      const f = FOLLOWER_FILTERS.find(x => x.key === filterKey)
      const from = f.days ? subtractDays(today, f.days - 1) : undefined
      const params = { to: today }
      if (from) params.from = from
      const { data } = await api.get(`/marketing/projects/${projectId}/instagram/followers`, { params })
      setFollowerLogs(data.logs ?? [])
    } catch { /* silencioso */ }
    finally { setFollowerLoading(false) }
  }, [projectId])

  useEffect(() => { fetchData() }, [fetchData])

  async function handleDisconnect() {
    if (!window.confirm('¿Desconectar la cuenta de Instagram de este proyecto?')) return
    setDisconnecting(true)
    try {
      await api.delete(`/marketing/projects/${projectId}/integrations/instagram`)
      setIntegration(null); setMetrics(null); setSnapshots([])
    } catch (err) {
      alert(err.response?.data?.error || 'No se pudo desconectar.')
    } finally { setDisconnecting(false) }
  }

  const [refreshing, setRefreshing] = useState(false)
  async function handleRefreshScrape() {
    setRefreshing(true)
    setError(null)
    try {
      const { data } = await api.post(`/marketing/projects/${projectId}/instagram/scrape/refresh`)
      setMetrics(data)
      // Refrescar snapshots y logs de seguidores en segundo plano
      fetchData()
    } catch (err) {
      const code = err.response?.data?.code
      setError(err.response?.data?.error || (code === 'COOLDOWN' ? 'Esperá un momento para actualizar de nuevo.' : 'No se pudo actualizar.'))
    } finally { setRefreshing(false) }
  }

  if (!projectId) {
    return <CrossProjectInstagramPanel onSelectProject={onSelectProject} />
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!integration) return <ConnectPrompt projectId={projectId} onConnected={fetchData} />

  // Meses disponibles: mes actual + meses con snapshot (ordenados más reciente primero)
  const availableMonths = [...new Set([currentMonth, ...snapshots.map(s => s.month)])]
    .sort().reverse()

  const isCurrentMonth = selectedMonth === currentMonth
  // Para el mes actual → datos en vivo; para meses anteriores → snapshot guardado
  const displayData = isCurrentMonth
    ? metrics
    : (snapshots.find(s => s.month === selectedMonth) ?? null)

  // Insights (reach/saved/shares) — el mes actual usa nombres *ThisMonth (en vivo),
  // los snapshots guardados usan las columnas reach/views. Normalizamos a un solo shape.
  const reachVal   = displayData?.reachThisMonth ?? displayData?.reach ?? null
  const viewsVal   = displayData?.viewsThisMonth ?? displayData?.views ?? null
  const savedVal   = displayData?.totalSaved  ?? null
  const sharesVal  = displayData?.totalShares ?? null
  const avgReachVal = displayData?.avgReach   ?? null
  const hasInsights = [reachVal, viewsVal, savedVal, sharesVal, avgReachVal].some(v => v != null)
  // Publicación de mayor alcance: en vivo viene calculada; en snapshots se deriva de topPosts.
  const bestByReach = displayData?.bestByReach
    ?? (Array.isArray(displayData?.topPosts)
      ? displayData.topPosts.filter(p => p.reach != null).sort((a, b) => (b.reach ?? 0) - (a.reach ?? 0))[0] ?? null
      : null)

  // Seguidores ganados en el mes actual: primer log del mes (fijado en la carga inicial) vs. valor actual
  const monthlyGain = (isCurrentMonth && displayData?.followersCount != null && monthStartFollowers != null)
    ? displayData.followersCount - monthStartFollowers
    : null

  return (
    <div className="space-y-4">

      {/* Header con perfil */}
      <AccountHeader metrics={metrics} integration={integration} onDisconnect={handleDisconnect} disconnecting={disconnecting} onRefresh={handleRefreshScrape} refreshing={refreshing} />

      {/* Error */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 text-sm text-red-700 dark:text-red-300">{error}</div>
      )}

      {/* Navegación por mes */}
      {availableMonths.length > 0 && (
        <MonthNav
          selectedMonth={selectedMonth}
          availableMonths={availableMonths}
          onChange={setSelectedMonth}
        />
      )}

      {/* KPI cards */}
      {displayData && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <FollowersCard followersCount={displayData.followersCount} mediaCount={displayData.mediaCount} monthlyGain={monthlyGain} />
          <KpiCard
            icon="❤️" label="Engagement"
            value={displayData.engagementRate != null ? `${displayData.engagementRate}%` : '—'}
            valueClass={engagementColor(displayData.engagementRate)}
            sub={engagementLabel(displayData.engagementRate)}
          />
          <KpiCard
            icon="👍" label="Avg. Likes"
            value={displayData.avgLikes != null ? fmtNum(displayData.avgLikes) : '—'}
            sub="promedio del mes"
          />
          <KpiCard
            icon="💬" label="Avg. Comentarios"
            value={displayData.avgComments != null ? fmtNum(displayData.avgComments) : '—'}
            sub="promedio del mes"
          />
          <KpiCard
            icon="📅" label="Posts del mes"
            value={(displayData.postsThisMonth ?? displayData.postsCount) != null
              ? fmtNum(displayData.postsThisMonth ?? displayData.postsCount)
              : '—'}
            sub={isCurrentMonth ? 'publicaciones este mes' : 'publicaciones ese mes'}
          />
        </div>
      )}

      {/* KPIs de Insights (alcance/guardados/compartidos) — solo si la cuenta los expone */}
      {hasInsights && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <KpiCard
            icon="📡" label="Alcance del mes"
            value={reachVal != null ? fmtNum(reachVal) : '—'}
            valueClass="text-purple-600 dark:text-purple-400"
            sub="cuentas alcanzadas"
          />
          <KpiCard
            icon="👁️" label="Vistas"
            value={viewsVal != null ? fmtNum(viewsVal) : '—'}
            sub="impresiones del mes"
          />
          <KpiCard
            icon="🔖" label="Guardados"
            value={savedVal != null ? fmtNum(savedVal) : '—'}
            sub="posts del mes"
          />
          <KpiCard
            icon="↗️" label="Compartidos"
            value={sharesVal != null ? fmtNum(sharesVal) : '—'}
            sub="posts del mes"
          />
          <KpiCard
            icon="📊" label="Alcance prom."
            value={avgReachVal != null ? fmtNum(avgReachVal) : '—'}
            sub="por publicación"
          />
        </div>
      )}

      {/* Objetivos de Instagram del período (seguidores / interacción) con barra de progreso */}
      <ObjectiveProgressBars objectives={objectives} title="🎯 Objetivos de Instagram" />

      {/* Insights: breakdown por tipo + mejor horario — solo mes actual (datos en vivo) */}
      {isCurrentMonth && metrics && <ContentInsights byType={metrics.byType} bestHour={metrics.bestHour} />}

      {/* Publicación de mayor alcance (requiere Insights) */}
      <ReachHighlight post={bestByReach} />

      {/* TOP del mes — mes actual: datos en vivo; meses anteriores: snapshot guardado */}
      {isCurrentMonth && metrics?.topPosts && (
        <TopOfMonth topPosts={metrics.topPosts} postsThisMonth={metrics.postsThisMonth} />
      )}
      {!isCurrentMonth && displayData?.topPosts?.length > 0 && (
        <TopOfMonth
          topPosts={displayData.topPosts}
          postsThisMonth={displayData.postsThisMonth ?? displayData.postsCount}
          label={monthLabel(selectedMonth)}
          isPast
        />
      )}

      {/* Evolución de seguidores */}
      {integration && (() => {
        // Fallback: si hay pocos logs diarios, usar snapshots mensuales como historial
        const snapshotFallback = followerLogs.length < 2 && snapshots.filter(s => s.followersCount != null).length >= 2
          ? snapshots.filter(s => s.followersCount != null).map(s => ({ date: `${s.month}-01`, followersCount: s.followersCount }))
          : null
        const chartData = snapshotFallback || followerLogs
        const hasChart  = chartData.length >= 2

        return (
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <div>
                <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">📈 Evolución de seguidores</p>
                {snapshotFallback && (
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Datos mensuales · el gráfico diario se irá completando</p>
                )}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {hasChart && (() => {
                  const delta = chartData[chartData.length - 1].followersCount - chartData[0].followersCount
                  return (
                    <span className={`text-xs font-semibold ${delta >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500'}`}>
                      {delta >= 0 ? '+' : ''}{fmtNum(delta)} en el período
                    </span>
                  )
                })()}
                {!snapshotFallback && (
                  <div className="flex gap-1 flex-wrap">
                    {FOLLOWER_FILTERS.map(f => (
                      <button
                        key={f.key}
                        onClick={() => { setFollowerFilter(f.key); fetchFollowerLogs(f.key) }}
                        className={`px-2.5 py-1 text-xs rounded-lg transition-colors ${
                          followerFilter === f.key
                            ? 'bg-purple-600 text-white'
                            : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                        }`}
                      >{f.label}</button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {followerLoading ? (
              <div className="flex justify-center py-10">
                <div className="w-5 h-5 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : hasChart ? (
              <LineChart
                data={chartData}
                valueAccessor={d => d.followersCount}
                labelAccessor={d => snapshotFallback ? d.date?.slice(0, 7) : d.date?.slice(5)}
                color="#a855f7"
                formatY={v => fmtK(Math.round(v))}
                chartHeight={160}
                displayHeight={180}
                bare
              />
            ) : (
              <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">
                Recopilando información, pronto vas a poder ver la evolución de seguidores.
              </p>
            )}
          </div>
        )
      })()}

      {/* Engagement histórico mensual — aparece cuando hay 2+ meses con datos */}
      {snapshots.filter(d => d.engagementRate != null).length >= 2 && (
        <LineChart
          data={snapshots.filter(d => d.engagementRate != null)}
          valueAccessor={d => d.engagementRate}
          labelAccessor={d => d.month?.slice(5)}
          label="Engagement rate mensual (%)"
          color="#ec4899"
          formatY={v => `${v.toFixed(1)}%`}
          chartHeight={160}
          displayHeight={180}
        />
      )}

      {/* Alcance histórico mensual — aparece cuando hay 2+ meses con Insights */}
      {snapshots.filter(d => d.reach != null).length >= 2 && (
        <LineChart
          data={snapshots.filter(d => d.reach != null)}
          valueAccessor={d => d.reach}
          labelAccessor={d => d.month?.slice(5)}
          label="Alcance mensual"
          color="#a855f7"
          formatY={v => fmtK(Math.round(v))}
          chartHeight={160}
          displayHeight={180}
        />
      )}
    </div>
  )
}
