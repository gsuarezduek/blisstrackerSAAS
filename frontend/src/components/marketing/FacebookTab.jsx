import { useState, useEffect, useRef, useCallback } from 'react'
import api from '../../api/client'
import SocialIcon from './SocialIcon'

const FB_BLUE = '#1877F2'

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtNum(n) { if (n == null) return '—'; return n.toLocaleString('es-AR') }
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
  const d = new Date(dateStr); d.setDate(d.getDate() - days)
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

// ── SVG Line Chart ────────────────────────────────────────────────────────────
function LineChart({ data, valueAccessor, labelAccessor, color = FB_BLUE, formatY = v => v, chartHeight = 90, displayHeight = 100, bare = false }) {
  if (!data || data.length < 2) return null
  const values = data.map(valueAccessor)
  const minV = Math.min(...values); const maxV = Math.max(...values); const range = maxV - minV || 1
  const W = 500, H = chartHeight
  const PAD = { top: 10, right: 10, bottom: 26, left: 54 }
  const inner = { w: W - PAD.left - PAD.right, h: H - PAD.top - PAD.bottom }
  const xScale = i => PAD.left + (i / (data.length - 1)) * inner.w
  const yScale = v => PAD.top + inner.h - ((v - minV) / range) * inner.h
  const step = Math.max(1, Math.floor(data.length / 10))
  const pathD = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${xScale(i).toFixed(1)} ${yScale(valueAccessor(d)).toFixed(1)}`).join(' ')
  const chart = (
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
  )
  if (bare) return chart
  return <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5">{chart}</div>
}

// ── Navegación por mes ────────────────────────────────────────────────────────
function MonthNav({ selectedMonth, availableMonths, onChange, canDelete, onDelete, deleting }) {
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
        {canDelete && (
          <button onClick={onDelete} disabled={deleting} title="Borrar el snapshot de este mes"
            className="text-gray-400 hover:text-red-500 dark:hover:text-red-400 disabled:opacity-40 transition-colors text-sm leading-none">
            {deleting ? '…' : '🗑'}
          </button>
        )}
      </div>
      <button onClick={() => canNext && onChange(availableMonths[idx - 1])} disabled={!canNext}
        className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-lg">›</button>
    </div>
  )
}

function KpiCard({ icon, label, value, sub, valueClass = '' }) {
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 flex flex-col gap-1">
      <div className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400 text-xs"><span>{icon}</span><span>{label}</span></div>
      <div className={`text-2xl font-bold text-gray-900 dark:text-white ${valueClass}`}>{value}</div>
      {sub && <div className="text-xs text-gray-400 dark:text-gray-500">{sub}</div>}
    </div>
  )
}

function FollowersCard({ followersCount, monthlyGain }) {
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 flex flex-col gap-1">
      <div className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400 text-xs"><span>👥</span><span>Seguidores</span></div>
      <div className="text-2xl font-bold text-gray-900 dark:text-white">{fmtK(followersCount)}</div>
      {monthlyGain != null && (
        <div className={`text-xs font-semibold ${monthlyGain > 0 ? 'text-green-600 dark:text-green-400' : monthlyGain < 0 ? 'text-red-500 dark:text-red-400' : 'text-gray-400 dark:text-gray-500'}`}>
          {monthlyGain > 0 ? '+' : ''}{fmtNum(monthlyGain)} este mes
        </div>
      )}
    </div>
  )
}

// ── Header de cuenta ──────────────────────────────────────────────────────────
function AccountHeader({ page, integration, scraped, onDisconnect, disconnecting, onRefresh, refreshing }) {
  const slug = integration?.propertyId
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5">
      <div className="flex items-start gap-4">
        <div className="shrink-0">
          <div className="w-14 h-14 rounded-lg flex items-center justify-center text-white" style={{ background: FB_BLUE }}><SocialIcon network="facebook" className="w-7 h-7" /></div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <p className="font-semibold text-gray-900 dark:text-white">{page?.name ?? slug ?? 'Facebook'}</p>
                {scraped && <span className="text-[10px] bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full font-medium">vía scraping</span>}
              </div>
              {slug && (
                <a href={`https://www.facebook.com/${slug}`} target="_blank" rel="noopener noreferrer"
                  className="text-xs text-blue-600 dark:text-blue-400 hover:underline">
                  facebook.com/{slug}
                </a>
              )}
            </div>
            <div className="flex gap-3 shrink-0">
              {scraped && (
                <button onClick={onRefresh} disabled={refreshing}
                  className="text-xs text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors disabled:opacity-50">
                  {refreshing ? 'Actualizando…' : '↻ Actualizar'}
                </button>
              )}
              <button onClick={onDisconnect} disabled={disconnecting}
                className="text-xs text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors disabled:opacity-50">
                {disconnecting ? 'Desconectando…' : 'Desconectar'}
              </button>
            </div>
          </div>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1.5">
            Conectado el {new Date(integration.connectedAt).toLocaleDateString('es-AR')}
          </p>
        </div>
      </div>
    </div>
  )
}

