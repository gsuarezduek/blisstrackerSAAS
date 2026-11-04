import { useState, useEffect, useCallback } from 'react'
import api from '../../api/client'
import ObjectiveProgressBars from './ObjectiveProgressBars'
import useObjectiveProgress from './useObjectiveProgress'
import AdsAdvisorPanel from './AdsAdvisorPanel'
import CrossProjectAdsPanel from './CrossProjectAdsPanel'
import FunLoader from './networks/FunLoader'
import { CHATGPT_ADS_LOADING_MESSAGES } from './networks/loadingMessages'
import { BRANDS } from './networks/brands'
import { fmtNum, fmtK, fmtUSD, fmtPct } from './networks/format'
import { KpiCard } from './networks/ui'
import ConnectScreen, { TokenMethod, ExpiredNotice } from './networks/ConnectScreen'
import AccountHeader from './networks/AccountHeader'
import AdsBrowser from './networks/AdsBrowser'
import { DollarSign, Folder, Megaphone, MousePointerClick, Target } from 'lucide-react'
import { Icon } from '../ui/Icon'

const BRAND = BRANDS.chatgpt_ads

// Conexión por API key: no hay OAuth y cada key está scopeada a UNA cuenta
// publicitaria, así que tampoco hay selector de cuentas (`accountParam`).
function apiKeyMethod(projectId, onConnected, cta) {
  return (
    <TokenMethod brand={BRAND} onConnected={onConnected}
      endpoint={`/marketing/projects/${projectId}/integrations/chatgpt-ads/connect-token`}
      placeholder="Pegá la API key de Ads (sk-ads-…)"
      label="API key de ChatGPT Ads"
      cta={cta}
      steps={<>
        En <a href="https://ads.openai.com" target="_blank" rel="noopener noreferrer"
          className="text-primary-600 dark:text-primary-400 hover:underline">ads.openai.com</a> → Settings,
        generá una API key de la cuenta publicitaria. La key queda asociada a esa cuenta:
        si administrás varias, generá una por cuenta y conectá cada una en su proyecto.
      </>} />
  )
}

