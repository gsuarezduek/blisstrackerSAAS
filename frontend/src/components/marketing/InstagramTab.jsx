import { useState, useEffect, useRef, useCallback } from 'react'
import api from '../../api/client'

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

function FollowersCard({ followersCount, mediaCount }) {
  return (
    <div className="col-span-2 sm:col-span-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 flex flex-col gap-1">
      <div className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400 text-xs">
        <span>👥</span>
        <span>Seguidores</span>
      </div>
      <div className="text-2xl font-bold text-gray-900 dark:text-white">{fmtK(followersCount)}</div>
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

function TopPostCard({ post, medal, category, categoryIcon }) {
  if (!post) return (
    <div className="bg-white dark:bg-gray-800 border border-dashed border-gray-200 dark:border-gray-700 rounded-xl p-4 flex flex-col items-center justify-center gap-2 min-h-[160px]">
      <span className="text-2xl opacity-30">{categoryIcon}</span>
      <p className="text-xs text-gray-400 text-center">Sin publicaciones este mes</p>
    </div>
  )

  return (
    <a
      href={post.permalink ?? '#'}
      target="_blank"
      rel="noopener noreferrer"
      className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden flex flex-col group hover:border-purple-300 dark:hover:border-purple-700 transition-colors"
    >
      {/* Imagen */}
      <div className="relative aspect-square bg-gray-100 dark:bg-gray-700">
        {post.imgSrc ? (
          <img src={post.imgSrc} alt="" className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-purple-400 to-pink-400" />
        )}
        <div className="absolute top-2 left-2 text-xl leading-none">{medal}</div>
        {post.mediaType === 'VIDEO'          && <div className="absolute top-2 right-2 bg-black/60 rounded px-1 text-white text-[10px]">▶</div>}
        {post.mediaType === 'CAROUSEL_ALBUM' && <div className="absolute top-2 right-2 bg-black/60 rounded px-1 text-white text-[10px]">❏</div>}
      </div>

      {/* Info */}
      <div className="p-3 space-y-1.5">
        <p className="text-[10px] font-semibold text-purple-600 dark:text-purple-400 uppercase tracking-wide">
          {categoryIcon} {category}
        </p>
        <div className="flex items-center gap-3 text-xs text-gray-600 dark:text-gray-400">
          {post.likeCount     != null && <span>❤️ {fmtK(post.likeCount)}</span>}
          {post.commentsCount != null && <span>💬 {fmtK(post.commentsCount)}</span>}
        </div>
        {post.caption && (
          <p className="text-[11px] text-gray-500 dark:text-gray-400 line-clamp-2 leading-tight">
            {post.caption}
          </p>
        )}
      </div>
    </a>
  )
}

function TopOfMonth({ topOfMonth }) {
  if (!topOfMonth) return null

  const { topLikes, topComments, topEngagement, postsThisMonth } = topOfMonth

  // Deduplicar: si dos categorías apuntan al mismo post, la segunda queda en null
  const ids = new Set()
  function dedup(post) {
    if (!post || ids.has(post.id)) return null
    ids.add(post.id)
    return post
  }
  const p1 = dedup(topLikes)
  const p2 = dedup(topComments)
  const p3 = dedup(topEngagement)

  const currentMonth = new Date().toLocaleString('es-AR', { month: 'long', timeZone: 'America/Argentina/Buenos_Aires' })

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            🏆 TOP del mes — {currentMonth}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">
            {postsThisMonth > 0
              ? `${postsThisMonth} publicación${postsThisMonth !== 1 ? 'es' : ''} este mes`
              : 'Sin publicaciones en lo que va del mes'}
          </p>
        </div>
      </div>

      {postsThisMonth === 0 ? (
        <p className="text-sm text-gray-400 text-center py-6">
          Aún no hay publicaciones este mes. El ranking se actualizará con la primera.
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <TopPostCard post={p1} medal="🥇" category="Más likes"    categoryIcon="❤️" />
          <TopPostCard post={p2} medal="🥈" category="Más comentarios" categoryIcon="💬" />
          <TopPostCard post={p3} medal="🥉" category="Más interacciones" categoryIcon="⚡" />
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

function AccountHeader({ metrics, integration, onDisconnect, disconnecting }) {
  const [imgError, setImgError] = useState(false)

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5">
      <div className="flex items-start gap-4">
        <div className="shrink-0">
          {metrics?.profilePicUrl && !imgError ? (
            <img
              src={metrics.profilePicUrl}
              alt={metrics.username ?? 'Instagram'}
              onError={() => setImgError(true)}
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
              <p className="font-semibold text-gray-900 dark:text-white">
                {metrics?.username ? `@${metrics.username}` : (metrics?.name ?? 'Instagram')}
              </p>
              {metrics?.name && metrics?.username && (
                <p className="text-xs text-gray-500 dark:text-gray-400">{metrics.name}</p>
              )}
            </div>
            <button
              onClick={onDisconnect}
              disabled={disconnecting}
              className="text-xs text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors disabled:opacity-50 shrink-0"
            >
              {disconnecting ? 'Desconectando…' : 'Desconectar'}
            </button>
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
          </p>
        </div>
      </div>
    </div>
  )
}

// ── Estado vacío (sin integración) ────────────────────────────────────────────

function ConnectPrompt({ projectId, onConnected }) {
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)
  const pollRef = useRef(null)

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

  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-pink-500 rounded-2xl flex items-center justify-center text-3xl mb-4">📸</div>
      <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">Conectá tu cuenta de Instagram</h3>
      <p className="text-sm text-gray-400 dark:text-gray-500 max-w-xs mb-6">Necesitás una cuenta de Instagram Business o Creator.</p>
      {error && <p className="text-sm text-red-600 dark:text-red-400 mb-4 max-w-sm">{error}</p>}
      <button
        onClick={handleConnect}
        disabled={loading || !projectId}
        className="px-5 py-2.5 bg-gradient-to-r from-purple-600 to-pink-600 text-white text-sm font-semibold rounded-xl hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
      >
        {loading ? 'Conectando…' : 'Conectar Instagram'}
      </button>
      {!projectId && <p className="text-xs text-gray-400 mt-2">Seleccioná un proyecto para continuar.</p>}
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function InstagramTab({ projectId }) {
  const currentMonth = todayAR().slice(0, 7)

  const [integration,    setIntegration]    = useState(null)
  const [metrics,        setMetrics]        = useState(null)
  const [snapshots,      setSnapshots]      = useState([])
  const [selectedMonth,  setSelectedMonth]  = useState(currentMonth)
  const [followerLogs,   setFollowerLogs]   = useState([])
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

      const [metricsRes, snapshotsRes, logsRes] = await Promise.allSettled([
        api.get(`/marketing/projects/${projectId}/instagram`),
        api.get(`/marketing/projects/${projectId}/instagram/snapshots`),
        api.get(`/marketing/projects/${projectId}/instagram/followers`, { params: { to: todayAR() } }),
      ])

      if (metricsRes.status   === 'fulfilled') setMetrics(metricsRes.value.data)
      if (snapshotsRes.status === 'fulfilled') setSnapshots(snapshotsRes.value.data.snapshots ?? [])
      if (logsRes.status      === 'fulfilled') setFollowerLogs(logsRes.value.data.logs ?? [])
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

  if (!projectId) {
    return <div className="text-center py-20 text-sm text-gray-400 dark:text-gray-500">Seleccioná un proyecto para ver las métricas de Instagram.</div>
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

  return (
    <div className="space-y-4">

      {/* Header con perfil */}
      <AccountHeader metrics={metrics} integration={integration} onDisconnect={handleDisconnect} disconnecting={disconnecting} />

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
          <FollowersCard followersCount={displayData.followersCount} mediaCount={displayData.mediaCount} />
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

      {/* Insights: breakdown por tipo + mejor horario — solo mes actual (datos en vivo) */}
      {isCurrentMonth && metrics && <ContentInsights byType={metrics.byType} bestHour={metrics.bestHour} />}

      {/* TOP del mes — solo mes actual (datos en vivo) */}
      {isCurrentMonth && metrics?.topOfMonth && <TopOfMonth topOfMonth={metrics.topOfMonth} />}

      {/* Evolución de seguidores */}
      {integration && (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">📈 Evolución de seguidores</p>
            <div className="flex items-center gap-2 flex-wrap">
              {followerLogs.length >= 2 && (() => {
                const delta = followerLogs[followerLogs.length - 1].followersCount - followerLogs[0].followersCount
                return (
                  <span className={`text-xs font-semibold ${delta >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500'}`}>
                    {delta >= 0 ? '+' : ''}{fmtNum(delta)} en el período
                  </span>
                )
              })()}
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
            </div>
          </div>

          {followerLoading ? (
            <div className="flex justify-center py-10">
              <div className="w-5 h-5 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : followerLogs.length >= 2 ? (
            <LineChart
              data={followerLogs}
              valueAccessor={d => d.followersCount}
              labelAccessor={d => d.date?.slice(5)}
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
      )}

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
    </div>
  )
}
