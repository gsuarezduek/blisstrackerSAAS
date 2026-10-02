import { useState, useEffect, useCallback } from 'react'
import api from '../../api/client'
import ObjectiveProgressBars from './ObjectiveProgressBars'
import useObjectiveProgress from './useObjectiveProgress'
import AdsAdvisorPanel from './AdsAdvisorPanel'
import CrossProjectAdsPanel from './CrossProjectAdsPanel'
import { BRANDS } from './networks/brands'
import { fmtK, fmtUSD, fmtPct } from './networks/format'
import { KpiCard, BrandSpinner } from './networks/ui'
import ConnectScreen, { OAuthMethod, TokenMethod, ExpiredNotice } from './networks/ConnectScreen'
import AccountHeader from './networks/AccountHeader'
import { DollarSign, Eye, Image, Megaphone, MousePointerClick } from 'lucide-react'
import { Icon } from '../ui/Icon'

const BRAND = BRANDS.meta_ads

const authUrl = projectId => () =>
  api.get('/marketing/integrations/meta-ads/auth-url', { params: { projectId } }).then(r => r.data.url)

const CLOSED_MSG = 'La ventana se cerró sin completar la autorización. Si Facebook mostró un error, verificá que la redirect URI esté registrada en Meta for Developers y que tu cuenta tenga acceso a una cuenta publicitaria activa.'

function tokenMethod(projectId, onConnected) {
  return (
    <TokenMethod brand={BRAND} accountParam="adAccountId" onConnected={onConnected}
      endpoint={`/marketing/projects/${projectId}/integrations/meta-ads/connect-token`}
      renderAccountSub={a => `${a.id}${a.currency ? ` · ${a.currency}` : ''}`}
      steps={<>En Business Manager → Configuración → Usuarios del sistema, generá un token con el permiso <span className="font-mono">ads_read</span> y la cuenta publicitaria asignada.</>} />
  )
}

function ConnectPrompt({ projectId, onConnected }) {
  return (
    <ConnectScreen brand={BRAND} title="Conectá la cuenta de Meta Ads"
      subtitle="Inversión, alcance, clicks, CTR y resultados de las campañas de Facebook e Instagram."
      methods={[
        {
          key: 'official', title: 'Conexión oficial',
          description: 'Iniciá sesión con Facebook. Necesitás acceso a una cuenta publicitaria activa.',
          body: <OAuthMethod brand={BRAND} getAuthUrl={authUrl(projectId)} onConnected={onConnected} cta="Conectar con Facebook" closedMessage={CLOSED_MSG} />,
        },
        {
          key: 'token', title: 'Token de Business Manager',
          description: 'System User Token con permiso ads_read. Útil si administrás las cuentas desde Business Manager.',
          body: tokenMethod(projectId, onConnected),
        },
      ]}
    />
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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
          Campañas ({campaigns.length})
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
          Mejores anuncios ({ads.length})
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
                  : <span><Icon as={Image} size={28} className="inline-block text-gray-300 dark:text-gray-600" /></span>}
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
                  <span><Icon as={Eye} size={12} className="inline align-[-2px] mr-1" />{fmtK(ad.reach)}</span>
                  <span><Icon as={MousePointerClick} size={12} className="inline align-[-2px] mr-1" />{fmtPct(ad.ctr)}</span>
                  <span><Icon as={Megaphone} size={12} className="inline align-[-2px] mr-1" />{fmtK(ad.impressions)}</span>
                  <span><Icon as={DollarSign} size={12} className="inline align-[-2px] mr-1" />{fmtUSD(ad.spend)}</span>
                </div>
              </div>
            </div>
          )
        })}
      </div>
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
    return (
      <CrossProjectAdsPanel
        type="meta_ads"
        label="Meta Ads"
        activeBtnClass="bg-blue-500 text-white"
        spinnerBorderClass="border-blue-500"
        onSelectProject={onSelectProject}
      />
    )
  }

  if (loading && !data) return <BrandSpinner brand={BRAND} />

  if (!integration) return <ConnectPrompt projectId={projectId} onConnected={() => fetchData()} />
  if (integration.status === 'expired') return (
    <ExpiredNotice brand={BRAND}>
      <OAuthMethod brand={BRAND} getAuthUrl={authUrl(projectId)} onConnected={() => fetchData()} cta="Reconectar con Facebook" closedMessage={CLOSED_MSG} />
    </ExpiredNotice>
  )

  const presetLabel = DATE_PRESETS.find(p => p.key === datePreset)?.label ?? datePreset

  return (
    <div className="space-y-4">

      <AccountHeader brand={BRAND} integration={integration} name="Meta Ads"
        subtitle={integration.propertyId ? `Cuenta publicitaria ${integration.propertyId}` : null}
        onDisconnect={handleDisconnect} disconnecting={disconnecting} />

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
            {snapSaved ? 'Snapshot guardado' : savingSnap ? 'Guardando…' : 'Guardar snapshot'}
          </button>
        )}
      </div>

      {/* KPI cards */}
      {data && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <KpiCard
 label="Gasto total"
            value={fmtUSD(data.spend)}
            sub={presetLabel}
          />
          <KpiCard
 label="Alcance"
            value={fmtK(data.reach)}
            sub="personas únicas"
          />
          <KpiCard
 label="Impresiones"
            value={fmtK(data.impressions)}
            sub="veces mostrado"
          />
          <KpiCard
 label="Clicks"
            value={fmtK(data.clicks)}
            sub="total"
          />
          <KpiCard
 label="CTR"
            value={fmtPct(data.ctr)}
            sub="click-through rate"
            valueClass={
              data.ctr >= 2   ? 'text-green-600 dark:text-green-400' :
              data.ctr >= 0.5 ? 'text-yellow-600 dark:text-yellow-400' :
              data.ctr > 0    ? 'text-red-600 dark:text-red-400' : ''
            }
          />
          <KpiCard
 label="CPM"
            value={fmtUSD(data.cpm)}
            sub="costo por 1000 imp."
          />
        </div>
      )}

      {/* Objetivos de Meta Ads del proyecto */}
      <ObjectiveProgressBars objectives={objectives} title="Objetivos de Meta Ads" />

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
