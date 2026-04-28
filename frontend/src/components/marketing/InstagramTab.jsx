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

// ── KPI Card ──────────────────────────────────────────────────────────────────

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

// ── SVG Line Chart ────────────────────────────────────────────────────────────

function LineChart({ data, accessor, label, color = '#a855f7', formatY = v => v }) {
  if (!data || data.length < 2) return null

  const values = data.map(accessor)
  const minV   = Math.min(...values)
  const maxV   = Math.max(...values)
  const range  = maxV - minV || 1

  const W   = 500
  const H   = 80
  const PAD = { top: 10, right: 10, bottom: 24, left: 54 }
  const inner = { w: W - PAD.left - PAD.right, h: H - PAD.top - PAD.bottom }

  const xScale = i => PAD.left + (i / (data.length - 1)) * inner.w
  const yScale = v => PAD.top + inner.h - ((v - minV) / range) * inner.h

  const pathD = data
    .map((d, i) => `${i === 0 ? 'M' : 'L'} ${xScale(i).toFixed(1)} ${yScale(accessor(d)).toFixed(1)}`)
    .join(' ')

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5">
      <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">{label}</p>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 90 }}>
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
            <circle cx={xScale(i)} cy={yScale(accessor(d))} r={3} fill={color} />
            <text x={xScale(i)} y={H - 4} textAnchor="middle" fontSize={8} fill="#94a3b8">
              {d.month?.slice(5)}
            </text>
          </g>
        ))}
      </svg>
    </div>
  )
}

// ── Grilla de publicaciones recientes ─────────────────────────────────────────

