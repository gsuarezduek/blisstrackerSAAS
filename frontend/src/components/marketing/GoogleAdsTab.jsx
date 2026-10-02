import { useState, useEffect, useCallback } from 'react'
import api from '../../api/client'
import ObjectiveProgressBars from './ObjectiveProgressBars'
import useObjectiveProgress from './useObjectiveProgress'
import AdsAdvisorPanel from './AdsAdvisorPanel'
import CrossProjectAdsPanel from './CrossProjectAdsPanel'
import { BRANDS } from './networks/brands'
import { fmtNum, fmtK, fmtUSD, fmtPct } from './networks/format'
import { KpiCard, BrandSpinner } from './networks/ui'
import ConnectScreen, { OAuthMethod, ExpiredNotice } from './networks/ConnectScreen'
import AccountHeader from './networks/AccountHeader'

const BRAND = BRANDS.google_ads

const authUrl = projectId => () =>
  api.get('/marketing/integrations/google/auth-url', { params: { projectId, type: 'google_ads' } }).then(r => r.data.url)

const fmtGoogleId = id => String(id).replace(/(\d{3})(\d{3})(\d+)/, '$1-$2-$3')

function ConnectPrompt({ projectId, onConnected }) {
  return (
    <ConnectScreen brand={BRAND} title="Conectá la cuenta de Google Ads"
      subtitle="Inversión, clicks, CTR, conversiones y las campañas activas."
      methods={[{
        key: 'official', icon: '🔗', title: 'Conexión oficial (Google)',
        description: 'Autorizá con la cuenta de Google que administra Google Ads. Después elegís el Customer ID.',
        body: <OAuthMethod brand={BRAND} getAuthUrl={authUrl(projectId)} onConnected={onConnected} cta="Conectar con Google" />,
      }]}
    />
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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

// ── Mejores anuncios (preview de texto) ───────────────────────────────────────

const AD_TYPE_LABEL = {
  RESPONSIVE_SEARCH_AD:  'Búsqueda',
  EXPANDED_TEXT_AD:      'Búsqueda',
  RESPONSIVE_DISPLAY_AD: 'Display',
  IMAGE_AD:              'Display',
  VIDEO_AD:             'Video',
  VIDEO_RESPONSIVE_AD:   'Video',
  APP_AD:               'App',
}

function GoogleTopAds({ ads }) {
  if (!ads || ads.length === 0) return null

  const bestImpId = ads[0]?.id // ya vienen ordenados por impresiones desc
  const bestCtrId = [...ads].filter(a => a.ctr > 0).sort((a, b) => b.ctr - a.ctr)[0]?.id

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700">
        <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">
          🏆 Mejores anuncios ({ads.length})
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-4">
        {ads.map(ad => {
          const badges = []
          if (ad.id === bestImpId) badges.push({ label: 'Más impresiones', cls: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300' })
          if (ad.id === bestCtrId) badges.push({ label: 'Mejor CTR',       cls: 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300' })
          const typeLabel = AD_TYPE_LABEL[ad.type] ?? ad.type
          return (
            <div key={ad.id} className="flex flex-col gap-2 border border-gray-100 dark:border-gray-700 rounded-lg p-3 bg-gray-50 dark:bg-gray-800/50">
              <div className="flex items-center justify-between gap-2">
                {typeLabel && (
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">{typeLabel}</span>
                )}
                <div className="flex flex-wrap gap-1 justify-end">
                  {badges.map(b => (
                    <span key={b.label} className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${b.cls}`}>{b.label}</span>
                  ))}
                </div>
              </div>
              {/* Preview del anuncio de texto (estilo resultado de búsqueda) */}
              {ad.headline
                ? (
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-blue-700 dark:text-blue-400 line-clamp-2" title={ad.headline}>{ad.headline}</p>
                    {ad.description && <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 mt-0.5">{ad.description}</p>}
                  </div>
                )
                : (
                  <p className="text-sm text-gray-700 dark:text-gray-300 truncate" title={ad.name}>{ad.name || 'Anuncio'}</p>
                )}
              {ad.campaignName && <p className="text-[10px] text-gray-400 truncate">📁 {ad.campaignName}</p>}
              <div className="grid grid-cols-3 gap-x-2 text-[11px] text-gray-500 dark:text-gray-400 border-t border-gray-100 dark:border-gray-700 pt-2 mt-auto">
                <span>📢 {fmtK(ad.impressions)}</span>
                <span>📊 {fmtPct(ad.ctr)}</span>
                <span>💰 {fmtUSD(ad.cost)}</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Formulario de Customer ID (+ Manager Account ID opcional) ────────────────

function CustomerIdForm({ projectId, onSaved, initialCustomerId = '', initialManagerId = '' }) {
  const [customerId,  setCustomerId]  = useState(initialCustomerId)
  const [managerId,   setManagerId]   = useState(initialManagerId)
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState(null)

  function cleanId(v) { return v.replace(/-/g, '').trim() }

  async function handleSubmit(e) {
    e.preventDefault()
    const cleanCust = cleanId(customerId)
    const cleanMgr  = cleanId(managerId)

    if (!/^\d{8,12}$/.test(cleanCust)) {
      setError('El Customer ID debe ser un número de 8 a 12 dígitos (ej: 123-456-7890)')
      return
    }
    if (cleanMgr && !/^\d{8,12}$/.test(cleanMgr)) {
      setError('El Manager Account ID debe ser un número de 8 a 12 dígitos (ej: 123-456-7890)')
      return
    }
    setLoading(true)
    setError(null)
    try {
      await api.patch(`/marketing/projects/${projectId}/integrations/google_ads`, {
        customerId: cleanCust,
        propertyId: cleanMgr || null,   // null borra el manager ID si se deja vacío
      })
      onSaved()
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo guardar.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col items-center justify-center py-12 text-center max-w-sm mx-auto">
      <div className="w-14 h-14 bg-blue-50 dark:bg-blue-900/20 rounded-2xl flex items-center justify-center text-3xl mb-4">
        🔑
      </div>
      <h3 className="text-base font-semibold text-gray-700 dark:text-gray-300 mb-1">
        Configurar cuenta de Google Ads
      </h3>
      <p className="text-sm text-gray-400 dark:text-gray-500 mb-6 text-left">
        Ingresá el Customer ID de la cuenta que querés ver. Si la cuenta está administrada
        desde un <strong className="text-gray-500 dark:text-gray-400">Manager Account (MCC)</strong>,
        agregá también el ID del manager.
      </p>
      <form onSubmit={handleSubmit} className="w-full space-y-4 text-left">

        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
            Customer ID <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={customerId}
            onChange={e => setCustomerId(e.target.value)}
            placeholder="123-456-7890"
            className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono"
          />
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
            Esquina superior derecha de Google Ads
          </p>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
            Manager Account ID <span className="text-gray-400 dark:text-gray-500 font-normal">(solo si usás MCC)</span>
          </label>
          <input
            type="text"
            value={managerId}
            onChange={e => setManagerId(e.target.value)}
            placeholder="987-654-3210 (opcional)"
            className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono"
          />
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
            ID del Manager Account desde el que administrás esta cuenta
          </p>
        </div>

        {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}

        <button
          type="submit"
          disabled={loading || !customerId.trim()}
          className="w-full px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl disabled:opacity-50 transition-colors"
        >
          {loading ? 'Guardando…' : 'Guardar y continuar'}
        </button>
      </form>
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function GoogleAdsTab({ projectId, onSelectProject, projects = [] }) {
  const objectives = useObjectiveProgress(projectId).filter(o => o.category === 'ads' && o.detail?.platform === 'google_ads')
  const [integration,        setIntegration]        = useState(null)
  const [initLoading,        setInitLoading]        = useState(true)
  const [data,               setData]               = useState(null)
  const [datePreset,         setDatePreset]         = useState('this_month')
  const [dataLoading,        setDataLoading]        = useState(false)
  const [error,              setError]              = useState(null)
  const [errorCode,          setErrorCode]          = useState(null)
  const [editingCustomerId,  setEditingCustomerId]  = useState(false)
  const [disconnecting,      setDisconnecting]      = useState(false)
  const [savingSnap,         setSavingSnap]         = useState(false)
  const [snapSaved,          setSnapSaved]          = useState(false)

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
    setErrorCode(null)
    try {
      const res = await api.get(`/marketing/projects/${projectId}/google-ads`, {
        params: { datePreset: preset },
      })
      setData(res.data)
    } catch (err) {
      setError(err.response?.data?.error || 'Error al cargar datos de Google Ads.')
      setErrorCode(err.response?.data?.code ?? null)
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
    setEditingCustomerId(false)
    setError(null)
    setErrorCode(null)
    if (intg?.customerId) loadData(datePreset, intg)
  }

  async function handleSaveSnapshot() {
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
      await api.post(`/marketing/projects/${projectId}/ads-snapshots`, { month, type: 'google_ads' })
      setSnapSaved(true)
      setTimeout(() => setSnapSaved(false), 3000)
    } catch (err) {
      alert(err.response?.data?.error || 'Error al guardar snapshot')
    } finally {
      setSavingSnap(false)
    }
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
      <CrossProjectAdsPanel
        type="google_ads"
        label="Google Ads"
        icon="🔍"
        emptyIcon="🔍"
        activeBtnClass="bg-yellow-500 text-white"
        spinnerBorderClass="border-yellow-500"
        onSelectProject={onSelectProject}
      />
    )
  }

  if (initLoading) return <BrandSpinner brand={BRAND} />

  // Sin integración → prompt de conexión
  if (!integration) return <ConnectPrompt projectId={projectId} onConnected={handleConnected} />
  // Token vencido (refresh con invalid_grant): se reconecta con el mismo OAuth.
  if (integration.status === 'expired' || errorCode === 'TOKEN_EXPIRED') return (
    <ExpiredNotice brand={BRAND}>
      <OAuthMethod brand={BRAND} getAuthUrl={authUrl(projectId)} onConnected={handleConnected} cta="Reconectar con Google" />
    </ExpiredNotice>
  )

  // Integración conectada pero sin Customer ID, o usuario quiere editarlo → formulario
  if (!integration.customerId || editingCustomerId) {
    return (
      <div className="space-y-4">
        <AccountHeader brand={BRAND} integration={integration} name="Google Ads"
          subtitle="Cuenta de Google autorizada ✓ — falta elegir el Customer ID"
          actions={editingCustomerId ? [{ key: 'cancel', label: 'Cancelar', onClick: () => setEditingCustomerId(false) }] : []}
          onDisconnect={handleDisconnect} disconnecting={disconnecting} />
        <CustomerIdForm
          projectId={projectId}
          onSaved={handleCustomerIdSaved}
          initialCustomerId={integration.customerId || ''}
          initialManagerId={integration.propertyId || ''}
        />
      </div>
    )
  }

  const presetLabel = DATE_PRESETS.find(p => p.key === datePreset)?.label ?? datePreset

  return (
    <div className="space-y-4">

      <AccountHeader brand={BRAND} integration={integration} name={data?.customerName || 'Google Ads'}
        subtitle={<>Cliente {fmtGoogleId(integration.customerId)}{integration.propertyId && <> · Manager {fmtGoogleId(integration.propertyId)}</>}</>}
        actions={[{ key: 'cid', label: 'Cambiar cuenta', onClick: () => setEditingCustomerId(true) }]}
        onDisconnect={handleDisconnect} disconnecting={disconnecting} />

      {/* Error */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 text-sm text-red-700 dark:text-red-300 flex items-start justify-between gap-3">
          <span>{error}</span>
          {(errorCode === 'NOT_FOUND' || errorCode === 'PERMISSION_DENIED') && (
            <button
              onClick={() => setEditingCustomerId(true)}
              className="shrink-0 text-xs underline text-red-600 dark:text-red-400 hover:no-underline whitespace-nowrap"
            >
              {errorCode === 'PERMISSION_DENIED' ? 'Configurar Manager ID' : 'Corregir Customer ID'}
            </button>
          )}
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

      {/* Objetivos de Google Ads del proyecto */}
      <ObjectiveProgressBars objectives={objectives} title="🎯 Objetivos de Google Ads" />

      {/* Análisis con IA: diagnóstico + ideas de anuncios nuevos */}
      <AdsAdvisorPanel
        projectId={projectId}
        projectName={projects.find(p => String(p.id) === String(projectId))?.name}
        platform="google_ads"
        datePreset={datePreset}
      />

      {/* Mejores anuncios (preview de texto) */}
      {data && <GoogleTopAds ads={data.topAds} />}

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
