import { useState, useEffect, useRef, useCallback } from 'react'
import api from '../../api/client'

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtNum(n) {
  if (n == null) return '—'
  return n.toLocaleString('es-AR')
}

function engagementColor(rate) {
  if (rate == null) return 'text-gray-400'
  if (rate >= 3)   return 'text-green-600 dark:text-green-400'
  if (rate >= 1)   return 'text-yellow-600 dark:text-yellow-400'
  return 'text-red-600 dark:text-red-400'
}

// ── KPI Card ──────────────────────────────────────────────────────────────────

function KpiCard({ icon, label, value, sub, valueClass = '' }) {
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5 flex flex-col gap-1">
      <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-sm">
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

function LineChart({ data, accessor, label, color = '#f97316', formatY = v => v }) {
  if (!data || data.length < 2) return null

  const values = data.map(accessor)
  const minV   = Math.min(...values)
  const maxV   = Math.max(...values)
  const range  = maxV - minV || 1

  const W = 500
  const H = 80
  const PAD = { top: 10, right: 10, bottom: 24, left: 50 }
  const inner = { w: W - PAD.left - PAD.right, h: H - PAD.top - PAD.bottom }

  const xScale = i => PAD.left + (i / (data.length - 1)) * inner.w
  const yScale = v  => PAD.top + inner.h - ((v - minV) / range) * inner.h

  const pathD = data
    .map((d, i) => `${i === 0 ? 'M' : 'L'} ${xScale(i).toFixed(1)} ${yScale(accessor(d)).toFixed(1)}`)
    .join(' ')

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5">
      <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">{label}</p>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 90 }}>
        {/* Grid lines */}
        {[0, 0.5, 1].map(t => {
          const y = PAD.top + inner.h * (1 - t)
          return (
            <g key={t}>
              <line x1={PAD.left} y1={y} x2={PAD.left + inner.w} y2={y}
                    stroke="#e2e8f0" strokeWidth={1} />
              <text x={PAD.left - 6} y={y + 4} textAnchor="end"
                    fontSize={9} fill="#94a3b8">
                {formatY(minV + t * range)}
              </text>
            </g>
          )
        })}

        {/* Line */}
        <path d={pathD} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />

        {/* Points + labels */}
        {data.map((d, i) => (
          <g key={i}>
            <circle cx={xScale(i)} cy={yScale(accessor(d))} r={3}
                    fill={color} />
            <text x={xScale(i)} y={H - 4} textAnchor="middle"
                  fontSize={8} fill="#94a3b8">
              {d.month?.slice(5)}
            </text>
          </g>
        ))}
      </svg>
    </div>
  )
}

// ── Estado vacío (sin integración) ────────────────────────────────────────────

