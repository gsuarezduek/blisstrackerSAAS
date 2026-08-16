import { useState, useEffect, useRef, useCallback } from 'react'
import api from '../../api/client'
import ObjectiveProgressBars from './ObjectiveProgressBars'
import useObjectiveProgress from './useObjectiveProgress'
import AdsAdvisorPanel from './AdsAdvisorPanel'

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

function fmtUSD(n) {
  if (n == null || n === 0) return '$0'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(n)
}

function fmtPct(n) {
  if (n == null) return '—'
  return `${Number(n).toFixed(2)}%`
}

const CAMPAIGN_STATUS_LABEL = {
  ACTIVE:   { label: 'Activa',   cls: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' },
  PAUSED:   { label: 'Pausada',  cls: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400' },
  DELETED:  { label: 'Eliminada',cls: 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400' },
  ARCHIVED: { label: 'Archivada',cls: 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400' },
}

const DATE_PRESETS = [
  { key: 'today',       label: 'Hoy' },
  { key: 'yesterday',   label: 'Ayer' },
  { key: 'last_7d',     label: '7 días' },
  { key: 'last_30d',    label: '30 días' },
  { key: 'this_month',  label: 'Este mes' },
  { key: 'last_month',  label: 'Mes anterior' },
  { key: 'last_90d',    label: '90 días' },
]

// ── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({ icon, label, value, sub, valueClass = '' }) {
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 flex flex-col gap-1">
      <div className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400 text-xs">
        <span>{icon}</span>
        <span>{label}</span>
      </div>
      <div className={`text-2xl font-bold text-gray-900 dark:text-white ${valueClass}`}>{value}</div>
      {sub && <div className="text-xs text-gray-400 dark:text-gray-500">{sub}</div>}
    </div>
  )
}

// ── Tabla de campañas ─────────────────────────────────────────────────────────

function CampaignsTable({ campaigns }) {
  if (!campaigns || campaigns.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6 text-center">
        <p className="text-sm text-gray-400 dark:text-gray-500">
          No hay campañas con actividad en el período seleccionado.
        </p>
      </div>
    )
  }

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700">
        <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">
          📋 Campañas ({campaigns.length})
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              <th className="text-left px-5 py-3 font-medium">Campaña</th>
              <th className="text-right px-4 py-3 font-medium">Gasto</th>
              <th className="text-right px-4 py-3 font-medium">Alcance</th>
              <th className="text-right px-4 py-3 font-medium">Impresiones</th>
              <th className="text-right px-4 py-3 font-medium">Clicks</th>
              <th className="text-right px-5 py-3 font-medium">CTR</th>
            </tr>
          </thead>
          <tbody>
            {campaigns.map((c, i) => {
              const status = CAMPAIGN_STATUS_LABEL[c.status] ?? { label: c.status, cls: 'bg-gray-100 dark:bg-gray-700 text-gray-500' }
              return (
                <tr
                  key={c.id}
                  className={`border-b border-gray-50 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors ${
                    i === campaigns.length - 1 ? 'border-b-0' : ''
                  }`}
                >
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className={`shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${status.cls}`}>
                        {status.label}
                      </span>
                      <span className="text-gray-800 dark:text-gray-200 truncate max-w-[200px]" title={c.name}>
                        {c.name}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3.5 text-right font-semibold text-gray-900 dark:text-white whitespace-nowrap">
                    {fmtUSD(c.spend)}
                  </td>
                  <td className="px-4 py-3.5 text-right text-gray-600 dark:text-gray-400">
                    {fmtK(c.reach)}
                  </td>
                  <td className="px-4 py-3.5 text-right text-gray-600 dark:text-gray-400">
                    {fmtK(c.impressions)}
                  </td>
                  <td className="px-4 py-3.5 text-right text-gray-600 dark:text-gray-400">
                    {fmtK(c.clicks)}
                  </td>
                  <td className="px-5 py-3.5 text-right text-gray-600 dark:text-gray-400">
                    {fmtPct(c.ctr)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Mejores anuncios (creativo + destacados) ──────────────────────────────────

function MetaTopAds({ ads }) {
  if (!ads || ads.length === 0) return null

  const bestReachId = ads[0]?.id // ya vienen ordenados por alcance desc
  const bestCtrId   = [...ads].filter(a => a.ctr > 0).sort((a, b) => b.ctr - a.ctr)[0]?.id

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700">
        <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">
          🏆 Mejores anuncios ({ads.length})
        </p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 p-4">
        {ads.map(ad => {
          const badges = []
          if (ad.id === bestReachId) badges.push({ label: 'Mayor alcance', cls: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300' })
          if (ad.id === bestCtrId)   badges.push({ label: 'Mejor CTR',     cls: 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300' })
          return (
            <div key={ad.id} className="flex flex-col border border-gray-100 dark:border-gray-700 rounded-lg overflow-hidden bg-gray-50 dark:bg-gray-800/50">
              <div className="aspect-square bg-gray-100 dark:bg-gray-700 flex items-center justify-center overflow-hidden">
                {ad.thumbnailUrl
                  ? <img src={ad.thumbnailUrl} alt={ad.name} className="w-full h-full object-cover" loading="lazy" />
                  : <span className="text-3xl opacity-30">🖼️</span>}
              </div>
              <div className="p-2.5 flex flex-col gap-1.5">
                {badges.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {badges.map(b => (
                      <span key={b.label} className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${b.cls}`}>{b.label}</span>
                    ))}
                  </div>
                )}
                <p className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate" title={ad.name}>{ad.name || 'Anuncio'}</p>
                <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[11px] text-gray-500 dark:text-gray-400">
                  <span>👁️ {fmtK(ad.reach)}</span>
                  <span>📊 {fmtPct(ad.ctr)}</span>
                  <span>📢 {fmtK(ad.impressions)}</span>
                  <span>💰 {fmtUSD(ad.spend)}</span>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Prompt de conexión ────────────────────────────────────────────────────────

function ConnectPrompt({ projectId, onConnected }) {
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState(null)
  const [showManual,  setShowManual]  = useState(false)
  const [manualToken, setManualToken] = useState('')
  const [accounts,    setAccounts]    = useState(null) // null | array
  const pollRef = useRef(null)

  const handleConnect = async () => {
    if (!projectId) { setError('Seleccioná un proyecto primero.'); return }
    setLoading(true)
    setError(null)
    try {
      const { data } = await api.get('/marketing/integrations/meta-ads/auth-url', { params: { projectId } })
      localStorage.removeItem('__ga_oauth_result')
      const popup = window.open(data.url, 'meta_ads_oauth', 'width=520,height=660,left=200,top=100')

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
            if (result.success && result.integrationType === 'meta_ads') onConnected()
            else setError(result.error || 'Error al conectar Meta Ads.')
            return
          }
        } catch { /* ignorar */ }
        if (popup?.closed) {
          clearInterval(pollRef.current)
          setLoading(false)
          setError('La ventana se cerró sin completar la autorización. Si Facebook mostró un error, verificá que la redirect URI esté registrada en Meta for Developers y que tu cuenta tenga acceso a una Ad Account activa.')
        }
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

  async function handleManualConnect(adAccountId = null) {
    if (!manualToken.trim()) { setError('Ingresá el System User Token.'); return }
    setLoading(true)
    setError(null)
    try {
      const body = { accessToken: manualToken.trim() }
      if (adAccountId) body.adAccountId = adAccountId
      const { data } = await api.post(
        `/marketing/projects/${projectId}/integrations/meta-ads/connect-token`,
        body
      )
      if (data.accounts) {
        // Múltiples cuentas — mostrar picker
        setAccounts(data.accounts)
        setLoading(false)
      } else {
        onConnected()
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Error al conectar con el token.')
      setLoading(false)
    }
  }

  // ── Vista: picker de cuentas ──────────────────────────────────────────────
  if (accounts) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
          Seleccioná la cuenta de Meta Ads
        </p>
        <p className="text-xs text-gray-400 dark:text-gray-500 mb-5">
          Se encontraron {accounts.length} cuentas publicitarias.
        </p>
        {error && <p className="text-sm text-red-600 dark:text-red-400 mb-3 max-w-sm">{error}</p>}
        <div className="w-full max-w-sm space-y-2 mb-5">
          {accounts.map(acc => (
            <button
              key={acc.id}
              onClick={() => handleManualConnect(acc.id)}
              disabled={loading}
              className="w-full flex items-center gap-3 px-4 py-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl hover:border-blue-400 dark:hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors text-left disabled:opacity-50"
            >
              <div className="w-9 h-9 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-blue-700 dark:text-blue-300 font-bold text-sm shrink-0">
                {(acc.name?.[0] ?? '?').toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{acc.name}</p>
                <p className="text-xs text-gray-400 dark:text-gray-500">{acc.id}{acc.currency ? ` · ${acc.currency}` : ''}</p>
              </div>
            </button>
          ))}
        </div>
        <button
          onClick={() => { setAccounts(null); setError(null) }}
          className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
        >
          ← Usar otro token
        </button>
      </div>
    )
  }

  // ── Vista: formulario de token manual ─────────────────────────────────────
  if (showManual) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-16 h-16 bg-gradient-to-br from-blue-600 to-blue-400 rounded-2xl flex items-center justify-center text-3xl mb-4">
          🔑
        </div>
        <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-1">
          System User Token
        </h3>
        <p className="text-xs text-gray-400 dark:text-gray-500 max-w-xs mb-5">
          Generalo desde Business Manager → Configuración → Usuarios del sistema → Generar token.
          Seleccioná permiso <strong>ads_read</strong>.
        </p>
        {error && <p className="text-sm text-red-600 dark:text-red-400 mb-3 max-w-sm">{error}</p>}
        <textarea
          value={manualToken}
          onChange={e => setManualToken(e.target.value)}
          placeholder="Pegá el System User Token aquí…"
          rows={3}
          className="w-full max-w-sm px-3 py-2 text-xs font-mono border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none mb-4"
        />
        <button
          onClick={() => handleManualConnect()}
          disabled={loading || !manualToken.trim()}
          className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-colors mb-3"
        >
          {loading ? 'Verificando…' : 'Conectar'}
        </button>
        <button
          onClick={() => { setShowManual(false); setError(null); setManualToken('') }}
          className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
        >
          ← Volver
        </button>
      </div>
    )
  }

  // ── Vista: pantalla principal de conexión ─────────────────────────────────
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-16 h-16 bg-gradient-to-br from-blue-600 to-blue-400 rounded-2xl flex items-center justify-center text-3xl mb-4">
        📘
      </div>
      <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">
        Conectá tu cuenta de Meta Ads
      </h3>
      <p className="text-sm text-gray-400 dark:text-gray-500 max-w-xs mb-6">
        Necesitás una cuenta publicitaria activa en Facebook Ads Manager.
      </p>
      {error && (
        <p className="text-sm text-red-600 dark:text-red-400 mb-4 max-w-sm">{error}</p>
      )}
      <div className="flex flex-col gap-2 items-center">
        <button
          onClick={handleConnect}
          disabled={loading || !projectId}
          className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? 'Conectando…' : 'Conectar con Facebook'}
        </button>
        <button
          onClick={() => { setShowManual(true); setError(null) }}
          disabled={!projectId}
          className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors disabled:opacity-40"
        >
          Usar System User Token →
        </button>
      </div>
      {!projectId && (
        <p className="text-xs text-gray-400 mt-2">Seleccioná un proyecto para continuar.</p>
      )}
    </div>
  )
}

// ── Panel cross-proyecto ──────────────────────────────────────────────────────

const CROSS_PERIODS = [
  { key: 'today',      label: 'Hoy' },
  { key: 'this_week',  label: 'Esta semana' },
  { key: 'this_month', label: 'Este mes' },
  { key: 'last_month', label: 'Mes anterior' },
]

function objectiveBarCls(pct) {
  if (pct == null) return 'bg-indigo-400'
  return pct > 100 ? 'bg-amber-500' : 'bg-indigo-400'
}

// Badge de progreso del objetivo de inversión configurado (independiente del
// filtro de período elegido arriba — siempre representa el mes/trimestre/año actual).
function ObjectiveBadge({ objective }) {
  if (!objective || objective.pct == null) return null
  const barPct = Math.max(0, Math.min(100, objective.pct))
  return (
    <div
      className="mt-1.5 flex items-center gap-2"
      title={`Objetivo de inversión (${objective.periodLabel}): ${fmtUSD(objective.actual)} de ${fmtUSD(objective.target)}`}
    >
      <span className="text-[10px] text-gray-400 flex-shrink-0">🎯 objetivo</span>
      <div className="flex-1 bg-gray-100 dark:bg-gray-700 rounded-full h-1">
        <div className={`h-1 rounded-full ${objectiveBarCls(objective.pct)}`} style={{ width: `${barPct}%` }} />
      </div>
      <span className={`text-[10px] font-semibold tabular-nums flex-shrink-0 ${objective.pct > 100 ? 'text-amber-600 dark:text-amber-400' : 'text-indigo-600 dark:text-indigo-400'}`}>
        {objective.pct}%
      </span>
    </div>
  )
}

function CrossProjectMetaAdsPanel({ onSelectProject }) {
  const [period,  setPeriod]  = useState('this_month')
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const isLive = period !== 'last_month'

  useEffect(() => {
    setLoading(true)
    const req = isLive
      ? api.get(`/marketing/summary/ads-live?type=meta_ads&period=${period}`).then(r => r.data.results)
      : api.get('/marketing/summary/ads?type=meta_ads').then(r => r.data)
    req.then(rows => setData(rows)).catch(() => setData([])).finally(() => setLoading(false))
  }, [period, isLive])

  // En vivo: se muestran TODOS los proyectos conectados alguna vez (incluidos los
  // desconectados/con error), para no perderlos de vista — con aviso de reconexión
  // en vez de gasto. Los snapshots cerrados no tienen `status` (ya son solo lo
  // guardado, siempre "ok").
  const rows = data || []
  const okRows = isLive ? rows.filter(p => p.status === 'ok') : rows
  const periodDesc = { today: 'hoy, en vivo', this_week: 'esta semana, en vivo', this_month: 'este mes, en vivo', last_month: 'último snapshot cerrado' }[period]

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
          Meta Ads por proyecto {data && `(${rows.length})`} <span className="font-normal text-gray-400">· {periodDesc}</span>
        </h3>
        <div className="flex text-xs rounded-lg border border-gray-200 dark:border-gray-600 overflow-hidden flex-shrink-0">
          {CROSS_PERIODS.map(o => (
            <button
              key={o.key}
              onClick={() => setPeriod(o.key)}
              className={`px-3 py-1.5 font-medium transition-colors ${
                period === o.key
                  ? 'bg-blue-500 text-white'
                  : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : !rows.length ? (
        <div className="text-center py-10">
          <div className="text-4xl mb-3">📘</div>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {isLive
              ? 'Todavía no hay proyectos con Meta Ads conectado.'
              : 'Todavía no hay snapshots de Meta Ads. Los snapshots se guardan el primer día de cada mes, o podés guardar uno manualmente desde dentro del proyecto.'}
          </p>
        </div>
      ) : (() => {
        const maxSpend = Math.max(...okRows.map(p => p.spend), 1)
        return (
          <div className="space-y-3">
            {rows.map(p => {
              const down = isLive && p.status !== 'ok'
              return (
                <div key={p.projectId} className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <button
                        onClick={() => onSelectProject?.(String(p.projectId))}
                        className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate hover:text-primary-600 dark:hover:text-primary-400 transition-colors text-left"
                      >
                        {p.projectName}
                      </button>
                      <div className="flex items-center gap-3 flex-shrink-0 ml-2">
                        {down ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300" title={p.status === 'error' ? p.error : 'La integración de Meta Ads se desconectó o venció. Reconectala desde el proyecto.'}>
                            ⚠ {p.status === 'error' ? 'Error' : 'Desconectado'}
                          </span>
                        ) : (
                          <>
                            {p.month && <span className="text-xs text-gray-400">{p.month}</span>}
                            <span className="text-sm font-bold text-gray-900 dark:text-white tabular-nums">{fmtUSD(p.spend)}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-1.5">
                      <div className={`h-1.5 rounded-full ${down ? 'bg-red-300 dark:bg-red-800' : 'bg-blue-500'}`} style={{ width: down ? '100%' : `${Math.round((p.spend / maxSpend) * 100)}%` }} />
                    </div>
                    {!down && (
                      <div className="flex gap-3 mt-1 text-xs text-gray-400">
                        {p.impressions > 0 && <span>{fmtK(p.impressions)} imp.</span>}
                        {p.clicks > 0 && <span>{fmtK(p.clicks)} clics</span>}
                        {p.ctr > 0 && <span>{fmtPct(p.ctr)} CTR</span>}
                        {p.reach > 0 && <span>{fmtK(p.reach)} alcance</span>}
                      </div>
                    )}
                    {!down && <ObjectiveBadge objective={p.objective} />}
                  </div>
                </div>
              )
            })}
          </div>
        )
      })()}
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function MetaAdsTab({ projectId, onSelectProject, projects = [] }) {
  const objectives = useObjectiveProgress(projectId).filter(o => o.category === 'ads' && o.detail?.platform === 'meta_ads')
  const [integration,    setIntegration]   = useState(null)
  const [data,           setData]          = useState(null)
  const [datePreset,     setDatePreset]    = useState('this_month')
  const [loading,        setLoading]       = useState(false)
  const [error,          setError]         = useState(null)
  const [disconnecting,  setDisconnecting] = useState(false)
  const [savingSnap,     setSavingSnap]    = useState(false)
  const [snapSaved,      setSnapSaved]     = useState(false)

  const fetchIntegration = useCallback(async () => {
    if (!projectId) return
    try {
      const res = await api.get(`/marketing/projects/${projectId}/integrations`)
      const ig  = res.data.find(i => i.type === 'meta_ads')
      setIntegration(ig ?? null)
      return ig ?? null
    } catch { return null }
  }, [projectId])

  const fetchData = useCallback(async (preset = datePreset) => {
    if (!projectId) return
    setLoading(true)
    setError(null)
    try {
      const intg = await fetchIntegration()
      if (!intg) { setLoading(false); return }
      const res = await api.get(`/marketing/projects/${projectId}/meta-ads`, { params: { datePreset: preset } })
      setData(res.data)
    } catch (err) {
      const code = err.response?.data?.code
      if (code === 'NOT_CONNECTED') { setIntegration(null); setData(null) }
      else setError(err.response?.data?.error || 'Error al cargar datos de Meta Ads.')
    } finally {
      setLoading(false)
    }
  }, [projectId, datePreset, fetchIntegration])

  useEffect(() => { fetchData() }, [fetchData])

  async function handlePresetChange(preset) {
    setDatePreset(preset)
    setLoading(true)
    setError(null)
    try {
      const res = await api.get(`/marketing/projects/${projectId}/meta-ads`, { params: { datePreset: preset } })
      setData(res.data)
    } catch (err) {
      setError(err.response?.data?.error || 'Error al cargar datos.')
    } finally {
      setLoading(false)
    }
  }

  async function handleSaveSnapshot() {
    const monthMap = { this_month: 'this', last_month: 'last' }
    const now = new Date()
    let month
    if (datePreset === 'last_month') {
      const m = now.getMonth() === 0 ? 12 : now.getMonth()
      const y = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()
      month = `${y}-${String(m).padStart(2, '0')}`
    } else {
      month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    }
    setSavingSnap(true)
    try {
      await api.post(`/marketing/projects/${projectId}/ads-snapshots`, { month, type: 'meta_ads' })
      setSnapSaved(true)
      setTimeout(() => setSnapSaved(false), 3000)
    } catch (err) {
      alert(err.response?.data?.error || 'Error al guardar snapshot')
    } finally {
      setSavingSnap(false)
    }
  }

  async function handleDisconnect() {
    if (!window.confirm('¿Desconectar la cuenta de Meta Ads de este proyecto?')) return
    setDisconnecting(true)
    try {
      await api.delete(`/marketing/projects/${projectId}/integrations/meta_ads`)
      setIntegration(null); setData(null)
    } catch (err) {
      alert(err.response?.data?.error || 'No se pudo desconectar.')
    } finally { setDisconnecting(false) }
  }

  if (!projectId) {
    return <CrossProjectMetaAdsPanel onSelectProject={onSelectProject} />
  }

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!integration) {
    return <ConnectPrompt projectId={projectId} onConnected={() => fetchData()} />
  }

  const presetLabel = DATE_PRESETS.find(p => p.key === datePreset)?.label ?? datePreset

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white text-xl shrink-0">
              📘
            </div>
            <div>
              <p className="font-semibold text-gray-900 dark:text-white">Meta Ads</p>
              <p className="text-xs text-gray-400 dark:text-gray-500">
                Cuenta: {integration.propertyId}
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

      {/* Error */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Filtro de período */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-gray-500 dark:text-gray-400 mr-1">Período:</span>
        {DATE_PRESETS.map(p => (
          <button
            key={p.key}
            onClick={() => handlePresetChange(p.key)}
            className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
              datePreset === p.key
                ? 'bg-blue-600 text-white'
                : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-blue-300 dark:hover:border-blue-700'
            }`}
          >
            {p.label}
          </button>
        ))}
        {loading && (
          <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin ml-2" />
        )}
        {(datePreset === 'this_month' || datePreset === 'last_month') && data && (
          <button
            onClick={handleSaveSnapshot}
            disabled={savingSnap || snapSaved}
            className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
          >
            {snapSaved ? '✓ Snapshot guardado' : savingSnap ? 'Guardando…' : '💾 Guardar snapshot'}
          </button>
        )}
      </div>

      {/* KPI cards */}
      {data && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <KpiCard
            icon="💰" label="Gasto total"
            value={fmtUSD(data.spend)}
            sub={presetLabel}
          />
          <KpiCard
            icon="👁️" label="Alcance"
            value={fmtK(data.reach)}
            sub="personas únicas"
          />
          <KpiCard
            icon="📢" label="Impresiones"
            value={fmtK(data.impressions)}
            sub="veces mostrado"
          />
          <KpiCard
            icon="🖱️" label="Clicks"
            value={fmtK(data.clicks)}
            sub="total"
          />
          <KpiCard
            icon="📊" label="CTR"
            value={fmtPct(data.ctr)}
            sub="click-through rate"
            valueClass={
              data.ctr >= 2   ? 'text-green-600 dark:text-green-400' :
              data.ctr >= 0.5 ? 'text-yellow-600 dark:text-yellow-400' :
              data.ctr > 0    ? 'text-red-600 dark:text-red-400' : ''
            }
          />
          <KpiCard
            icon="💸" label="CPM"
            value={fmtUSD(data.cpm)}
            sub="costo por 1000 imp."
          />
        </div>
      )}

      {/* Objetivos de Meta Ads del proyecto */}
      <ObjectiveProgressBars objectives={objectives} title="🎯 Objetivos de Meta Ads" />

      {/* Análisis con IA: diagnóstico + ideas de anuncios nuevos */}
      <AdsAdvisorPanel
        projectId={projectId}
        projectName={projects.find(p => String(p.id) === String(projectId))?.name}
        platform="meta_ads"
        datePreset={datePreset}
      />

      {/* Mejores anuncios (creativo) */}
      {data && <MetaTopAds ads={data.topAds} />}

      {/* Tabla de campañas */}
      {data && <CampaignsTable campaigns={data.campaigns} />}

      {/* Sin datos */}
      {data && data.spend === 0 && data.campaigns.length === 0 && (
        <div className="bg-gray-50 dark:bg-gray-800/50 border border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-6 text-center">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No hubo actividad publicitaria en el período seleccionado.
          </p>
        </div>
      )}
    </div>
  )
}
