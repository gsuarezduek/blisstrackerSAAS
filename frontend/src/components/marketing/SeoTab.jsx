import { useState, useEffect } from 'react'
import api from '../../api/client'
import { useGoogleIntegration } from '../../hooks/useGoogleIntegration'
import DomainRatingCard from './seo/DomainRatingCard'
import CrossProjectSeoPanel from './seo/CrossProjectSeoPanel'
import DeviceBar from './seo/DeviceBar'
import GscErrorPanel from './seo/GscErrorPanel'
import CreateTaskModal from './seo/CreateTaskModal'
import AiInsightsPanel from './seo/AiInsightsPanel'
import { TopQueriesTable, OpportunityPagesTable, TopPagesTable, TopCountriesTable } from './seo/SeoLiveTables'
import KeywordsSparklineTable from './seo/KeywordsSparklineTable'
import { fmtNum, fmtPct, fmtPos, currentMonthStr, prevMonthStr, nextMonthStr, monthLabel } from './seo/seoHelpers'

// ─── Componente principal ─────────────────────────────────────────────────────
export default function SeoTab({ projectId, projects, onSelectProject }) {
  const projectName = projects?.find(p => p.id === projectId)?.name ?? ''

  // Modo: 'live' | 'YYYY-MM'
  const [mode,       setMode]       = useState('live')
  const [snapMonth,  setSnapMonth]  = useState(prevMonthStr(currentMonthStr()))

  // Live data
  const [liveData,    setLiveData]    = useState(null)
  const [liveLoading, setLiveLoading] = useState(false)
  const [liveError,   setLiveError]   = useState(null)

  // Integraciones Google — hook compartido para reconectar/editar Site URL inline
  const {
    connect: connectGoogle,
    savePropertyId,
    loading: integLoading,
    propSaving: integSaving,
  } = useGoogleIntegration(projectId, { enabled: true })

  // Reload trigger — incrementar para refetch de Search Console tras reconectar/cambiar Site URL
  const [reloadTick, setReloadTick] = useState(0)
  const [siteUrlInput, setSiteUrlInput] = useState(null)  // null = oculto, string = mostrando input

  // Snapshot data
  const [snap,       setSnap]       = useState(null)
  const [snapLoad,   setSnapLoad]   = useState(false)
  const [snapNotFound, setSnapNotFound] = useState(false)
  const [saving,     setSaving]     = useState(false)

  // AI insights
  const [aiData,     setAiData]     = useState(null)
  const [aiLoading,  setAiLoading]  = useState(false)
  const [aiError,    setAiError]    = useState(null)
  const [aiCooldown, setAiCooldown] = useState(0)

  // Keywords history (sparklines) — siempre
  const [kwHistory,  setKwHistory]  = useState(null)

  // Tarea modal
  const [taskModal,  setTaskModal]  = useState(null)

  const today = new Date()
  const liveEnd   = today.toISOString().slice(0, 10)
  const liveStart = new Date(today.getFullYear(), today.getMonth() - 1, today.getDate()).toISOString().slice(0, 10)

  // ── Fetch live data ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!projectId) return
    const ctrl = new AbortController()
    setLiveLoading(true)
    setLiveError(null)
    setLiveData(null)
    api.get(`/marketing/projects/${projectId}/search-console`, {
      params: { startDate: liveStart, endDate: liveEnd, compare: 'true' },
      signal: ctrl.signal,
    })
      .then(r => setLiveData(r.data))
      .catch(err => {
        if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return
        const data = err.response?.data ?? {}
        const status = data.status
        const code   = data.code
        const knownTypes = ['no_site_url', 'no_integration', 'no_access', 'revoked', 'bad_url', 'api_disabled']
        setLiveError({
          type: knownTypes.includes(status) ? status : 'generic',
          code,
          siteUrl: data.siteUrl ?? null,
          msg: data.error ?? 'Error al cargar datos de Search Console.',
        })
      })
      .finally(() => setLiveLoading(false))
    return () => ctrl.abort()
  }, [projectId, reloadTick])

  // ── Fetch AI insights ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!projectId) return
    const ctrl = new AbortController()
    api.get(`/marketing/projects/${projectId}/seo/ai-insights`, { signal: ctrl.signal })
      .then(r => { setAiData(r.data.insight); setAiCooldown(r.data.cooldownRemaining ?? 0) })
      .catch(err => { if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return })
    return () => ctrl.abort()
  }, [projectId])

  // ── Fetch snapshot cuando cambia mes ─────────────────────────────────────────
  useEffect(() => {
    if (!projectId || mode === 'live') return
    const ctrl = new AbortController()
    setSnapLoad(true)
    setSnap(null)
    setSnapNotFound(false)
    api.get(`/marketing/projects/${projectId}/seo/snapshot/${snapMonth}`, { signal: ctrl.signal })
      .then(r => setSnap(r.data))
      .catch(err => {
        if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return
        if (err.response?.status === 404) setSnapNotFound(true)
      })
      .finally(() => setSnapLoad(false))
    return () => ctrl.abort()
  }, [projectId, snapMonth, mode])

  // ── Fetch keyword history (sparklines) ───────────────────────────────────────
  useEffect(() => {
    if (!projectId) return
    const ctrl = new AbortController()
    api.get(`/marketing/projects/${projectId}/keywords/history-batch`, {
      params: { months: 6 }, signal: ctrl.signal,
    })
      .then(r => setKwHistory(r.data))
      .catch(err => { if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return })
    return () => ctrl.abort()
  }, [projectId])

  async function generateAiInsights() {
    setAiLoading(true)
    setAiError(null)
    try {
      const { data: r } = await api.post(`/marketing/projects/${projectId}/seo/ai-insights`)
      setAiData(r.insight)
      setAiCooldown(r.cooldownRemaining ?? 60)
    } catch (err) {
      const d = err.response?.data
      if (d?.waitMins) { setAiCooldown(d.waitMins); setAiError(`Esperá ${d.waitMins} min antes de regenerar.`) }
      else setAiError(d?.error ?? 'Error al generar análisis')
    } finally { setAiLoading(false) }
  }

  async function handleSaveSnapshot() {
    setSaving(true)
    try {
      const { data } = await api.post(`/marketing/projects/${projectId}/seo/snapshots`, { month: snapMonth })
      setSnap(data)
      setSnapNotFound(false)
    } catch (err) {
      alert(err.response?.data?.error ?? 'No se pudo guardar el snapshot')
    } finally { setSaving(false) }
  }

  // ── Helpers de snapshot ───────────────────────────────────────────────────────
  const snapDevices = snap?.devices
    ? (typeof snap.devices === 'string' ? JSON.parse(snap.devices) : snap.devices)
    : null

  if (!projectId) {
    return <CrossProjectSeoPanel onSelectProject={onSelectProject} />
  }

  const isLive = mode === 'live'

  // ── KPIs a mostrar ────────────────────────────────────────────────────────────
  const kpis = isLive
    ? liveData?.overview
      ? [
          { label: 'Clicks',         value: fmtNum(liveData.overview.clicks)       },
          { label: 'Impresiones',    value: fmtNum(liveData.overview.impressions)  },
          { label: 'CTR promedio',   value: fmtPct(liveData.overview.ctr)          },
          { label: 'Posición media', value: fmtPos(liveData.overview.position), sub: 'más bajo = mejor' },
        ]
      : null
    : snap
      ? [
          { label: 'Clicks',         value: fmtNum(snap.clicks)       },
          { label: 'Impresiones',    value: fmtNum(snap.impressions)  },
          { label: 'CTR promedio',   value: fmtPct(snap.ctr)          },
          { label: 'Posición media', value: fmtPos(snap.avgPosition), sub: 'más bajo = mejor' },
        ]
      : null

  const devicesData = isLive ? liveData?.devices : snapDevices

  return (
    <div className="space-y-4">

      {/* ── Selector de modo ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2 rounded-xl border border-gray-200 dark:border-gray-600 overflow-hidden text-sm">
          <button
            onClick={() => setMode('live')}
            className={`px-4 py-2 transition-colors ${
              isLive
                ? 'bg-primary-600 text-white font-medium'
                : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
          >
            En vivo · 30 días
          </button>
          <button
            onClick={() => setMode('month')}
            className={`px-4 py-2 transition-colors ${
              !isLive
                ? 'bg-primary-600 text-white font-medium'
                : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
          >
            Historial
          </button>
        </div>

        {/* Selector de mes (visible solo en modo historial) */}
        {!isLive && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => setSnapMonth(m => prevMonthStr(m))}
              className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors text-xs"
            >◀</button>
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300 min-w-[80px] text-center">
              {monthLabel(snapMonth)}
            </span>
            <button
              onClick={() => setSnapMonth(m => nextMonthStr(m))}
              disabled={snapMonth >= currentMonthStr()}
              className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-xs"
            >▶</button>
          </div>
        )}
      </div>

      {/* ── Domain Rating (Ahrefs) — independiente de GSC ────────────────────── */}
      <DomainRatingCard projectId={projectId} />

      {/* ── Error (modo live) ────────────────────────────────────────────────── */}
      {isLive && liveError && (
        <GscErrorPanel
          error={liveError}
          loading={integLoading.google_search_console}
          saving={integSaving.google_search_console}
          siteUrlInput={siteUrlInput}
          setSiteUrlInput={setSiteUrlInput}
          onReconnect={async () => {
            const res = await connectGoogle('google_search_console', { forceOAuth: true })
            if (res?.ok) setReloadTick(t => t + 1)
          }}
          onSaveSiteUrl={async value => {
            const res = await savePropertyId('google_search_console', value.trim())
            if (res?.ok) {
              setSiteUrlInput(null)
              setReloadTick(t => t + 1)
            }
            return res
          }}
        />
      )}

      {/* ── Loading ──────────────────────────────────────────────────────────── */}
      {((isLive && liveLoading) || (!isLive && snapLoad)) && (
        <div className="flex items-center justify-center py-12">
          <div className="w-7 h-7 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* ── Snapshot no encontrado ───────────────────────────────────────────── */}
      {!isLive && snapNotFound && !snapLoad && (
        <div className="bg-white dark:bg-gray-800 border border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-8 text-center">
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
            No hay snapshot guardado para <strong>{monthLabel(snapMonth)}</strong>
          </p>
          <button onClick={handleSaveSnapshot} disabled={saving}
            className="px-4 py-2 bg-primary-600 hover:bg-primary-700 disabled:opacity-60 text-white rounded-xl text-sm font-medium transition-colors">
            {saving ? 'Guardando…' : 'Guardar snapshot ahora'}
          </button>
          <p className="text-xs text-gray-400 mt-2">Requiere Google Search Console conectado y activo</p>
        </div>
      )}

      {/* ── Contenido principal ──────────────────────────────────────────────── */}
      {kpis && !liveLoading && !snapLoad && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {kpis.map(k => (
              <div key={k.label} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{k.label}</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{k.value}</p>
                {k.sub && <p className="text-xs text-gray-400 mt-0.5">{k.sub}</p>}
              </div>
            ))}
          </div>

          {/* Dispositivos */}
          {devicesData && <DeviceBar devices={devicesData} />}

          {/* ── Contenido exclusivo del modo live ──────────────────────────── */}
          {isLive && liveData && (
            <>
              {/* AI Insights */}
              <AiInsightsPanel
                aiData={aiData} aiLoading={aiLoading} aiError={aiError} aiCooldown={aiCooldown}
                onGenerate={generateAiInsights} onCreateTask={setTaskModal}
              />

              {/* Top consultas */}
              {liveData.topQueries?.length > 0 && (
                <TopQueriesTable
                  topQueries={liveData.topQueries} topQueriesComparison={liveData.topQueriesComparison}
                  startDate={liveStart} endDate={liveEnd} projectId={projectId}
                />
              )}

              {/* Oportunidades de CTR */}
              {liveData.opportunityPages?.length > 0 && (
                <OpportunityPagesTable opportunityPages={liveData.opportunityPages} onCreateTask={setTaskModal} />
              )}

              {/* Top páginas */}
              {liveData.topPages?.length > 0 && (
                <TopPagesTable topPages={liveData.topPages} />
              )}

              {/* Top países */}
              {liveData.countries?.length > 0 && (
                <TopCountriesTable countries={liveData.countries} />
              )}

              {liveData.siteUrl && (
                <p className="text-xs text-gray-400 text-right">
                  Sitio: <span className="font-mono">{liveData.siteUrl}</span>
                  {' · '}{liveStart} → {liveEnd}
                </p>
              )}
            </>
          )}

          {/* ── Botón actualizar snapshot (modo historial) ───────────────────── */}
          {!isLive && snap && (
            <div className="flex justify-end">
              <button onClick={handleSaveSnapshot} disabled={saving}
                className="text-xs text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 border border-gray-200 dark:border-gray-600 hover:border-primary-400 rounded-lg px-3 py-1.5 transition-all disabled:opacity-50">
                {saving ? 'Actualizando…' : 'Actualizar snapshot'}
              </button>
            </div>
          )}
        </>
      )}

      {/* ── Keywords con sparklines (siempre visibles) ───────────────────────── */}
      {kwHistory?.keywords?.length > 0 && (
        <KeywordsSparklineTable kwHistory={kwHistory} />
      )}

      {/* Modal tarea */}
      {taskModal && (
        <CreateTaskModal title={taskModal.title} projectId={projectId}
          projectName={projectName} onClose={() => setTaskModal(null)} />
      )}
    </div>
  )
}