// ── Top posts del mes ─────────────────────────────────────────────────────────
function TopPosts({ posts }) {
  if (!posts?.length) return null
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5">
      <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">🏆 TOP posts del mes</p>
      <div className="space-y-2">
        {posts.slice(0, 5).map((p, i) => (
          <a key={p.id ?? i} href={p.permalink ?? p.url ?? '#'} target="_blank" rel="noopener noreferrer"
            className="block p-3 bg-gray-50 dark:bg-gray-700/40 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors">
            <div className="flex items-start gap-3">
              <span className="text-lg shrink-0">{['🥇','🥈','🥉','4️⃣','5️⃣'][i] ?? '•'}</span>
              <div className="flex-1 min-w-0">
                {p.text && <p className="text-xs text-gray-700 dark:text-gray-300 line-clamp-2 mb-1.5">{p.text}</p>}
                <div className="flex gap-3 text-[11px] text-gray-500 dark:text-gray-400">
                  {p.reach    != null && <span>👁 {fmtK(p.reach)}</span>}
                  {p.likes    != null && <span>👍 {fmtK(p.likes)}</span>}
                  {p.comments != null && <span>💬 {fmtK(p.comments)}</span>}
                  {p.shares   != null && <span>↗ {fmtK(p.shares)}</span>}
                </div>
              </div>
            </div>
          </a>
        ))}
      </div>
    </div>
  )
}

// ── Formularios de conexión ─────────────────────────────────────────────────────
const FOLLOWER_FILTERS = [
  { key: '7d',   label: '7 días',  days: 7   },
  { key: '30d',  label: '30 días', days: 30  },
  { key: '90d',  label: '3 meses', days: 90  },
  { key: '180d', label: '6 meses', days: 180 },
  { key: 'all',  label: 'Todo',    days: null },
]

// Conexión por scraping (Apify) — sin permisos ni OAuth.
function ScrapeConnectForm({ projectId, onConnected }) {
  const [value,   setValue]   = useState('')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!value.trim() || !projectId) return
    setLoading(true); setError(null)
    try {
      await api.post(`/marketing/projects/${projectId}/integrations/facebook/connect-scrape`, { url: value.trim() })
      onConnected()
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo conectar por scraping.')
    } finally { setLoading(false) }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-3 space-y-2">
      <input
        value={value} onChange={e => setValue(e.target.value)}
        placeholder="facebook.com/tu-pagina"
        className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-400"
      />
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      <button type="submit" disabled={loading || !value.trim() || !projectId}
        className="w-full px-4 py-2 text-white text-sm font-semibold rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
        style={{ background: FB_BLUE }}>
        {loading ? 'Conectando…' : 'Conectar por scraping'}
      </button>
      <p className="text-[11px] text-gray-400 dark:text-gray-500">Solo páginas públicas. Pegá la URL de la página o su nombre.</p>
    </form>
  )
}

