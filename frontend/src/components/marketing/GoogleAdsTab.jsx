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

function fmtUSD(n) {
  if (n == null || n === 0) return '$0'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(n)
}

function fmtPct(n) {
  if (n == null) return '—'
  return `${Number(n).toFixed(2)}%`
}

const CAMPAIGN_STATUS = {
  ENABLED: { label: 'Activa',   cls: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' },
  PAUSED:  { label: 'Pausada',  cls: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400' },
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

// ── KPI Card ──────────────────────────────────────────────────────────────────

function KpiCard({ icon, label, value, sub, valueClass = '' }) {
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 flex flex-col gap-1">
      <div className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400 text-xs">
        <span>{icon}</span><span>{label}</span>
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
              <th className="text-right px-4 py-3 font-medium">Impresiones</th>
              <th className="text-right px-4 py-3 font-medium">Clicks</th>
              <th className="text-right px-4 py-3 font-medium">CTR</th>
              <th className="text-right px-4 py-3 font-medium">CPC Prom.</th>
              <th className="text-right px-5 py-3 font-medium">Conversiones</th>
            </tr>
          </thead>
          <tbody>
            {campaigns.map((c, i) => {
              const status = CAMPAIGN_STATUS[c.status] ?? { label: c.status, cls: 'bg-gray-100 dark:bg-gray-700 text-gray-500' }
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
                      <div className="min-w-0">
                        <p className="text-gray-800 dark:text-gray-200 truncate max-w-[180px]" title={c.name}>
                          {c.name}
                        </p>
                        {c.channelLabel && (
                          <p className="text-[10px] text-gray-400">{c.channelLabel}</p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3.5 text-right font-semibold text-gray-900 dark:text-white whitespace-nowrap">
                    {fmtUSD(c.cost)}
                  </td>
                  <td className="px-4 py-3.5 text-right text-gray-600 dark:text-gray-400">{fmtK(c.impressions)}</td>
                  <td className="px-4 py-3.5 text-right text-gray-600 dark:text-gray-400">{fmtK(c.clicks)}</td>
                  <td className="px-4 py-3.5 text-right text-gray-600 dark:text-gray-400">{fmtPct(c.ctr)}</td>
                  <td className="px-4 py-3.5 text-right text-gray-600 dark:text-gray-400">{fmtUSD(c.avgCpc)}</td>
                  <td className="px-5 py-3.5 text-right text-gray-600 dark:text-gray-400">
                    {c.conversions > 0 ? fmtNum(c.conversions) : '—'}
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

// ── Formulario de Customer ID ─────────────────────────────────────────────────

function CustomerIdForm({ projectId, onSaved }) {
  const [value,   setValue]   = useState('')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    const clean = value.replace(/-/g, '').trim()
    if (!/^\d{8,12}$/.test(clean)) {
      setError('El Customer ID debe ser un número de 8 a 12 dígitos (ej: 123-456-7890)')
      return
    }
    setLoading(true)
    setError(null)
    try {
      await api.patch(`/marketing/projects/${projectId}/integrations/google_ads`, { customerId: clean })
      onSaved()
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo guardar el Customer ID.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col items-center justify-center py-16 text-center max-w-sm mx-auto">
      <div className="w-14 h-14 bg-blue-50 dark:bg-blue-900/20 rounded-2xl flex items-center justify-center text-3xl mb-4">
        🔑
      </div>
      <h3 className="text-base font-semibold text-gray-700 dark:text-gray-300 mb-1">
        Ingresá tu Customer ID
      </h3>
      <p className="text-sm text-gray-400 dark:text-gray-500 mb-6">
        Lo encontrás en la esquina superior derecha de Google Ads, con el formato{' '}
        <span className="font-mono">123-456-7890</span>.
      </p>
      <form onSubmit={handleSubmit} className="w-full space-y-3">
        <input
          type="text"
          value={value}
          onChange={e => setValue(e.target.value)}
          placeholder="123-456-7890"
          className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-center font-mono"
        />
        {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={loading || !value.trim()}
          className="w-full px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl disabled:opacity-50 transition-colors"
        >
          {loading ? 'Guardando…' : 'Guardar y continuar'}
        </button>
      </form>
    </div>
  )
}

// ── Prompt de conexión OAuth ──────────────────────────────────────────────────

function ConnectPrompt({ projectId, onConnected }) {
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)
  const pollRef = useRef(null)

  const handleConnect = async () => {
    if (!projectId) { setError('Seleccioná un proyecto primero.'); return }
    setLoading(true)
    setError(null)
    try {
      const { data } = await api.get('/marketing/integrations/google/auth-url', {
        params: { projectId, type: 'google_ads' },
      })
      localStorage.removeItem('__ga_oauth_result')
      const popup = window.open(data.url, 'google_ads_oauth', 'width=520,height=660,left=200,top=100')

      let elapsed = 0
      pollRef.current = setInterval(() => {
        elapsed += 600
        try {
          const raw = localStorage.getItem('__ga_oauth_result')
          if (raw) {
            const result = JSON.parse(raw)
            localStorage.removeItem('__ga_oauth_result')
            clearInterval(pollRef.current)
            setLoading(false)
            if (result.success && result.integrationType === 'google_ads') onConnected()
            else setError(result.error || 'Error al conectar Google Ads.')
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
      <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl mb-4 overflow-hidden bg-white border border-gray-200 dark:border-gray-700 shadow-sm">
        🔍
      </div>
      <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">
        Conectá tu cuenta de Google Ads
      </h3>
      <p className="text-sm text-gray-400 dark:text-gray-500 max-w-xs mb-6">
        Necesitás una cuenta activa de Google Ads con campañas configuradas.
      </p>
      {error && <p className="text-sm text-red-600 dark:text-red-400 mb-4 max-w-sm">{error}</p>}
      <button
        onClick={handleConnect}
        disabled={loading || !projectId}
        className="px-5 py-2.5 bg-blue-500 hover:bg-blue-600 text-white text-sm font-semibold rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? 'Conectando…' : 'Conectar Google Ads'}
      </button>
      {!projectId && (
        <p className="text-xs text-gray-400 mt-2">Seleccioná un proyecto para continuar.</p>
      )}
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function GoogleAdsTab({ projectId }) {
  const [integration,   setIntegration]   = useState(null)  // null = cargando, false = no conectado
  const [initLoading,   setInitLoading]   = useState(true)
  const [data,          setData]          = useState(null)
  const [datePreset,    setDatePreset]    = useState('this_month')
  const [dataLoading,   setDataLoading]   = useState(false)
  const [error,         setError]         = useState(null)
  const [disconnecting, setDisconnecting] = useState(false)

  const loadIntegration = useCallback(async () => {
    if (!projectId) return null
    try {
      const res = await api.get(`/marketing/projects/${projectId}/integrations`)
      return res.data.find(i => i.type === 'google_ads') ?? null
    } catch { return null }
  }, [projectId])

  const loadData = useCallback(async (preset, intg) => {
    if (!intg?.customerId) return
    setDataLoading(true)
    setError(null)
    try {
      const res = await api.get(`/marketing/projects/${projectId}/google-ads`, {
        params: { datePreset: preset },
      })
      setData(res.data)
    } catch (err) {
      setError(err.response?.data?.error || 'Error al cargar datos de Google Ads.')
    } finally {
      setDataLoading(false)
    }
  }, [projectId])

  // Carga inicial
  useEffect(() => {
    if (!projectId) { setInitLoading(false); return }
    setInitLoading(true)
    loadIntegration().then(intg => {
      setIntegration(intg)
      setInitLoading(false)
      if (intg?.customerId) loadData(datePreset, intg)
    })
  }, [projectId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handlePresetChange(preset) {
    setDatePreset(preset)
    await loadData(preset, integration)
  }

  async function handleConnected() {
    const intg = await loadIntegration()
    setIntegration(intg)
    if (intg?.customerId) loadData(datePreset, intg)
  }

  async function handleCustomerIdSaved() {
    const intg = await loadIntegration()
    setIntegration(intg)
    if (intg?.customerId) loadData(datePreset, intg)
  }

  async function handleDisconnect() {
    if (!window.confirm('¿Desconectar la cuenta de Google Ads de este proyecto?')) return
    setDisconnecting(true)
    try {
      await api.delete(`/marketing/projects/${projectId}/integrations/google_ads`)
      setIntegration(null); setData(null)
    } catch (err) {
      alert(err.response?.data?.error || 'No se pudo desconectar.')
    } finally { setDisconnecting(false) }
  }

  if (!projectId) {
    return (
      <div className="text-center py-20 text-sm text-gray-400 dark:text-gray-500">
        Seleccioná un proyecto para ver los anuncios de Google.
      </div>
    )
  }

  if (initLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  // Sin integración → prompt de conexión
  if (!integration) return <ConnectPrompt projectId={projectId} onConnected={handleConnected} />

  // Integración conectada pero sin Customer ID → formulario
  if (!integration.customerId) {
    return (
      <div className="space-y-4">
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-50 dark:bg-blue-900/20 rounded-xl flex items-center justify-center text-xl">🔍</div>
              <div>
                <p className="font-semibold text-gray-900 dark:text-white">Google Ads conectado</p>
                <p className="text-xs text-green-600 dark:text-green-400">OAuth autorizado ✓</p>
              </div>
            </div>
            <button
              onClick={handleDisconnect}
              disabled={disconnecting}
              className="text-xs text-gray-400 hover:text-red-500 transition-colors"
            >
              {disconnecting ? 'Desconectando…' : 'Desconectar'}
            </button>
          </div>
        </div>
        <CustomerIdForm projectId={projectId} onSaved={handleCustomerIdSaved} />
      </div>
    )
  }

  const presetLabel = DATE_PRESETS.find(p => p.key === datePreset)?.label ?? datePreset

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-50 dark:bg-blue-900/20 rounded-xl flex items-center justify-center text-xl">🔍</div>
            <div>
              <p className="font-semibold text-gray-900 dark:text-white">Google Ads</p>
              <p className="text-xs text-gray-400 dark:text-gray-500">
                Customer ID: {String(integration.customerId).replace(/(\d{3})(\d{3})(\d+)/, '$1-$2-$3')}
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
                ? 'bg-blue-500 text-white'
                : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-blue-300 dark:hover:border-blue-700'
            }`}
          >
            {p.label}
          </button>
        ))}
        {dataLoading && (
          <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin ml-2" />
        )}
      </div>

      {/* KPI cards */}
      {data && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <KpiCard
            icon="💰" label="Gasto total"
            value={fmtUSD(data.cost)}
            sub={presetLabel}
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
              data.ctr >= 5   ? 'text-green-600 dark:text-green-400' :
              data.ctr >= 2   ? 'text-yellow-600 dark:text-yellow-400' :
              data.ctr > 0    ? 'text-red-600 dark:text-red-400' : ''
            }
          />
          <KpiCard
            icon="💸" label="CPC Promedio"
            value={fmtUSD(data.avgCpc)}
            sub="costo por click"
          />
          <KpiCard
            icon="🎯" label="Conversiones"
            value={data.conversions > 0 ? fmtNum(data.conversions) : '—'}
            sub="total"
          />
        </div>
      )}

      {/* Tabla de campañas */}
      {data && <CampaignsTable campaigns={data.campaigns} />}

      {/* Sin datos */}
      {data && data.cost === 0 && data.campaigns.length === 0 && (
        <div className="bg-gray-50 dark:bg-gray-800/50 border border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-6 text-center">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No hubo actividad publicitaria en el período seleccionado.
          </p>
        </div>
      )}
    </div>
  )
}