function ConnectPrompt({ projectId, onConnected }) {
  return (
    <ConnectScreen brand={BRAND} title="Conectá la cuenta de ChatGPT Ads"
      subtitle="Inversión, impresiones, clicks, CTR y conversiones de los anuncios dentro de ChatGPT."
      methods={[{
        key: 'api_key', title: 'API key de Ads Manager',
        description: 'La única forma de conectar: OpenAI no expone un login OAuth para anunciantes.',
        body: apiKeyMethod(projectId, onConnected, 'Conectar con la API key'),
      }]}
    />
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const CAMPAIGN_STATUS = {
  ACTIVE:   { label: 'Activa',    cls: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' },
  PAUSED:   { label: 'Pausada',   cls: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400' },
  ARCHIVED: { label: 'Archivada', cls: 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400' },
}

const REVIEW_STATUS = {
  in_review: { label: 'En revisión', cls: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' },
  rejected:  { label: 'Rechazado',   cls: 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400' },
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
              <th className="text-right px-4 py-3 font-medium">Impresiones</th>
              <th className="text-right px-4 py-3 font-medium">Clicks</th>
              <th className="text-right px-4 py-3 font-medium">CTR</th>
              <th className="text-right px-4 py-3 font-medium">CPC Prom.</th>
              <th className="text-right px-5 py-3 font-medium">Conversiones</th>
            </tr>
          </thead>
          <tbody>
            {campaigns.map((c, i) => {
              const status = CAMPAIGN_STATUS[c.status] ?? { label: c.status ?? '—', cls: 'bg-gray-100 dark:bg-gray-700 text-gray-500' }
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

// ── Anuncios (chat cards) ─────────────────────────────────────────────────────

const AD_METRICS = [
  { key: 'impressions', label: 'Impresiones', get: a => a.impressions, fmt: fmtK },
  { key: 'cost',        label: 'Gasto',       get: a => a.cost,        fmt: fmtUSD },
  { key: 'clicks',      label: 'Clics',       get: a => a.clicks,      fmt: fmtK },
  { key: 'ctr',         label: 'CTR',         get: a => a.ctr,         fmt: fmtPct },
  { key: 'conversions', label: 'Conversiones', get: a => a.conversions, fmt: fmtNum },
  { key: 'cpa',         label: 'Costo por conversión', get: a => (a.conversions > 0 ? a.cost / a.conversions : null), fmt: fmtUSD, lowerIsBetter: true },
]

const maxBy = (ads, get) => ads.reduce((best, a) => (get(a) > 0 && (!best || get(a) > get(best)) ? a : best), null)?.id

function ChatGptAds({ ads }) {
  if (!ads || ads.length === 0) return null

  const bestImpId = maxBy(ads, a => a.impressions)
  const bestCtrId = maxBy(ads, a => a.ctr)

  return (
    <AdsBrowser ads={ads} metrics={AD_METRICS} defaultSort="impressions"
      gridClass="grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
      renderThumb={ad => (ad.thumbnailUrl
        ? <img src={ad.thumbnailUrl} alt="" referrerPolicy="no-referrer"
            className="w-10 h-10 rounded object-cover border border-gray-200 dark:border-gray-700" />
        : null)}
      renderCard={ad => {
        const badges = []
        if (ad.id === bestImpId) badges.push({ label: 'Más impresiones', cls: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300' })
        if (ad.id === bestCtrId) badges.push({ label: 'Mejor CTR',       cls: 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300' })
        const review = REVIEW_STATUS[ad.reviewStatus]
        return (
          <div className="flex flex-col gap-2 border border-gray-100 dark:border-gray-700 rounded-lg p-3 bg-gray-50 dark:bg-gray-800/50">
            <div className="flex items-center justify-between gap-2">
              {review
                ? <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${review.cls}`}>{review.label}</span>
                : <span />}
              <div className="flex flex-wrap gap-1 justify-end">
                {badges.map(b => (
                  <span key={b.label} className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${b.cls}`}>{b.label}</span>
                ))}
              </div>
            </div>
            {/* Preview de la "chat card": imagen + título + cuerpo, como se ve en la conversación */}
            {ad.thumbnailUrl && (
              <img src={ad.thumbnailUrl} alt="" referrerPolicy="no-referrer"
                className="w-full h-28 rounded-lg object-cover border border-gray-200 dark:border-gray-700" />
            )}
            {ad.headline
              ? (
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-100 line-clamp-2" title={ad.headline}>{ad.headline}</p>
                  {ad.description && <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 mt-0.5">{ad.description}</p>}
                </div>
              )
              : (
                <p className="text-sm text-gray-700 dark:text-gray-300 truncate" title={ad.name}>{ad.name || 'Anuncio'}</p>
              )}
            {ad.campaignName && <p className="text-[10px] text-gray-400 truncate"><Icon as={Folder} size={12} className="inline align-[-2px] mr-1" />{ad.campaignName}</p>}
            <div className="grid grid-cols-4 gap-x-2 text-[11px] text-gray-500 dark:text-gray-400 border-t border-gray-100 dark:border-gray-700 pt-2 mt-auto">
              <span title="Impresiones"><Icon as={Megaphone} size={12} className="inline align-[-2px] mr-1" />{fmtK(ad.impressions)}</span>
              <span title="Clics"><Icon as={MousePointerClick} size={12} className="inline align-[-2px] mr-1" />{fmtK(ad.clicks)}</span>
              <span title="CTR">{fmtPct(ad.ctr)}</span>
              <span title="Gasto"><Icon as={DollarSign} size={12} className="inline align-[-2px] mr-1" />{fmtUSD(ad.cost)}</span>
            </div>
          </div>
        )
      }} />
  )
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function ChatGptAdsTab({ projectId, onSelectProject, projects = [] }) {
  const objectives = useObjectiveProgress(projectId).filter(o => o.category === 'ads' && o.detail?.platform === 'chatgpt_ads')
  const [integration, setIntegration] = useState(null)
  const [initLoading, setInitLoading] = useState(true)
  const [data,        setData]        = useState(null)
  const [datePreset,  setDatePreset]  = useState('this_month')
  const [dataLoading, setDataLoading] = useState(false)
  const [error,       setError]       = useState(null)
  const [errorCode,   setErrorCode]   = useState(null)
  const [disconnecting, setDisconnecting] = useState(false)
  const [savingSnap,  setSavingSnap]  = useState(false)
  const [snapSaved,   setSnapSaved]   = useState(false)

  const loadIntegration = useCallback(async () => {
    if (!projectId) return null
    try {
      const res = await api.get(`/marketing/projects/${projectId}/integrations`)
      return res.data.find(i => i.type === 'chatgpt_ads') ?? null
    } catch { return null }
  }, [projectId])

  const loadData = useCallback(async (preset) => {
    setDataLoading(true)
    setError(null)
    setErrorCode(null)
    try {
      const res = await api.get(`/marketing/projects/${projectId}/chatgpt-ads`, {
        params: { datePreset: preset },
      })
      setData(res.data)
    } catch (err) {
      setError(err.response?.data?.error || 'Error al cargar datos de ChatGPT Ads.')
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
      if (intg?.status === 'active') loadData(datePreset)
    })
  }, [projectId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handlePresetChange(preset) {
    setDatePreset(preset)
    await loadData(preset)
  }

  async function handleConnected() {
    const intg = await loadIntegration()
    setIntegration(intg)
    setError(null)
    setErrorCode(null)
    if (intg?.status === 'active') loadData(datePreset)
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
      await api.post(`/marketing/projects/${projectId}/ads-snapshots`, { month, type: 'chatgpt_ads' })
      setSnapSaved(true)
      setTimeout(() => setSnapSaved(false), 3000)
    } catch (err) {
      alert(err.response?.data?.error || 'Error al guardar snapshot')
    } finally {
      setSavingSnap(false)
    }
  }

  async function handleDisconnect() {
    if (!window.confirm('¿Desconectar la cuenta de ChatGPT Ads de este proyecto?')) return
    setDisconnecting(true)
    try {
      await api.delete(`/marketing/projects/${projectId}/integrations/chatgpt_ads`)
      setIntegration(null); setData(null)
    } catch (err) {
      alert(err.response?.data?.error || 'No se pudo desconectar.')
    } finally { setDisconnecting(false) }
  }

  if (!projectId) {
    return (
      <CrossProjectAdsPanel
        type="chatgpt_ads"
        label="ChatGPT Ads"
        activeBtnClass="bg-emerald-600 text-white"
        spinnerBorderClass="border-emerald-600"
        onSelectProject={onSelectProject}
      />
    )
  }

  if (initLoading) return <FunLoader messages={CHATGPT_ADS_LOADING_MESSAGES} />

  // Sin integración → prompt de conexión
  if (!integration) return <ConnectPrompt projectId={projectId} onConnected={handleConnected} />
  // API key revocada o inválida: se reconecta pegando una nueva.
  if (integration.status === 'expired' || errorCode === 'TOKEN_EXPIRED') return (
    <ExpiredNotice brand={BRAND}>
      {apiKeyMethod(projectId, handleConnected, 'Reconectar con una API key nueva')}
    </ExpiredNotice>
  )

  const presetLabel = DATE_PRESETS.find(p => p.key === datePreset)?.label ?? datePreset

  return (
    <div className="space-y-4">

      <AccountHeader brand={BRAND} integration={integration} name={data?.accountName || 'ChatGPT Ads'}
        subtitle={<>
          {integration.propertyId && <>Cuenta {integration.propertyId}</>}
          {data?.currency && <> · {data.currency}</>}
          {data?.timezone && <> · {data.timezone}</>}
        </>}
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
                ? 'bg-emerald-600 text-white'
                : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-emerald-300 dark:hover:border-emerald-700'
            }`}
          >
            {p.label}
          </button>
        ))}
        {dataLoading && (
          <div className="w-4 h-4 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin ml-2" />
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
          <KpiCard label="Gasto total"  value={fmtUSD(data.cost)}      sub={presetLabel} />
          <KpiCard label="Impresiones"  value={fmtK(data.impressions)} sub="veces mostrado" />
          <KpiCard label="Clicks"       value={fmtK(data.clicks)}      sub="total" />
          <KpiCard
            label="CTR"
            value={fmtPct(data.ctr)}
            sub="click-through rate"
            valueClass={
              data.ctr >= 5   ? 'text-green-600 dark:text-green-400' :
              data.ctr >= 2   ? 'text-yellow-600 dark:text-yellow-400' :
              data.ctr > 0    ? 'text-red-600 dark:text-red-400' : ''
            }
          />
          <KpiCard label="CPC Promedio" value={fmtUSD(data.avgCpc)}    sub="costo por click" />
          {/* Las conversiones salen de un endpoint aparte: sin píxel ni eventos
              configurados no hay dato (null), que no es lo mismo que 0. */}
          <KpiCard
            label="Conversiones"
            value={data.conversions != null ? fmtNum(data.conversions) : '—'}
            sub={data.conversions == null ? 'sin eventos configurados' : 'total'}
          />
        </div>
      )}

      {/* Ventas atribuidas (evento order_created): solo si la cuenta las mide */}
      {data?.websitePurchaseValue != null && (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 flex items-center gap-4 flex-wrap text-sm">
          <Icon as={Target} size={18} className="text-emerald-600 dark:text-emerald-400" />
          <span className="text-gray-600 dark:text-gray-300">
            Ventas atribuidas: <strong className="text-gray-900 dark:text-white">{fmtUSD(data.websitePurchaseValue)}</strong>
            {data.websitePurchases != null && <> en {fmtNum(data.websitePurchases)} compras</>}
          </span>
          {data.roas != null && (
            <span className="text-gray-500 dark:text-gray-400">ROAS {data.roas}x</span>
          )}
        </div>
      )}

      {/* Objetivos de ChatGPT Ads del proyecto */}
      <ObjectiveProgressBars objectives={objectives} title="Objetivos de ChatGPT Ads" />

      {/* Análisis con IA: diagnóstico + ideas de anuncios nuevos */}
      <AdsAdvisorPanel
        projectId={projectId}
        projectName={projects.find(p => String(p.id) === String(projectId))?.name}
        platform="chatgpt_ads"
        datePreset={datePreset}
      />

      {/* Anuncios, todos con orden y filtros */}
      {data && <ChatGptAds ads={data.ads ?? data.topAds} />}

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