// Conexión por System User Token de Business Manager (con picker si hay varias páginas).
function TokenConnectForm({ projectId, onConnected }) {
  const [token,    setToken]    = useState('')
  const [accounts, setAccounts] = useState(null) // [{id,name}] cuando hay varias páginas
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState(null)

  async function connect(pageId) {
    if (!token.trim() || !projectId) return
    setLoading(true); setError(null)
    try {
      const body = { accessToken: token.trim() }
      if (pageId) body.pageId = pageId
      const { data } = await api.post(`/marketing/projects/${projectId}/integrations/facebook/connect-token`, body)
      if (data.accounts) { setAccounts(data.accounts); return } // hay que elegir página
      onConnected()
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo conectar con el token.')
    } finally { setLoading(false) }
  }

  if (accounts) return (
    <div className="mt-3 space-y-2">
      <p className="text-xs text-gray-500 dark:text-gray-400">Elegí la página a conectar:</p>
      {accounts.map(a => (
        <button key={a.id} onClick={() => connect(a.id)} disabled={loading}
          className="w-full text-left px-3 py-2 text-sm rounded-lg bg-gray-50 dark:bg-gray-700/50 hover:bg-blue-50 dark:hover:bg-blue-900/20 border border-gray-200 dark:border-gray-700 transition-colors disabled:opacity-50">
          {a.name ?? a.id}
        </button>
      ))}
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  )

  return (
    <form onSubmit={e => { e.preventDefault(); connect() }} className="mt-3 space-y-2">
      <input
        value={token} onChange={e => setToken(e.target.value)}
        placeholder="System User Token"
        className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-400"
      />
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      <button type="submit" disabled={loading || !token.trim() || !projectId}
        className="w-full px-4 py-2 text-white text-sm font-semibold rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
        style={{ background: FB_BLUE }}>
        {loading ? 'Conectando…' : 'Conectar con token'}
      </button>
      <p className="text-[11px] text-gray-400 dark:text-gray-500">Generá el token en Business Manager → Usuarios del sistema, con la página asignada.</p>
    </form>
  )
}

