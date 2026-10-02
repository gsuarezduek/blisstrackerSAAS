import { useState, useEffect, useCallback } from 'react'
import api from '../../api/client'
import SocialIcon from './SocialIcon'
import RrssAdvisorPanel from './RrssAdvisorPanel'
import { BRANDS } from './networks/brands'
import { fmtNum, fmtK, engColor, engLabel, subtractDays, todayAR, monthLabel, FOLLOWER_FILTERS } from './networks/format'
import { LineChart, MonthNav, KpiCard, AudienceCard, BrandSpinner } from './networks/ui'
import ConnectScreen, { OAuthMethod, ExpiredNotice } from './networks/ConnectScreen'
import AccountHeader from './networks/AccountHeader'
import CrossProjectNetworkPanel from './networks/CrossProjectNetworkPanel'
import { CircleHelp, Eye, Heart, MessageCircle } from 'lucide-react'
import { Icon } from '../ui/Icon'

const BRAND = BRANDS.linkedin
const LI_BLUE = BRAND.color

const authUrl = projectId => () =>
  api.get('/marketing/integrations/linkedin/auth-url', { params: { projectId } }).then(r => r.data.url)

// Para Company Pages propias el único método es la API oficial: sin login,
// LinkedIn no expone posts ni engagement (el scraping queda para competidores).
function ConnectPrompt({ projectId, onConnected }) {
  return (
    <ConnectScreen brand={BRAND} title="Conectá la página de empresa de LinkedIn"
      subtitle="Seguidores, impresiones, clicks, CTR, engagement de posts y datos de la audiencia."
      methods={[{
        key: 'official', title: 'Conexión oficial',
        description: 'Iniciá sesión con LinkedIn. Tenés que ser administrador de la página.',
        body: <OAuthMethod brand={BRAND} getAuthUrl={authUrl(projectId)} onConnected={onConnected} cta="Conectar con LinkedIn" />,
      }]}
    />
  )
}