function PostsGrid({ posts }) {
  if (!posts || posts.length === 0) return null
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5">
      <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Últimas publicaciones</p>
      <div className="grid grid-cols-3 gap-1.5">
        {posts.map(post => (
          <a
            key={post.id}
            href={post.permalink ?? '#'}
            target="_blank"
            rel="noopener noreferrer"
            className="relative aspect-square overflow-hidden rounded-lg group bg-gray-100 dark:bg-gray-700 block"
          >
            {post.imgSrc ? (
              <img
                src={post.imgSrc}
                alt=""
                className="w-full h-full object-cover"
                loading="lazy"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-purple-400 to-pink-400" />
            )}

            {/* Overlay con stats al hover */}
            <div className="absolute inset-0 bg-black/55 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3 text-white text-xs font-semibold">
              {post.likeCount     != null && <span>❤️ {fmtK(post.likeCount)}</span>}
              {post.commentsCount != null && <span>💬 {fmtK(post.commentsCount)}</span>}
            </div>

            {/* Indicador de tipo */}
            {post.mediaType === 'VIDEO' && (
              <div className="absolute top-1 right-1 bg-black/60 rounded px-1 text-white text-[10px]">▶</div>
            )}
            {post.mediaType === 'CAROUSEL_ALBUM' && (
              <div className="absolute top-1 right-1 bg-black/60 rounded px-1 text-white text-[10px]">❏</div>
            )}
          </a>
        ))}
      </div>
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

      {/* Rendimiento por tipo */}
      {hasType && (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5">
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
            Rendimiento por tipo
          </p>
          <div className="space-y-3">
            {byType.map(t => (
              <div key={t.type} className="flex items-center gap-3">
                <span className="text-xs text-gray-600 dark:text-gray-400 w-20 shrink-0">{t.label}</span>
                <div className="flex-1 bg-gray-100 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
                  <div
                    className="h-2 rounded-full bg-purple-500 transition-all"
                    style={{ width: `${(t.avgLikes / maxAvg) * 100}%` }}
                  />
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

      {/* Mejor horario */}
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
                {fmtNum(Math.round(bestHour.avgLikes))} likes promedio · basado en {bestHour.count} posts
              </p>
              <p className="text-xs text-gray-400 mt-0.5">Horario de Argentina (ART)</p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-400 dark:text-gray-500">
            Necesitás al menos 2 publicaciones por franja horaria para este análisis.
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

        {/* Avatar */}
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

        {/* Info */}
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

          {/* Seguidores / Siguiendo */}
          <div className="flex items-center gap-4 mt-1.5 text-sm">
            <span>
              <strong className="text-gray-900 dark:text-white">{fmtK(metrics?.followersCount)}</strong>
              <span className="text-gray-500 dark:text-gray-400 ml-1">seguidores</span>
            </span>
          </div>

          {/* Bio */}
          {metrics?.biography && (
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1.5 line-clamp-2 whitespace-pre-line">
              {metrics.biography}
            </p>
          )}

          {/* Website */}
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
            if (result.success && result.integrationType === 'instagram') {
              onConnected()
            } else {
              setError(result.error || 'Error al conectar Instagram.')
            }
            return
          }
        } catch { /* ignorar */ }

        if (popup?.closed) { clearInterval(pollRef.current); setLoading(false) }
        if (elapsed >= 5 * 60 * 1000) {
          clearInterval(pollRef.current)
          setLoading(false)
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
      <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-pink-500 rounded-2xl flex items-center justify-center text-3xl mb-4">
        📸
      </div>
      <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">
        Conectá tu cuenta de Instagram
      </h3>
      <p className="text-sm text-gray-400 dark:text-gray-500 max-w-xs mb-6">
        Necesitás una cuenta de Instagram Business o Creator.
      </p>
      {error && <p className="text-sm text-red-600 dark:text-red-400 mb-4 max-w-sm">{error}</p>}
      <button
        onClick={handleConnect}
        disabled={loading || !projectId}
        className="px-5 py-2.5 bg-gradient-to-r from-purple-600 to-pink-600 text-white text-sm font-semibold rounded-xl hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
      >
        {loading ? 'Conectando…' : 'Conectar Instagram'}
      </button>
      {!projectId && (
        <p className="text-xs text-gray-400 mt-2">Seleccioná un proyecto para continuar.</p>
      )}
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function InstagramTab({ projectId }) {
  const [integration,   setIntegration]   = useState(null)
  const [metrics,       setMetrics]       = useState(null)
  const [snapshots,     setSnapshots]     = useState([])
  const [loading,       setLoading]       = useState(false)
  const [error,         setError]         = useState(null)
  const [disconnecting, setDisconnecting] = useState(false)

  const fetchData = useCallback(async () => {
    if (!projectId) return
    setLoading(true)
    setError(null)
    try {
      const intgsRes = await api.get(`/marketing/projects/${projectId}/integrations`)
      const ig = intgsRes.data.find(i => i.type === 'instagram')
      setIntegration(ig ?? null)

      if (!ig) { setLoading(false); return }

      const [metricsRes, snapshotsRes] = await Promise.allSettled([
        api.get(`/marketing/projects/${projectId}/instagram`),
        api.get(`/marketing/projects/${projectId}/instagram/snapshots`),
      ])

      if (metricsRes.status   === 'fulfilled') setMetrics(metricsRes.value.data)
      if (snapshotsRes.status === 'fulfilled') setSnapshots(snapshotsRes.value.data.snapshots ?? [])

      if (metricsRes.status === 'rejected') {
        setError(metricsRes.reason?.response?.data?.error || 'No se pudieron cargar las métricas.')
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Error al cargar datos de Instagram.')
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => { fetchData() }, [fetchData])

  async function handleDisconnect() {
    if (!window.confirm('¿Desconectar la cuenta de Instagram de este proyecto?')) return
    setDisconnecting(true)
    try {
      await api.delete(`/marketing/projects/${projectId}/integrations/instagram`)
      setIntegration(null)
      setMetrics(null)
      setSnapshots([])
    } catch (err) {
      alert(err.response?.data?.error || 'No se pudo desconectar.')
    } finally {
      setDisconnecting(false)
    }
  }

  // ── Renders ──

  if (!projectId) {
    return (
      <div className="text-center py-20 text-sm text-gray-400 dark:text-gray-500">
        Seleccioná un proyecto para ver las métricas de Instagram.
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!integration) {
    return <ConnectPrompt projectId={projectId} onConnected={fetchData} />
  }

  const m = metrics

  return (
    <div className="space-y-4">

      {/* Header con perfil */}
      <AccountHeader
        metrics={m}
        integration={integration}
        onDisconnect={handleDisconnect}
        disconnecting={disconnecting}
      />

      {/* Error de métricas */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {/* KPI cards */}
      {m && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <KpiCard
            icon="👥"
            label="Seguidores"
            value={fmtK(m.followersCount)}
            sub={`${fmtNum(m.mediaCount)} publicaciones`}
          />
          <KpiCard
            icon="❤️"
            label="Engagement"
            value={m.engagementRate != null ? `${m.engagementRate}%` : '—'}
            valueClass={engagementColor(m.engagementRate)}
            sub={engagementLabel(m.engagementRate)}
          />
          <KpiCard
            icon="👍"
            label="Avg. Likes"
            value={m.avgLikes != null ? fmtNum(m.avgLikes) : '—'}
            sub="últimas 30 publicaciones"
          />
          <KpiCard
            icon="💬"
            label="Avg. Comentarios"
            value={m.avgComments != null ? fmtNum(m.avgComments) : '—'}
            sub="últimas 30 publicaciones"
          />
          <KpiCard
            icon="📅"
            label="Posts / semana"
            value={m.postsPerWeek != null ? m.postsPerWeek : '—'}
            sub="últimas 4 semanas"
          />
        </div>
      )}

      {/* Insights de contenido: breakdown por tipo + mejor horario */}
      {m && <ContentInsights byType={m.byType} bestHour={m.bestHour} />}

      {/* Grilla de últimas publicaciones */}
      {m?.recentMedia && <PostsGrid posts={m.recentMedia} />}

      {/* Evolución histórica */}
      {snapshots.length >= 2 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            📈 Evolución histórica
          </h3>
          <LineChart
            data={snapshots}
            accessor={d => d.followersCount}
            label="Seguidores por mes"
            color="#a855f7"
            formatY={v => fmtK(Math.round(v))}
          />
          <LineChart
            data={snapshots.filter(d => d.engagementRate != null)}
            accessor={d => d.engagementRate}
            label="Engagement rate (%)"
            color="#ec4899"
            formatY={v => `${v.toFixed(1)}%`}
          />
        </div>
      )}

      {/* Sin historial aún — mensaje informativo (sin botón manual) */}
      {snapshots.length < 2 && integration && m && (
        <div className="bg-gray-50 dark:bg-gray-800/50 border border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-5 text-center">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Los gráficos de evolución aparecerán cuando haya al menos 2 meses de datos.
            Los snapshots se guardan automáticamente cada vez que visitás esta sección.
          </p>
        </div>
      )}
    </div>
  )
}