function ConnectPrompt({ projectId, onConnected, inline = false }) {
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)
  const pollRef = useRef(null)

  const handleConnect = async () => {
    if (!projectId) { setError('Seleccioná un proyecto primero.'); return }
    setLoading(true); setError(null)
    try {
      const { data } = await api.get('/marketing/integrations/facebook/auth-url', { params: { projectId } })
      localStorage.removeItem('__ga_oauth_result')
      const popup = window.open(data.url, 'facebook_oauth', 'width=600,height=720,left=200,top=100')
      let elapsed = 0
      pollRef.current = setInterval(() => {
        elapsed += 600
        try {
          const raw = localStorage.getItem('__ga_oauth_result')
          if (raw) {
            const result = JSON.parse(raw)
            localStorage.removeItem('__ga_oauth_result')
            clearInterval(pollRef.current); setLoading(false)
            if (result.success && result.integrationType === 'facebook') onConnected()
            else setError(result.error || 'Error al conectar Facebook.')
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

  if (inline) return (
    <>
      {error && <p className="text-sm text-red-600 dark:text-red-400 mb-2 max-w-sm">{error}</p>}
      <button onClick={handleConnect} disabled={loading || !projectId}
        className="px-5 py-2.5 text-white text-sm font-semibold rounded-xl hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
        style={{ background: FB_BLUE }}>
        {loading ? 'Reconectando…' : 'Reconectar Facebook'}
      </button>
    </>
  )

  return (
    <div className="max-w-3xl mx-auto py-12">
      <div className="text-center mb-8">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4 text-white mx-auto" style={{ background: FB_BLUE }}><SocialIcon network="facebook" className="w-8 h-8" /></div>
        <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-1">Conectá tu página de Facebook</h3>
        <p className="text-sm text-gray-400 dark:text-gray-500">Elegí cómo querés traer las métricas.</p>
      </div>

      <div className="grid sm:grid-cols-3 gap-4">
        {/* Token de Business Manager — recomendado */}
        <div className="border-2 border-blue-200 dark:border-blue-800 rounded-2xl p-5 bg-blue-50/40 dark:bg-blue-900/10">
          <div className="flex items-center gap-2 mb-1">
            <p className="font-semibold text-gray-900 dark:text-white text-sm">🔑 Token (Business Manager)</p>
            <span className="text-[10px] bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full font-medium">Recomendado</span>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
            Métricas completas (alcance, impresiones) con un System User Token. No espera aprobación de Meta.
          </p>
          <TokenConnectForm projectId={projectId} onConnected={onConnected} />
        </div>

        {/* Scraping */}
        <div className="border border-gray-200 dark:border-gray-700 rounded-2xl p-5">
          <p className="font-semibold text-gray-900 dark:text-white text-sm mb-1">🔎 Scraping</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
            Seguidores, posts y engagement de datos públicos. No requiere permisos ni aprobación.
            <span className="block mt-1 text-gray-400 dark:text-gray-500">No incluye alcance ni impresiones.</span>
          </p>
          <ScrapeConnectForm projectId={projectId} onConnected={onConnected} />
        </div>

        {/* Oficial (Facebook Login) — próximamente */}
        <div className="border border-gray-200 dark:border-gray-700 rounded-2xl p-5 opacity-75">
          <div className="flex items-center gap-2 mb-1">
            <p className="font-semibold text-gray-900 dark:text-white text-sm">🔗 Oficial (API)</p>
            <span className="text-[10px] bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300 px-2 py-0.5 rounded-full font-medium">Próximamente</span>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
            Login con Facebook. Métricas completas; requiere los permisos de páginas aprobados por Meta (en revisión).
          </p>
          <button disabled
            className="mt-3 w-full px-4 py-2 text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 text-sm font-semibold rounded-lg cursor-not-allowed">
            Próximamente
          </button>
        </div>
      </div>

      {!projectId && <p className="text-xs text-gray-400 mt-4 text-center">Seleccioná un proyecto para continuar.</p>}
    </div>
  )
}

// ── Panel cross-proyecto ──────────────────────────────────────────────────────
function CrossProjectFacebookPanel({ onSelectProject }) {
  const [data,     setData]     = useState(null)
  const [loading,  setLoading]  = useState(true)
  const [deleting, setDeleting] = useState(null)

  useEffect(() => {
    api.get('/marketing/summary/facebook')
      .then(r => setData(r.data))
      .catch(() => setData([]))
      .finally(() => setLoading(false))
  }, [])

  async function handleDelete(p) {
    if (!window.confirm(`¿Borrar el último snapshot de Facebook de "${p.projectName}" (${p.month})? También se eliminarán los registros diarios de seguidores de ese mes. No se puede deshacer.`)) return
    setDeleting(p.projectId)
    try {
      await api.delete(`/marketing/projects/${p.projectId}/facebook/snapshots/${p.month}`)
      const r = await api.get('/marketing/summary/facebook')
      setData(r.data)
    } catch (err) {
      alert(err.response?.data?.error || 'No se pudo borrar el snapshot.')
    } finally { setDeleting(null) }
  }

  if (loading) return (
    <div className="flex justify-center py-12"><div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: `${FB_BLUE} transparent ${FB_BLUE} ${FB_BLUE}` }} /></div>
  )
  if (!data?.length) return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-10 text-center">
      <div className="flex justify-center mb-3"><SocialIcon network="facebook" className="w-10 h-10 text-gray-300 dark:text-gray-600" /></div>
      <p className="text-sm text-gray-500 dark:text-gray-400">Todavía no hay snapshots de Facebook. Seleccioná un proyecto para empezar.</p>
    </div>
  )

  const maxFollowers = Math.max(...data.map(p => p.followersCount), 1)

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">
        Facebook por proyecto ({data.length}) <span className="font-normal text-gray-400">· último snapshot disponible</span>
      </h3>
      <div className="space-y-3">
        {data.map(p => (
          <div key={p.projectId} className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <button onClick={() => onSelectProject?.(String(p.projectId))}
                  className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate hover:text-primary-600 dark:hover:text-primary-400 transition-colors text-left">
                  {p.projectName}
                </button>
                <div className="flex items-center gap-3 flex-shrink-0 ml-2">
                  <span className="text-xs text-gray-400">{p.month}</span>
                  <span className="text-sm font-bold text-gray-900 dark:text-white tabular-nums">{fmtK(p.followersCount)}</span>
                  <button onClick={() => handleDelete(p)} disabled={deleting === p.projectId}
                    title="Borrar este snapshot"
                    className="text-gray-300 dark:text-gray-600 hover:text-red-500 dark:hover:text-red-400 disabled:opacity-40 transition-colors text-sm leading-none">
                    {deleting === p.projectId ? '…' : '🗑'}
                  </button>
                </div>
              </div>
              <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-1.5">
                <div className="h-1.5 rounded-full" style={{ width: `${Math.round((p.followersCount / maxFollowers) * 100)}%`, background: FB_BLUE }} />
              </div>
              <div className="flex gap-3 mt-1 text-xs text-gray-400">
                {p.reach         != null && <span>👁 {fmtK(p.reach)} alcance</span>}
                {p.engagementRate != null && <span>{p.engagementRate.toFixed(2)}% eng.</span>}
                {p.postsThisMonth != null && <span>{p.postsThisMonth} posts</span>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function FacebookTab({ projectId, onSelectProject }) {
  const currentMonth = todayAR().slice(0, 7)

  const [integration,         setIntegration]     = useState(null)
  const [metrics,             setMetrics]         = useState(null)
  const [snapshots,           setSnapshots]       = useState([])
  const [selectedMonth,       setSelectedMonth]   = useState(currentMonth)
  const [followerLogs,        setFollowerLogs]    = useState([])
  const [monthStartFollowers, setMonthStartFollowers] = useState(null)
  const [followerFilter,      setFollowerFilter]  = useState('30d')
  const [followerLoading,     setFollowerLoading] = useState(false)
  const [loading,             setLoading]         = useState(false)
  const [error,               setError]           = useState(null)
  const [disconnecting,       setDisconnecting]   = useState(false)
  const [refreshing,          setRefreshing]      = useState(false)
  const [deletingSnapshot,    setDeletingSnapshot] = useState(false)
  const [debugData,           setDebugData]       = useState(null)
  const [debugLoading,        setDebugLoading]    = useState(false)
  const [debugError,          setDebugError]      = useState(null)

  const fetchData = useCallback(async () => {
    if (!projectId) return
    setLoading(true); setError(null)
    try {
      const intgsRes = await api.get(`/marketing/projects/${projectId}/integrations`)
      const fb = intgsRes.data.find(i => i.type === 'facebook')
      setIntegration(fb ?? null)
      if (!fb) { setLoading(false); return }

      const today = todayAR()
      const f = FOLLOWER_FILTERS.find(x => x.key === followerFilter)
      const from = f.days ? subtractDays(today, f.days - 1) : undefined
      const logParams = { to: today }
      if (from) logParams.from = from

      const [metricsRes, snapshotsRes, logsRes] = await Promise.allSettled([
        api.get(`/marketing/projects/${projectId}/facebook`),
        api.get(`/marketing/projects/${projectId}/facebook/snapshots`),
        api.get(`/marketing/projects/${projectId}/facebook/followers`, { params: logParams }),
      ])

      if (metricsRes.status   === 'fulfilled') setMetrics(metricsRes.value.data)
      if (snapshotsRes.status === 'fulfilled') setSnapshots(snapshotsRes.value.data.snapshots ?? [])
      if (logsRes.status      === 'fulfilled') {
        const logs = logsRes.value.data.logs ?? []
        setFollowerLogs(logs)
        const monthStart = todayAR().slice(0, 7) + '-01'
        const firstInMonth = logs.find(l => l.date >= monthStart)
        setMonthStartFollowers(firstInMonth?.followersCount ?? null)
      }
      if (metricsRes.status === 'rejected') setError(metricsRes.reason?.response?.data?.error || 'No se pudieron cargar las métricas.')
    } catch (err) {
      setError(err.response?.data?.error || 'Error al cargar datos de Facebook.')
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
      const { data } = await api.get(`/marketing/projects/${projectId}/facebook/followers`, { params })
      setFollowerLogs(data.logs ?? [])
    } catch { /* silencioso */ }
    finally { setFollowerLoading(false) }
  }, [projectId])

  useEffect(() => { fetchData() }, [fetchData])

  async function handleDisconnect() {
    if (!window.confirm('¿Desconectar la página de Facebook de este proyecto?')) return
    setDisconnecting(true)
    try {
      await api.delete(`/marketing/projects/${projectId}/integrations/facebook`)
      setIntegration(null); setMetrics(null); setSnapshots([])
    } catch (err) {
      alert(err.response?.data?.error || 'No se pudo desconectar.')
    } finally { setDisconnecting(false) }
  }

  async function handleRefreshScrape() {
    setRefreshing(true); setError(null)
    try {
      await api.post(`/marketing/projects/${projectId}/facebook/scrape/refresh`)
      await fetchData()
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo actualizar el scraping.')
    } finally { setRefreshing(false) }
  }

  async function handleDeleteSnapshot() {
    if (!window.confirm(`¿Borrar el snapshot de ${monthLabel(selectedMonth)}? También se eliminarán los registros diarios de seguidores de ese mes. No se puede deshacer.`)) return
    setDeletingSnapshot(true)
    try {
      await api.delete(`/marketing/projects/${projectId}/facebook/snapshots/${selectedMonth}`)
      setSelectedMonth(currentMonth)
      await fetchData()
    } catch (err) {
      alert(err.response?.data?.error || 'No se pudo borrar el snapshot.')
    } finally { setDeletingSnapshot(false) }
  }

  async function handleScrapeDebug() {
    setDebugLoading(true); setDebugError(null); setDebugData(null)
    try {
      const { data } = await api.get(`/marketing/projects/${projectId}/facebook/scrape-debug`)
      setDebugData(data)
    } catch (err) {
      setDebugError(err.response?.data?.error || 'No se pudo correr el diagnóstico.')
    } finally { setDebugLoading(false) }
  }

  async function handleInsightsDebug() {
    setDebugLoading(true); setDebugError(null); setDebugData(null)
    try {
      const { data } = await api.get(`/marketing/projects/${projectId}/facebook/insights-debug`)
      setDebugData(data)
    } catch (err) {
      setDebugError(err.response?.data?.error || 'No se pudo correr el diagnóstico.')
    } finally { setDebugLoading(false) }
  }

  if (!projectId) return <CrossProjectFacebookPanel onSelectProject={onSelectProject} />

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: `${FB_BLUE} transparent ${FB_BLUE} ${FB_BLUE}` }} />
    </div>
  )

  if (!integration) return <ConnectPrompt projectId={projectId} onConnected={fetchData} />

  if (integration.status === 'expired') return (
    <div className="flex flex-col items-center justify-center py-20 text-center gap-4">
      <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-3xl text-white" style={{ background: FB_BLUE }}>🔒</div>
      <div>
        <p className="font-semibold text-gray-700 dark:text-gray-300 mb-1">Sesión de Facebook expirada</p>
        <p className="text-sm text-gray-400 dark:text-gray-500 max-w-xs">El token de acceso venció. Reconectá la página para seguir viendo métricas.</p>
      </div>
      <ConnectPrompt projectId={projectId} onConnected={fetchData} inline />
    </div>
  )

  const scraped         = integration?.scopes === 'scrape'
  const availableMonths = [...new Set([currentMonth, ...snapshots.map(s => s.month)])].sort().reverse()
  const isCurrentMonth  = selectedMonth === currentMonth
  const displayData     = isCurrentMonth ? metrics : (snapshots.find(s => s.month === selectedMonth) ?? null)
  const canDeleteSnapshot = snapshots.some(s => s.month === selectedMonth)

  const monthlyGain = (isCurrentMonth && displayData?.followersCount != null && monthStartFollowers != null)
    ? displayData.followersCount - monthStartFollowers
    : null

  return (
    <div className="space-y-4">

      <AccountHeader page={metrics?.page} integration={integration} scraped={scraped}
        onDisconnect={handleDisconnect} disconnecting={disconnecting}
        onRefresh={handleRefreshScrape} refreshing={refreshing} />

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 text-sm text-red-700 dark:text-red-300">{error}</div>
      )}

      {scraped && (
        <div className="bg-blue-50/60 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 rounded-xl px-4 py-3 text-xs text-blue-700 dark:text-blue-300">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <span>📊 Datos públicos vía scraping: seguidores, posts y engagement. Alcance e impresiones solo están disponibles con la conexión oficial o por token.</span>
            <button onClick={handleScrapeDebug} disabled={debugLoading}
              className="shrink-0 px-2.5 py-1 rounded-lg border border-blue-300 dark:border-blue-700 hover:bg-blue-100 dark:hover:bg-blue-900/30 disabled:opacity-50 transition-colors font-medium">
              {debugLoading ? 'Diagnosticando…' : '🔍 Diagnóstico'}
            </button>
          </div>

          {debugError && <p className="mt-2 text-red-600 dark:text-red-400">{debugError}</p>}

          {debugData && (
            <div className="mt-3 space-y-2">
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-blue-800 dark:text-blue-200 font-medium">
                <span>items: {debugData.itemCount}</span>
                <span>posts detectados: {debugData.normalized?.postsDetected}</span>
                <span>seguidores: {debugData.normalized?.followers ?? '—'}</span>
                <span>engagement: {debugData.metricsSummary?.engagementRate ?? '—'}</span>
              </div>
              <p className="text-[11px] text-blue-600/80 dark:text-blue-300/80">
                Si "items" es 0 → el actor no recibió bien la entrada. Si hay items pero posts/seguidores en 0 → el actor usa otros nombres de campo. Copiá este JSON y pasámelo para ajustar el mapeo.
              </p>
              <pre className="max-h-80 overflow-auto bg-white dark:bg-gray-900 border border-blue-200 dark:border-blue-800 rounded-lg p-3 text-[11px] leading-relaxed text-gray-700 dark:text-gray-300 select-all whitespace-pre-wrap break-all">
{JSON.stringify(debugData, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}

      {!scraped && isCurrentMonth && (displayData?.reach == null || displayData?.impressions == null) && (
        <div className="bg-amber-50/70 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-xl px-4 py-3 text-xs text-amber-800 dark:text-amber-300">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <span>👁 No se están trayendo Alcance e Impresiones. Suele ser el permiso <code className="font-mono">read_insights</code> sin asignar al token, o una métrica deprecada por Meta. Corré el diagnóstico para ver qué responde la Graph API.</span>
            <button onClick={handleInsightsDebug} disabled={debugLoading}
              className="shrink-0 px-2.5 py-1 rounded-lg border border-amber-300 dark:border-amber-700 hover:bg-amber-100 dark:hover:bg-amber-900/30 disabled:opacity-50 transition-colors font-medium">
              {debugLoading ? 'Diagnosticando…' : '🔍 Diagnóstico de insights'}
            </button>
          </div>

          {debugError && <p className="mt-2 text-red-600 dark:text-red-400">{debugError}</p>}

          {debugData?.perMetric && (
            <div className="mt-3 space-y-2">
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-amber-900 dark:text-amber-200 font-medium">
                <span>read_insights: {debugData.tokenInfo?.hasReadInsights === true ? '✅ sí' : debugData.tokenInfo?.hasReadInsights === false ? '❌ no' : '—'}</span>
                <span>token válido: {debugData.tokenInfo?.isValid === true ? '✅' : debugData.tokenInfo?.isValid === false ? '❌' : '—'}</span>
                <span>llamada combinada: {debugData.combined?.ok ? '✅ ok' : `❌ ${debugData.combined?.error || 'falló'}`}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {debugData.perMetric.map(m => (
                  <span key={m.metric} className={`px-2 py-0.5 rounded-full font-mono text-[11px] ${m.ok ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300' : 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300'}`}>
                    {m.metric}: {m.ok ? (m.value ?? 'null') : `error ${m.code ?? ''}`}
                  </span>
                ))}
              </div>
              {debugData.postProbe?.metrics?.length > 0 && (
                <div>
                  <p className="text-[11px] text-amber-700/80 dark:text-amber-300/80 mb-1">Alcance a nivel post (el de página está deprecado):</p>
                  <div className="flex flex-wrap gap-2">
                    {debugData.postProbe.metrics.map(m => (
                      <span key={m.metric} className={`px-2 py-0.5 rounded-full font-mono text-[11px] ${m.ok ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300' : 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300'}`}>
                        {m.metric}: {m.ok ? (m.value ?? 'null') : `error ${m.code ?? ''}`}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <p className="text-[11px] text-amber-700/80 dark:text-amber-300/80">
                Si <code className="font-mono">read_insights</code> es ❌ → regenerá el System User Token incluyendo ese permiso y asignale la página con acceso a métricas. Si una métrica puntual da error y las otras ✅ → esa está deprecada (ya las pedimos por separado, así no tumba a las demás). Copiá este JSON y pasámelo.
              </p>
              <pre className="max-h-80 overflow-auto bg-white dark:bg-gray-900 border border-amber-200 dark:border-amber-800 rounded-lg p-3 text-[11px] leading-relaxed text-gray-700 dark:text-gray-300 select-all whitespace-pre-wrap break-all">
{JSON.stringify(debugData, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}

      {availableMonths.length > 0 && (
        <MonthNav selectedMonth={selectedMonth} availableMonths={availableMonths} onChange={setSelectedMonth}
          canDelete={canDeleteSnapshot} onDelete={handleDeleteSnapshot} deleting={deletingSnapshot} />
      )}

      {displayData && (
        <div className={`grid grid-cols-2 sm:grid-cols-3 gap-3 ${scraped ? 'lg:grid-cols-3' : 'lg:grid-cols-5'}`}>
          <FollowersCard
            followersCount={displayData.followersCount}
            monthlyGain={monthlyGain}
          />
          <KpiCard icon="⚡" label="Engagement"
            value={displayData.engagementRate != null ? `${displayData.engagementRate}%` : '—'}
            valueClass={engColor(displayData.engagementRate)}
            sub={engLabel(displayData.engagementRate)}
          />
          {!scraped && (
            <KpiCard icon="👁" label="Alcance"
              value={displayData.reach != null ? fmtK(displayData.reach) : '—'}
              sub={`orgánico · suma posts · ${isCurrentMonth ? 'este mes' : 'ese mes'}`}
            />
          )}
          {!scraped && (
            <KpiCard icon="📣" label="Impresiones"
              value={displayData.impressions != null ? fmtK(displayData.impressions) : '—'}
              sub={`orgánico · ${isCurrentMonth ? 'este mes' : 'ese mes'}`}
            />
          )}
          <KpiCard icon="📅" label="Posts del mes"
            value={displayData.postsThisMonth != null ? fmtNum(displayData.postsThisMonth) : '—'}
            sub={isCurrentMonth ? 'posts este mes' : 'posts ese mes'}
          />
        </div>
      )}

      {isCurrentMonth && metrics?.topPosts?.length > 0 && <TopPosts posts={metrics.topPosts} />}
      {!isCurrentMonth && Array.isArray(displayData?.topPosts) && displayData.topPosts.length > 0 && <TopPosts posts={displayData.topPosts} />}

      {/* Evolución de seguidores */}
      {integration && (() => {
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
                      <button key={f.key} onClick={() => { setFollowerFilter(f.key); fetchFollowerLogs(f.key) }}
                        className={`px-2.5 py-1 text-xs rounded-lg transition-colors ${followerFilter === f.key ? 'text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'}`}
                        style={followerFilter === f.key ? { backgroundColor: FB_BLUE } : {}}
                      >{f.label}</button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            {followerLoading
              ? <div className="flex justify-center py-10"><div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: `${FB_BLUE} transparent ${FB_BLUE} ${FB_BLUE}` }} /></div>
              : hasChart
                ? <LineChart data={chartData} valueAccessor={d => d.followersCount} labelAccessor={d => snapshotFallback ? d.date?.slice(0, 7) : d.date?.slice(5)} color={FB_BLUE} formatY={v => fmtK(Math.round(v))} chartHeight={160} displayHeight={180} bare />
                : <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">Recopilando información, pronto vas a poder ver la evolución de seguidores.</p>
            }
          </div>
        )
      })()}
    </div>
  )
}
