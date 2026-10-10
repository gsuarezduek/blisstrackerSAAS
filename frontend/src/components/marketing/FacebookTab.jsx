import { useState, useEffect, useCallback } from 'react'
import api from '../../api/client'
import RrssAdvisorPanel from './RrssAdvisorPanel'
import { BRANDS } from './networks/brands'
import { fmtNum, fmtK, engColor, engLabel, subtractDays, todayAR, monthLabel, FOLLOWER_FILTERS } from './networks/format'
import { LineChart, MonthNav, KpiCard, AudienceCard, BrandSpinner } from './networks/ui'
import ConnectScreen, { TokenMethod, ScrapeMethod, ExpiredNotice } from './networks/ConnectScreen'
import AccountHeader from './networks/AccountHeader'
import CrossProjectNetworkPanel from './networks/CrossProjectNetworkPanel'
import { Eye, MessageCircle, ThumbsUp } from 'lucide-react'
import { Icon } from '../ui/Icon'

const BRAND = BRANDS.facebook
const FB_BLUE = BRAND.color

// Tres caminos sobre la misma app de Meta: token de Business Manager (hoy el
// recomendado, no espera el App Review), scraping de datos públicos y el login
// oficial, que se habilita cuando Meta apruebe los permisos de páginas.
function ConnectPrompt({ projectId, onConnected }) {
  return (
    <ConnectScreen brand={BRAND} title="Conectá la página de Facebook" subtitle="Elegí cómo querés traer las métricas."
      methods={[
        {
          key: 'token', title: 'Token de Business Manager', badge: 'recommended',
          description: 'Métricas completas (alcance e impresiones) con un System User Token. No espera la aprobación de Meta.',
          body: (
            <TokenMethod brand={BRAND} accountParam="pageId" onConnected={onConnected}
              endpoint={`/marketing/projects/${projectId}/integrations/facebook/connect-token`}
              steps={<>En <span className="font-mono">business.facebook.com</span> → Configuración del negocio → Usuarios del sistema, generá un token con la página asignada y los permisos <span className="font-mono">pages_show_list</span>, <span className="font-mono">pages_read_engagement</span> y <span className="font-mono">read_insights</span>.</>} />
          ),
        },
        {
          key: 'scrape', title: 'Scraping',
          description: 'Seguidores, posts y engagement de los datos públicos. Sin permisos; no incluye alcance ni impresiones.',
          body: (
            <ScrapeMethod brand={BRAND} onConnected={onConnected}
              endpoint={`/marketing/projects/${projectId}/integrations/facebook/connect-scrape`}
              placeholder="facebook.com/tu-pagina" help="Solo páginas públicas. Pegá la URL de la página o su nombre." />
          ),
        },
        {
          key: 'official', title: 'Conexión oficial', badge: 'soon',
          description: 'Login con Facebook. Se habilita cuando Meta apruebe los permisos de páginas (en revisión).',
        },
      ]}
    />
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
          <a key={p.id ?? i} href={p.permalink ?? p.url ?? '#'} target="_blank" rel="noopener noreferrer"
            className="block p-3 bg-gray-50 dark:bg-gray-700/40 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors">
            <div className="flex items-start gap-3">
              <span className="w-6 h-6 shrink-0 rounded-full bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200 text-xs font-bold flex items-center justify-center">{i + 1}</span>
              <div className="flex-1 min-w-0">
                {p.text && <p className="text-xs text-gray-700 dark:text-gray-300 line-clamp-2 mb-1.5">{p.text}</p>}
                <div className="flex gap-3 text-[11px] text-gray-500 dark:text-gray-400">
                  {p.reach    != null && <span><Icon as={Eye} size={12} className="inline align-[-2px] mr-1" />{fmtK(p.reach)}</span>}
                  {p.likes    != null && <span><Icon as={ThumbsUp} size={12} className="inline align-[-2px] mr-1" />{fmtK(p.likes)}</span>}
                  {p.comments != null && <span><Icon as={MessageCircle} size={12} className="inline align-[-2px] mr-1" />{fmtK(p.comments)}</span>}
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
// Conexión por scraping (Apify) — sin permisos ni OAuth.
// Conexión por System User Token de Business Manager (con picker si hay varias páginas).
// ── Componente principal ──────────────────────────────────────────────────────
export default function FacebookTab({ projectId, onSelectProject, projects = [] }) {
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

  async function handleRefresh() {
    setRefreshing(true); setError(null)
    try {
      if (integration?.scopes === 'scrape') {
        await api.post(`/marketing/projects/${projectId}/facebook/scrape/refresh`)
      } else {
        // Modo oficial/token: fuerza el fetch completo a la Graph API (lento).
        await api.get(`/marketing/projects/${projectId}/facebook`, { params: { refresh: 1 } })
      }
      await fetchData()
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo actualizar.')
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

  if (!projectId) return (
    <CrossProjectNetworkPanel brand={BRAND} network="facebook" refreshable onSelectProject={onSelectProject}
      renderSecondary={p => (
        <>
          <span className="text-gray-400">{fmtK(p.followersCount)} seguidores</span>
          {p.reach          != null && <span className="text-gray-400"><Icon as={Eye} size={12} className="inline align-[-2px] mr-1" />{fmtK(p.reach)} alcance</span>}
          {p.engagementRate != null && <span className={engColor(p.engagementRate)}>{p.engagementRate.toFixed(2)}% eng.</span>}
          {p.postsThisMonth != null && <span className="text-gray-400">{p.postsThisMonth} posts</span>}
        </>
      )}
    />
  )

  if (loading) return <BrandSpinner brand={BRAND} />

  if (!integration) return <ConnectPrompt projectId={projectId} onConnected={fetchData} />
  // Vence el token de página del login oficial; se reconecta con un token de BM
  // (permanente) mientras el login oficial siga en revisión de Meta.
  if (integration.status === 'expired') return (
    <ExpiredNotice brand={BRAND}>
      <TokenMethod brand={BRAND} accountParam="pageId" onConnected={fetchData}
        endpoint={`/marketing/projects/${projectId}/integrations/facebook/connect-token`} />
    </ExpiredNotice>
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
        name={metrics?.page?.name ?? integration?.propertyId}
        profileUrl={integration?.propertyId && `https://www.facebook.com/${integration.propertyId}`}
        dataAt={metrics?.lastScrapedAt}
        actions={[{ key: 'refresh', label: 'Actualizar', onClick: handleRefresh, busy: refreshing }]}
        onDisconnect={handleDisconnect} disconnecting={disconnecting} />

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 text-sm text-red-700 dark:text-red-300">{error}</div>
      )}

      {scraped && (
        <div className="bg-blue-50/60 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 rounded-xl px-4 py-3 text-xs text-blue-700 dark:text-blue-300">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <span>Datos públicos vía scraping: seguidores, posts y engagement. Alcance e impresiones solo están disponibles con la conexión oficial o por token.</span>
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

      {!scraped && isCurrentMonth && displayData?.impressions == null && (
        <div className="bg-amber-50/70 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-xl px-4 py-3 text-xs text-amber-800 dark:text-amber-300">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <span>No se están trayendo las Impresiones. Suele ser el permiso <code className="font-mono">read_insights</code> sin asignar al token, o una métrica deprecada por Meta. Corré el diagnóstico para ver qué responde la Graph API.</span>
            <button onClick={handleInsightsDebug} disabled={debugLoading}
              className="shrink-0 px-2.5 py-1 rounded-lg border border-amber-300 dark:border-amber-700 hover:bg-amber-100 dark:hover:bg-amber-900/30 disabled:opacity-50 transition-colors font-medium">
              {debugLoading ? 'Diagnosticando…' : 'Diagnóstico de insights'}
            </button>
          </div>

          {debugError && <p className="mt-2 text-red-600 dark:text-red-400">{debugError}</p>}

          {debugData?.perMetric && (
            <div className="mt-3 space-y-2">
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-amber-900 dark:text-amber-200 font-medium">
                <span>read_insights: {debugData.tokenInfo?.hasReadInsights === true ? 'sí' : debugData.tokenInfo?.hasReadInsights === false ? 'no' : '—'}</span>
                <span>token válido: {debugData.tokenInfo?.isValid === true ? 'sí' : debugData.tokenInfo?.isValid === false ? 'no' : '—'}</span>
                <span>llamada combinada: {debugData.combined?.ok ? 'ok' : `falló: ${debugData.combined?.error || 'sin detalle'}`}</span>
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
                Si <code className="font-mono">read_insights</code> da «no» → regenerá el System User Token incluyendo ese permiso y asignale la página con acceso a métricas. Si una métrica puntual da error y las otras ✅ → esa está deprecada (ya las pedimos por separado, así no tumba a las demás). Copiá este JSON y pasámelo.
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
          <AudienceCard count={displayData.followersCount} monthlyGain={monthlyGain} />
          <KpiCard label="Engagement"
            value={displayData.engagementRate != null ? `${displayData.engagementRate}%` : '—'}
            valueClass={engColor(displayData.engagementRate)}
            sub={engLabel(displayData.engagementRate)}
          />
          {!scraped && (
            <KpiCard label="Alcance"
              value={displayData.reach != null ? fmtK(displayData.reach) : 'n/d'}
              sub={displayData.reach != null
                ? `orgánico · suma posts · ${isCurrentMonth ? 'este mes' : 'ese mes'}`
                : 'no disponible en la API de Meta'}
            />
          )}
          {!scraped && (
            <KpiCard label="Impresiones"
              value={displayData.impressions != null ? fmtK(displayData.impressions) : '—'}
              sub={`orgánico · ${isCurrentMonth ? 'este mes' : 'ese mes'}`}
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
        platform="facebook"
      />

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