function ConnectPrompt({ projectId, onConnected }) {
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)
  const pollRef = useRef(null)

  const handleConnect = async () => {
    if (!projectId) {
      setError('Seleccioná un proyecto primero.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const { data } = await api.get('/marketing/integrations/meta/auth-url', {
        params: { projectId },
      })

      // Limpiar resultado anterior
      localStorage.removeItem('__ga_oauth_result')

      const popup = window.open(data.url, 'meta_oauth', 'width=520,height=660,left=200,top=100')

      // Polling cada 600ms — OAuthResult.jsx escribe en __ga_oauth_result
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

        if (popup?.closed) {
          clearInterval(pollRef.current)
          setLoading(false)
        }
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
        Necesitás una cuenta de Instagram Business o Creator vinculada a una página de Facebook.
      </p>
      {error && (
        <p className="text-sm text-red-600 dark:text-red-400 mb-4 max-w-sm">{error}</p>
      )}
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
  const [integration, setIntegration] = useState(null)   // null = no conectado, 'loading', object
  const [metrics,     setMetrics]     = useState(null)
  const [snapshots,   setSnapshots]   = useState([])
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState(null)
  const [savingSnap,  setSavingSnap]  = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)

  const fetchData = useCallback(async () => {
    if (!projectId) return
    setLoading(true)
    setError(null)
    try {
      // 1. Verificar integración
      const intgsRes = await api.get(`/marketing/projects/${projectId}/integrations`)
      const ig = intgsRes.data.find(i => i.type === 'instagram')
      setIntegration(ig ?? null)

      if (!ig) { setLoading(false); return }

      // 2. Métricas en tiempo real + snapshots (paralelo)
      const [metricsRes, snapshotsRes] = await Promise.allSettled([
        api.get(`/marketing/projects/${projectId}/instagram`),
        api.get(`/marketing/projects/${projectId}/instagram/snapshots`),
      ])

      if (metricsRes.status === 'fulfilled')   setMetrics(metricsRes.value.data)
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

  async function handleSaveSnapshot() {
    setSavingSnap(true)
    try {
      await api.post(`/marketing/projects/${projectId}/instagram/snapshots`)
      const res = await api.get(`/marketing/projects/${projectId}/instagram/snapshots`)
      setSnapshots(res.data.snapshots ?? [])
    } catch (err) {
      alert(err.response?.data?.error || 'No se pudo guardar el snapshot.')
    } finally {
      setSavingSnap(false)
    }
  }

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
    <div className="space-y-5">

      {/* Header cuenta */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center text-white text-lg">
              📸
            </div>
            <div>
              <p className="font-semibold text-gray-900 dark:text-white text-sm">
                {m?.username ? `@${m.username}` : (m?.name ?? 'Instagram')}
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500">
                Conectado el {new Date(integration.connectedAt).toLocaleDateString('es-AR')}
              </p>
            </div>
          </div>
          <button
            onClick={handleDisconnect}
            disabled={disconnecting}
            className="text-xs text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors disabled:opacity-50"
          >
            {disconnecting ? 'Desconectando…' : 'Desconectar'}
          </button>
        </div>
      </div>

      {/* Error de métricas */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {/* KPI cards */}
      {m && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KpiCard
            icon="👥"
            label="Seguidores"
            value={fmtNum(m.followersCount)}
            sub={`${fmtNum(m.mediaCount)} publicaciones totales`}
          />
          <KpiCard
            icon="❤️"
            label="Engagement"
            value={m.engagementRate != null ? `${m.engagementRate}%` : '—'}
            valueClass={engagementColor(m.engagementRate)}
            sub={m.engagementRate >= 3 ? 'Excelente' : m.engagementRate >= 1 ? 'Promedio' : 'Bajo'}
          />
          <KpiCard
            icon="👍"
            label="Avg. Likes"
            value={m.avgLikes != null ? fmtNum(m.avgLikes) : '—'}
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

      {/* Gráficos históricos */}
      {snapshots.length >= 2 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              📈 Evolución histórica
            </h3>
            <button
              onClick={handleSaveSnapshot}
              disabled={savingSnap}
              className="text-xs px-3 py-1.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 transition-colors"
            >
              {savingSnap ? 'Guardando…' : '+ Snapshot'}
            </button>
          </div>

          <LineChart
            data={snapshots}
            accessor={d => d.followersCount}
            label="Seguidores por mes"
            color="#a855f7"
            formatY={v => Math.round(v).toLocaleString('es-AR')}
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

      {/* Sin historial — invitar a guardar snapshot */}
      {snapshots.length < 2 && integration && (
        <div className="bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-xl p-5 text-center">
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
            Guardá snapshots mensuales para ver la evolución de tus métricas con el tiempo.
            El sistema guarda uno automáticamente el 1° de cada mes.
          </p>
          <button
            onClick={handleSaveSnapshot}
            disabled={savingSnap || !m}
            className="px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-xl hover:bg-primary-700 disabled:opacity-50 transition-colors"
          >
            {savingSnap ? 'Guardando…' : 'Guardar snapshot ahora'}
          </button>
        </div>
      )}
    </div>
  )
}