// ── Selector de organización (post-OAuth) ─────────────────────────────────────
function OrgPicker({ projectId, onSelected, onCancel }) {
  const [orgs, setOrgs]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState(null)

  useEffect(() => {
    api.get(`/marketing/projects/${projectId}/linkedin/orgs`)
      .then(r => setOrgs(r.data.orgs ?? []))
      .catch(err => setError(err.response?.data?.error || 'No se pudieron listar tus páginas de LinkedIn.'))
      .finally(() => setLoading(false))
  }, [projectId])

  async function handleSelect(orgId) {
    setSaving(true)
    try {
      await api.patch(`/marketing/projects/${projectId}/integrations/linkedin`, { propertyId: orgId })
      onSelected()
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo guardar la selección.')
    } finally { setSaving(false) }
  }

  if (loading) return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-8 text-center">
      <div className="inline-block w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: `${LI_BLUE} transparent ${LI_BLUE} ${LI_BLUE}` }} />
      <p className="text-sm text-gray-500 dark:text-gray-400 mt-3">Buscando tus páginas de LinkedIn…</p>
    </div>
  )

  if (error) return (
    <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl p-6">
      <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
      <button onClick={onCancel} className="text-xs text-gray-500 dark:text-gray-400 hover:underline mt-3">Volver</button>
    </div>
  )

  if (!orgs?.length) return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-8 text-center">
      <p className="mb-3"><Icon as={CircleHelp} size={28} className="inline-block text-gray-300 dark:text-gray-600" /></p>
      <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">No administrás ninguna página de empresa</p>
      <p className="text-xs text-gray-500 dark:text-gray-400 max-w-sm mx-auto">Necesitás tener rol de administrador en al menos una Company Page de LinkedIn.</p>
      <button onClick={onCancel} className="text-xs text-gray-500 dark:text-gray-400 hover:underline mt-4">Volver</button>
    </div>
  )

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
      <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-1">Elegí la página de empresa</h3>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Detectamos las páginas donde sos administrador. Seleccioná la que querés trackear en este proyecto.</p>
      <div className="space-y-2">
        {orgs.map(org => (
          <button key={org.id} onClick={() => handleSelect(org.id)} disabled={saving}
            className="w-full flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700/50 hover:bg-blue-50 dark:hover:bg-blue-900/20 border border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-700 rounded-xl transition-colors disabled:opacity-50">
            {org.logoUrl
              ? <img src={org.logoUrl} alt="" className="w-10 h-10 rounded-lg object-cover bg-white border border-gray-200" />
              : <div className="w-10 h-10 rounded-lg flex items-center justify-center text-white" style={{ background: LI_BLUE }}><SocialIcon network="linkedin" className="w-5 h-5" /></div>
            }
            <div className="text-left flex-1 min-w-0">
              <p className="font-medium text-sm text-gray-900 dark:text-white truncate">{org.name ?? '(sin nombre)'}</p>
              {org.vanityName && <p className="text-xs text-gray-500 dark:text-gray-400 truncate">linkedin.com/company/{org.vanityName}</p>}
            </div>
            <span className="text-xs text-blue-600 dark:text-blue-400 font-medium shrink-0">Elegir →</span>
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Top posts del mes ─────────────────────────────────────────────────────────
function TopPosts({ posts }) {
  if (!posts?.length) return null
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5">
      <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">TOP posts del mes</p>
      <div className="space-y-2">
        {posts.slice(0, 5).map((p, i) => (
          <a key={p.id ?? i} href={p.url ?? '#'} target="_blank" rel="noopener noreferrer"
            className="block p-3 bg-gray-50 dark:bg-gray-700/40 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors">
            <div className="flex items-start gap-3">
              <span className="w-6 h-6 shrink-0 rounded-full bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200 text-xs font-bold flex items-center justify-center">{i + 1}</span>
              <div className="flex-1 min-w-0">
                {p.text && <p className="text-xs text-gray-700 dark:text-gray-300 line-clamp-2 mb-1.5">{p.text}</p>}
                <div className="flex gap-3 text-[11px] text-gray-500 dark:text-gray-400">
                  {p.impressions != null && <span><Icon as={Eye} size={12} className="inline align-[-2px] mr-1" />{fmtK(p.impressions)}</span>}
                  {p.likes       != null && <span><Icon as={Heart} size={12} className="inline align-[-2px] mr-1" />{fmtK(p.likes)}</span>}
                  {p.comments    != null && <span><Icon as={MessageCircle} size={12} className="inline align-[-2px] mr-1" />{fmtK(p.comments)}</span>}
                  {p.shares      != null && <span>↗ {fmtK(p.shares)}</span>}
                </div>
              </div>
            </div>
          </a>
        ))}
      </div>
    </div>
  )
}

// ── Demographics ──────────────────────────────────────────────────────────────
const URN_LABELS = {
  // No tenemos catálogo completo de URNs (LinkedIn los mantiene en su propio sistema)
  // Mostramos el último segmento del URN como label fallback
}

function urnLabel(urn) {
  if (!urn) return '—'
  if (typeof urn !== 'string') return String(urn)
  if (URN_LABELS[urn]) return URN_LABELS[urn]
  const last = urn.split(':').pop()
  return last?.replace(/_/g, ' ') ?? urn
}

function DemographicsCard({ title, items }) {
  if (!items?.length) return null
  const total = items.reduce((s, x) => s + x.count, 0)
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
      <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-3">{title}</p>
      <div className="space-y-2">
        {items.slice(0, 5).map((item, i) => {
          const pct = Math.round((item.count / total) * 100)
          return (
            <div key={i} className="flex items-center gap-2 text-xs">
              <span className="flex-1 truncate text-gray-700 dark:text-gray-300 capitalize">{item.label || urnLabel(item.urn)}</span>
              <div className="w-20 bg-gray-100 dark:bg-gray-700 rounded-full h-1.5 overflow-hidden">
                <div className="h-1.5" style={{ width: `${pct}%`, background: LI_BLUE }} />
              </div>
              <span className="text-gray-500 dark:text-gray-400 tabular-nums w-8 text-right">{pct}%</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Demographics({ demographics }) {
  if (!demographics) return null
  const empty = !demographics.industry?.length && !demographics.seniority?.length && !demographics.function?.length && !demographics.region?.length
  if (empty) return null
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5">
      <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Audiencia</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <DemographicsCard title="Industria" items={demographics.industry}  />
        <DemographicsCard title="Seniority" items={demographics.seniority} />
        <DemographicsCard title="Función" items={demographics.function}  />
        <DemographicsCard title="Región" items={demographics.region}    />
      </div>
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function LinkedinTab({ projectId, onSelectProject, projects = [] }) {
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
  const [showOrgPicker,       setShowOrgPicker]   = useState(false)
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
      const li = intgsRes.data.find(i => i.type === 'linkedin')
      setIntegration(li ?? null)
      if (!li) { setLoading(false); return }

      // Sin organización seleccionada → forzar picker
      if (!li.propertyId) { setShowOrgPicker(true); setLoading(false); return }
      setShowOrgPicker(false)

      const today = todayAR()
      const f = FOLLOWER_FILTERS.find(x => x.key === followerFilter)
      const from = f.days ? subtractDays(today, f.days - 1) : undefined
      const logParams = { to: today }
      if (from) logParams.from = from

      const [metricsRes, snapshotsRes, logsRes] = await Promise.allSettled([
        api.get(`/marketing/projects/${projectId}/linkedin`),
        api.get(`/marketing/projects/${projectId}/linkedin/snapshots`),
        api.get(`/marketing/projects/${projectId}/linkedin/followers`, { params: logParams }),
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
      setError(err.response?.data?.error || 'Error al cargar datos de LinkedIn.')
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
      const { data } = await api.get(`/marketing/projects/${projectId}/linkedin/followers`, { params })
      setFollowerLogs(data.logs ?? [])
    } catch { /* silencioso */ }
    finally { setFollowerLoading(false) }
  }, [projectId])

  useEffect(() => { fetchData() }, [fetchData])

  async function handleDisconnect() {
    if (!window.confirm('¿Desconectar la cuenta de LinkedIn de este proyecto?')) return
    setDisconnecting(true)
    try {
      await api.delete(`/marketing/projects/${projectId}/integrations/linkedin`)
      setIntegration(null); setMetrics(null); setSnapshots([]); setShowOrgPicker(false)
    } catch (err) {
      alert(err.response?.data?.error || 'No se pudo desconectar.')
    } finally { setDisconnecting(false) }
  }

  async function handleRefreshScrape() {
    setRefreshing(true); setError(null)
    try {
      await api.post(`/marketing/projects/${projectId}/linkedin/scrape/refresh`)
      await fetchData()
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo actualizar el scraping.')
    } finally { setRefreshing(false) }
  }

  async function handleDeleteSnapshot() {
    if (!window.confirm(`¿Borrar el snapshot de ${monthLabel(selectedMonth)}? También se eliminarán los registros diarios de seguidores de ese mes. No se puede deshacer.`)) return
    setDeletingSnapshot(true)
    try {
      await api.delete(`/marketing/projects/${projectId}/linkedin/snapshots/${selectedMonth}`)
      setSelectedMonth(currentMonth)
      await fetchData()
    } catch (err) {
      alert(err.response?.data?.error || 'No se pudo borrar el snapshot.')
    } finally { setDeletingSnapshot(false) }
  }

  async function handleScrapeDebug() {
    setDebugLoading(true); setDebugError(null); setDebugData(null)
    try {
      const { data } = await api.get(`/marketing/projects/${projectId}/linkedin/scrape-debug`)
      setDebugData(data)
    } catch (err) {
      setDebugError(err.response?.data?.error || 'No se pudo correr el diagnóstico.')
    } finally { setDebugLoading(false) }
  }

  if (!projectId) return (
    <CrossProjectNetworkPanel brand={BRAND} network="linkedin" refreshable onSelectProject={onSelectProject}
      renderSecondary={p => (
        <>
          <span className="text-gray-400">{fmtK(p.followersCount)} seguidores</span>
          {p.impressions    != null && <span className="text-gray-400"><Icon as={Eye} size={12} className="inline align-[-2px] mr-1" />{fmtK(p.impressions)} impr.</span>}
          {p.engagementRate != null && <span className={engColor(p.engagementRate)}>{p.engagementRate.toFixed(2)}% eng.</span>}
          {p.postsThisMonth != null && <span className="text-gray-400">{p.postsThisMonth} posts</span>}
        </>
      )}
    />
  )

  if (loading) return <BrandSpinner brand={BRAND} />

  if (!integration) return <ConnectPrompt projectId={projectId} onConnected={fetchData} />
  if (integration.status === 'expired') return (
    <ExpiredNotice brand={BRAND}>
      <OAuthMethod brand={BRAND} getAuthUrl={authUrl(projectId)} onConnected={fetchData} cta="Reconectar LinkedIn" />
    </ExpiredNotice>
  )

  // Si no hay org seleccionada o el user clickeó "Cambiar página", mostrar picker
  if (showOrgPicker) return (
    <OrgPicker projectId={projectId} onSelected={() => { setShowOrgPicker(false); fetchData() }} onCancel={() => setShowOrgPicker(false)} />
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

      <AccountHeader brand={BRAND} integration={integration}
        avatarUrl={metrics?.org?.logoUrl} name={metrics?.org?.name}
        link={metrics?.org?.vanityName && { href: `https://www.linkedin.com/company/${metrics.org.vanityName}`, label: `linkedin.com/company/${metrics.org.vanityName}` }}
        dataAt={scraped ? metrics?.lastScrapedAt : null}
        actions={scraped
          ? [{ key: 'refresh', label: 'Actualizar', onClick: handleRefreshScrape, busy: refreshing }]
          : [{ key: 'org', label: 'Cambiar página', onClick: () => setShowOrgPicker(true) }]}
        onDisconnect={handleDisconnect} disconnecting={disconnecting} />

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 text-sm text-red-700 dark:text-red-300">{error}</div>
      )}

      {scraped && (
        <div className="bg-blue-50/60 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 rounded-xl px-4 py-3 text-xs text-blue-700 dark:text-blue-300">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <span>Datos públicos vía scraping: seguidores, posts y engagement. Impresiones, clicks y audiencia solo están disponibles con la conexión oficial.</span>
            <button onClick={handleScrapeDebug} disabled={debugLoading}
              className="shrink-0 px-2.5 py-1 rounded-lg border border-blue-300 dark:border-blue-700 hover:bg-blue-100 dark:hover:bg-blue-900/30 disabled:opacity-50 transition-colors font-medium">
              {debugLoading ? 'Diagnosticando…' : 'Diagnóstico'}
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

      {scraped && isCurrentMonth && metrics?.monthCoverageComplete === false && (
        <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-xl px-4 py-3 text-xs text-amber-700 dark:text-amber-300">
          Esta página puede postear más de lo que se pudo traer este mes — el engagement/posts del mes podrían estar subestimados. Corré el diagnóstico o subí el tope de posts en SuperAdmin → Configuración.
        </div>
      )}

      {availableMonths.length > 0 && (
        <MonthNav selectedMonth={selectedMonth} availableMonths={availableMonths} onChange={setSelectedMonth}
          canDelete={canDeleteSnapshot} onDelete={handleDeleteSnapshot} deleting={deletingSnapshot} />
      )}

      {displayData && (
        <div className={`grid grid-cols-2 sm:grid-cols-3 gap-3 ${scraped ? 'lg:grid-cols-3' : 'lg:grid-cols-5'}`}>
          <AudienceCard count={displayData.followersCount} monthlyGain={monthlyGain} />
          <KpiCard label="Engagement"
            value={displayData.engagementRate != null ? `${displayData.engagementRate}%` : '—'}
            valueClass={engColor(displayData.engagementRate)}
            sub={engLabel(displayData.engagementRate)}
          />
          {!scraped && (
            <KpiCard label="Impresiones"
              value={displayData.impressions != null ? fmtK(displayData.impressions) : '—'}
              sub={isCurrentMonth ? 'este mes' : 'ese mes'}
            />
          )}
          {!scraped && (
            <KpiCard label="Clicks"
              value={displayData.clicks != null ? fmtK(displayData.clicks) : '—'}
              sub={displayData.ctr != null ? `${displayData.ctr}% CTR` : null}
            />
          )}
          <KpiCard label="Posts del mes"
            value={displayData.postsThisMonth != null ? fmtNum(displayData.postsThisMonth) : '—'}
            sub={isCurrentMonth ? 'posts este mes' : 'posts ese mes'}
          />
        </div>
      )}

      {/* Análisis con IA: diagnóstico vs. mes anterior, competencia, objetivos y brief orgánico */}
      <RrssAdvisorPanel
        projectId={projectId}
        projectName={projects.find(p => String(p.id) === String(projectId))?.name}
        platform="linkedin"
      />

      {isCurrentMonth && metrics?.topPosts?.length > 0 && <TopPosts posts={metrics.topPosts} />}
      {!isCurrentMonth && Array.isArray(displayData?.topPosts) && displayData.topPosts.length > 0 && <TopPosts posts={displayData.topPosts} />}

      {isCurrentMonth && metrics?.demographics && <Demographics demographics={metrics.demographics} />}
      {!isCurrentMonth && displayData?.demographics && <Demographics demographics={displayData.demographics} />}

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
                <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">Evolución de seguidores</p>
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
                        style={followerFilter === f.key ? { backgroundColor: LI_BLUE } : {}}
                      >{f.label}</button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            {followerLoading
              ? <div className="flex justify-center py-10"><div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: `${LI_BLUE} transparent ${LI_BLUE} ${LI_BLUE}` }} /></div>
              : hasChart
                ? <LineChart data={chartData} valueAccessor={d => d.followersCount} labelAccessor={d => snapshotFallback ? d.date?.slice(0, 7) : d.date?.slice(5)} color={LI_BLUE} formatY={v => fmtK(Math.round(v))} chartHeight={160} displayHeight={180} bare />
                : <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">Recopilando información, pronto vas a poder ver la evolución de seguidores.</p>
            }
          </div>
        )
      })()}
    </div>
  )
}
