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

function engColor(rate) {
  if (rate == null) return 'text-gray-400'
  if (rate >= 5)    return 'text-green-600 dark:text-green-400'
  if (rate >= 2)    return 'text-yellow-600 dark:text-yellow-400'
  return 'text-red-600 dark:text-red-400'
}

function engLabel(rate) {
  if (rate == null) return null
  if (rate >= 5)    return 'Excelente'
  if (rate >= 2)    return 'Promedio'
  return 'Bajo'
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

function monthLabel(ym) {
  const [y, m] = ym.split('-')
  const label = new Date(Number(y), Number(m) - 1, 1)
    .toLocaleString('es-AR', { month: 'long', year: 'numeric' })
  return label.charAt(0).toUpperCase() + label.slice(1)
}

const TEAL = '#69C9D0'

// ── SVG Line Chart ────────────────────────────────────────────────────────────

function LineChart({ data, valueAccessor, labelAccessor, color = TEAL, formatY = v => v, chartHeight = 90, displayHeight = 100, bare = false }) {
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
  const step = Math.max(1, Math.floor(data.length / 10))
  const pathD = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${xScale(i).toFixed(1)} ${yScale(valueAccessor(d)).toFixed(1)}`).join(' ')
  const chart = (
    <>
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

// ── Navegación por mes ────────────────────────────────────────────────────────

function MonthNav({ selectedMonth, availableMonths, onChange }) {
  const idx = availableMonths.indexOf(selectedMonth)
  const canPrev = idx < availableMonths.length - 1
  const canNext = idx > 0
  const isCurrentMonth = idx === 0
  return (
    <div className="flex items-center justify-between bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3">
      <button onClick={() => canPrev && onChange(availableMonths[idx + 1])} disabled={!canPrev}
        className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-lg">‹</button>
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">{monthLabel(selectedMonth)}</span>
        {isCurrentMonth
          ? <span className="text-[10px] bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400 px-2 py-0.5 rounded-full font-medium">En vivo</span>
          : <span className="text-[10px] bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 px-2 py-0.5 rounded-full font-medium">Snapshot</span>
        }
      </div>
      <button onClick={() => canNext && onChange(availableMonths[idx - 1])} disabled={!canNext}
        className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-lg">›</button>
    </div>
  )
}

// ── KPI Card ──────────────────────────────────────────────────────────────────

function KpiCard({ icon, label, value, sub, valueClass = '' }) {
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 flex flex-col gap-1">
      <div className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400 text-xs"><span>{icon}</span><span>{label}</span></div>
      <div className={`text-2xl font-bold text-gray-900 dark:text-white ${valueClass}`}>{value}</div>
      {sub && <div className="text-xs text-gray-400 dark:text-gray-500">{sub}</div>}
    </div>
  )
}

// ── TOP del mes ───────────────────────────────────────────────────────────────

function TopVideoCard({ video, medal, category, categoryIcon }) {
  if (!video) return (
    <div className="bg-white dark:bg-gray-800 border border-dashed border-gray-200 dark:border-gray-700 rounded-xl p-4 flex flex-col items-center justify-center gap-2 min-h-[160px]">
      <span className="text-2xl opacity-30">{categoryIcon}</span>
      <p className="text-xs text-gray-400 text-center">Sin videos este mes</p>
    </div>
  )
  return (
    <a href={video.shareUrl ?? '#'} target="_blank" rel="noopener noreferrer"
      className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden flex flex-col group hover:border-teal-300 dark:hover:border-teal-700 transition-colors">
      <div className="relative aspect-[9/16] bg-gray-100 dark:bg-gray-700 max-h-48">
        {video.coverUrl
          ? <img src={video.coverUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
          : <div className="w-full h-full bg-gradient-to-br from-gray-800 to-gray-900" />
        }
        <div className="absolute top-2 left-2 text-xl leading-none">{medal}</div>
      </div>
      <div className="p-3 space-y-1.5">
        <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: TEAL }}>{categoryIcon} {category}</p>
        <div className="flex items-center gap-3 text-xs text-gray-600 dark:text-gray-400">
          {video.viewCount   != null && <span>▶ {fmtK(video.viewCount)}</span>}
          {video.likeCount   != null && <span>❤️ {fmtK(video.likeCount)}</span>}
          {video.shareCount  != null && <span>↗ {fmtK(video.shareCount)}</span>}
        </div>
        {video.title && <p className="text-[11px] text-gray-500 dark:text-gray-400 line-clamp-2 leading-tight">{video.title}</p>}
      </div>
    </a>
  )
}

function TopOfMonth({ topOfMonth }) {
  if (!topOfMonth) return null
  const { topViews, topLikes, topShares, postsThisMonth } = topOfMonth
  const ids = new Set()
  function dedup(v) { if (!v || ids.has(v.id)) return null; ids.add(v.id); return v }
  const v1 = dedup(topViews)
  const v2 = dedup(topLikes)
  const v3 = dedup(topShares)
  const currentMonth = new Date().toLocaleString('es-AR', { month: 'long', timeZone: 'America/Argentina/Buenos_Aires' })
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">🏆 TOP del mes — {currentMonth}</p>
          <p className="text-xs text-gray-400 mt-0.5">
            {postsThisMonth > 0 ? `${postsThisMonth} video${postsThisMonth !== 1 ? 's' : ''} este mes` : 'Sin videos en lo que va del mes'}
          </p>
        </div>
      </div>
      {postsThisMonth === 0
        ? <p className="text-sm text-gray-400 text-center py-6">Aún no hay videos este mes.</p>
        : <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <TopVideoCard video={v1} medal="🥇" category="Más visto"      categoryIcon="▶" />
            <TopVideoCard video={v2} medal="🥈" category="Más likeado"    categoryIcon="❤️" />
            <TopVideoCard video={v3} medal="🥉" category="Más compartido" categoryIcon="↗" />
          </div>
      }
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
          {metrics?.avatarUrl && !imgError
            ? <img src={metrics.avatarUrl} alt={metrics.displayName ?? 'TikTok'} onError={() => setImgError(true)}
                className="w-14 h-14 rounded-full object-cover border-2 border-teal-200 dark:border-teal-800" />
            : <div className="w-14 h-14 rounded-full flex items-center justify-center text-white text-2xl" style={{ background: 'linear-gradient(135deg, #000 50%, #69C9D0 100%)' }}>🎵</div>
          }
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-semibold text-gray-900 dark:text-white flex items-center gap-1.5">
                {metrics?.displayName ?? 'TikTok'}
                {metrics?.isVerified && <span className="text-teal-500 text-sm">✓</span>}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">{fmtK(metrics?.followingCount)} siguiendo · {fmtK(metrics?.likesCount)} likes totales</p>
            </div>
            <button onClick={onDisconnect} disabled={disconnecting}
              className="text-xs text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors disabled:opacity-50 shrink-0">
              {disconnecting ? 'Desconectando…' : 'Desconectar'}
            </button>
          </div>
          {metrics?.bioDescription && (
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1.5 line-clamp-2">{metrics.bioDescription}</p>
          )}
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1.5">
            Conectado el {new Date(integration.connectedAt).toLocaleDateString('es-AR')}
          </p>
        </div>
      </div>
    </div>
  )
}

// ── ConnectPrompt ─────────────────────────────────────────────────────────────

const FOLLOWER_FILTERS = [
  { key: '7d',   label: '7 días',  days: 7   },
  { key: '30d',  label: '30 días', days: 30  },
  { key: '90d',  label: '3 meses', days: 90  },
  { key: '180d', label: '6 meses', days: 180 },
  { key: 'all',  label: 'Todo',    days: null },
]

function ConnectPrompt({ projectId, onConnected }) {
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)
  const pollRef = useRef(null)

  const handleConnect = async () => {
    if (!projectId) { setError('Seleccioná un proyecto primero.'); return }
    setLoading(true); setError(null)
    try {
      const { data } = await api.get('/marketing/integrations/tiktok/auth-url', { params: { projectId } })
      localStorage.removeItem('__ga_oauth_result')
      const popup = window.open(data.url, 'tiktok_oauth', 'width=520,height=660,left=200,top=100')
      let elapsed = 0
      pollRef.current = setInterval(() => {
        elapsed += 600
        try {
          const raw = localStorage.getItem('__ga_oauth_result')
          if (raw) {
            const result = JSON.parse(raw)
            localStorage.removeItem('__ga_oauth_result')
            clearInterval(pollRef.current); setLoading(false)
            if (result.success && result.integrationType === 'tiktok') onConnected()
            else setError(result.error || 'Error al conectar TikTok.')
            return
          }
        } catch { /* ignorar */ }
        if (popup?.closed) { clearInterval(pollRef.current); setLoading(false) }
        if (elapsed >= 5 * 60 * 1000) { clearInterval(pollRef.current); setLoading(false); setError('La conexión tardó demasiado.') }
      }, 600)
    } catch (err) {
      setLoading(false)
      setError(err.response?.data?.error || 'No se pudo iniciar la conexión.')
    }
  }

  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl mb-4 text-white" style={{ background: 'linear-gradient(135deg, #000 50%, #69C9D0 100%)' }}>🎵</div>
      <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">Conectá tu cuenta de TikTok</h3>
      <p className="text-sm text-gray-400 dark:text-gray-500 max-w-xs mb-6">Necesitás una cuenta de TikTok Business o Creator.</p>
      {error && <p className="text-sm text-red-600 dark:text-red-400 mb-4 max-w-sm">{error}</p>}
      <button onClick={handleConnect} disabled={loading || !projectId}
        className="px-5 py-2.5 text-white text-sm font-semibold rounded-xl hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
        style={{ background: 'linear-gradient(135deg, #000 50%, #69C9D0 100%)' }}>
        {loading ? 'Conectando…' : 'Conectar TikTok'}
      </button>
      {!projectId && <p className="text-xs text-gray-400 mt-2">Seleccioná un proyecto para continuar.</p>}
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function TikTokTab({ projectId }) {
  const currentMonth = todayAR().slice(0, 7)

  const [integration,     setIntegration]    = useState(null)
  const [metrics,         setMetrics]        = useState(null)
  const [snapshots,       setSnapshots]      = useState([])
  const [selectedMonth,   setSelectedMonth]  = useState(currentMonth)
  const [followerLogs,    setFollowerLogs]   = useState([])
  const [followerFilter,  setFollowerFilter] = useState('30d')
  const [followerLoading, setFollowerLoading]= useState(false)
  const [loading,         setLoading]        = useState(false)
  const [error,           setError]          = useState(null)
  const [disconnecting,   setDisconnecting]  = useState(false)

  const fetchData = useCallback(async () => {
    if (!projectId) return
    setLoading(true); setError(null)
    try {
      const intgsRes = await api.get(`/marketing/projects/${projectId}/integrations`)
      const tk = intgsRes.data.find(i => i.type === 'tiktok')
      setIntegration(tk ?? null)
      if (!tk) { setLoading(false); return }

      const today = todayAR()
      const f = FOLLOWER_FILTERS.find(x => x.key === followerFilter)
      const from = f.days ? subtractDays(today, f.days - 1) : undefined
      const logParams = { to: today }
      if (from) logParams.from = from

      const [metricsRes, snapshotsRes, logsRes] = await Promise.allSettled([
        api.get(`/marketing/projects/${projectId}/tiktok`),
        api.get(`/marketing/projects/${projectId}/tiktok/snapshots`),
        api.get(`/marketing/projects/${projectId}/tiktok/followers`, { params: logParams }),
      ])

      if (metricsRes.status   === 'fulfilled') setMetrics(metricsRes.value.data)
      if (snapshotsRes.status === 'fulfilled') setSnapshots(snapshotsRes.value.data.snapshots ?? [])
      if (logsRes.status      === 'fulfilled') setFollowerLogs(logsRes.value.data.logs ?? [])
      if (metricsRes.status   === 'rejected')  setError(metricsRes.reason?.response?.data?.error || 'No se pudieron cargar las métricas.')
    } catch (err) {
      setError(err.response?.data?.error || 'Error al cargar datos de TikTok.')
    } finally { setLoading(false) }
  }, [projectId]) // eslint-disable-line react-hooks/exhaustive-deps

  const fetchFollowerLogs = useCallback(async (filterKey) => {
    if (!projectId) return
    setFollowerLoading(true)
    try {
      const today = todayAR()
      const f = FOLLOWER_FILTERS.find(x => x.key === filterKey)
      const from = f.days ? subtractDays(today, f.days - 1) : undefined
      const params = { to: today }
      if (from) params.from = from
      const { data } = await api.get(`/marketing/projects/${projectId}/tiktok/followers`, { params })
      setFollowerLogs(data.logs ?? [])
    } catch { /* silencioso */ }
    finally { setFollowerLoading(false) }
  }, [projectId])

  useEffect(() => { fetchData() }, [fetchData])

  async function handleDisconnect() {
    if (!window.confirm('¿Desconectar la cuenta de TikTok de este proyecto?')) return
    setDisconnecting(true)
    try {
      await api.delete(`/marketing/projects/${projectId}/integrations/tiktok`)
      setIntegration(null); setMetrics(null); setSnapshots([])
    } catch (err) {
      alert(err.response?.data?.error || 'No se pudo desconectar.')
    } finally { setDisconnecting(false) }
  }

  if (!projectId) return <div className="text-center py-20 text-sm text-gray-400 dark:text-gray-500">Seleccioná un proyecto para ver las métricas de TikTok.</div>

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: `${TEAL} transparent ${TEAL} ${TEAL}` }} />
    </div>
  )

  if (!integration) return <ConnectPrompt projectId={projectId} onConnected={fetchData} />

  const availableMonths = [...new Set([currentMonth, ...snapshots.map(s => s.month)])].sort().reverse()
  const isCurrentMonth  = selectedMonth === currentMonth
  const displayData     = isCurrentMonth ? metrics : (snapshots.find(s => s.month === selectedMonth) ?? null)

  return (
    <div className="space-y-4">

      <AccountHeader metrics={metrics} integration={integration} onDisconnect={handleDisconnect} disconnecting={disconnecting} />

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 text-sm text-red-700 dark:text-red-300">{error}</div>
      )}

      {availableMonths.length > 0 && (
        <MonthNav selectedMonth={selectedMonth} availableMonths={availableMonths} onChange={setSelectedMonth} />
      )}

      {displayData && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <KpiCard icon="👥" label="Seguidores"
            value={fmtK(displayData.followersCount)}
            sub={displayData.videoCount != null ? `${fmtNum(displayData.videoCount)} videos` : undefined}
          />
          <KpiCard icon="⚡" label="Engagement"
            value={displayData.engagementRate != null ? `${displayData.engagementRate}%` : '—'}
            valueClass={engColor(displayData.engagementRate)}
            sub={engLabel(displayData.engagementRate)}
          />
          <KpiCard icon="▶" label="Avg. Views"
            value={displayData.avgViews != null ? fmtK(displayData.avgViews) : '—'}
            sub="promedio del mes"
          />
          <KpiCard icon="❤️" label="Avg. Likes"
            value={displayData.avgLikes != null ? fmtNum(displayData.avgLikes) : '—'}
            sub="promedio del mes"
          />
          <KpiCard icon="📅" label="Videos del mes"
            value={(displayData.postsThisMonth ?? displayData.postsCount) != null
              ? fmtNum(displayData.postsThisMonth ?? displayData.postsCount)
              : '—'}
            sub={isCurrentMonth ? 'videos este mes' : 'videos ese mes'}
          />
        </div>
      )}

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
                  <button key={f.key} onClick={() => { setFollowerFilter(f.key); fetchFollowerLogs(f.key) }}
                    className={`px-2.5 py-1 text-xs rounded-lg transition-colors ${followerFilter === f.key ? 'text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'}`}
                    style={followerFilter === f.key ? { backgroundColor: TEAL } : {}}
                  >{f.label}</button>
                ))}
              </div>
            </div>
          </div>
          {followerLoading
            ? <div className="flex justify-center py-10"><div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: `${TEAL} transparent ${TEAL} ${TEAL}` }} /></div>
            : followerLogs.length >= 2
              ? <LineChart data={followerLogs} valueAccessor={d => d.followersCount} labelAccessor={d => d.date?.slice(5)} color={TEAL} formatY={v => fmtK(Math.round(v))} chartHeight={160} displayHeight={180} bare />
              : <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">Recopilando información, pronto vas a poder ver la evolución de seguidores.</p>
          }
        </div>
      )}

      {/* Engagement histórico mensual */}
      {snapshots.filter(d => d.engagementRate != null).length >= 2 && (
        <LineChart
          data={snapshots.filter(d => d.engagementRate != null)}
          valueAccessor={d => d.engagementRate}
          labelAccessor={d => d.month?.slice(5)}
          label="Engagement rate mensual (%)"
          color={TEAL}
          formatY={v => `${v.toFixed(1)}%`}
          chartHeight={160} displayHeight={180}
        />
      )}
    </div>
  )
}
