import { useState, useEffect, useCallback } from 'react'
import api from '../../api/client'
import ObjectiveProgressBars from './ObjectiveProgressBars'
import RrssAdvisorPanel from './RrssAdvisorPanel'
import ConnectPrompt from './InstagramConnect'
import {
  fmtNum, fmtK, engagementColor, engagementLabel, subtractDays, todayAR, monthLabel,
  LineChart, MonthNav, FOLLOWER_FILTERS, FollowersCard, KpiCard,
  ReachHighlight, TopOfMonth, ContentInsights, AccountHeader,
  CrossProjectInstagramPanel, StoriesSection,
} from './InstagramTabParts'

// ── Componente principal ──────────────────────────────────────────────────────

export default function InstagramTab({ projectId, onSelectProject, projects = [] }) {
  const currentMonth = todayAR().slice(0, 7)

  const [integration,    setIntegration]    = useState(null)
  const [metrics,        setMetrics]        = useState(null)
  const [snapshots,      setSnapshots]      = useState([])
  const [objectives,     setObjectives]     = useState([])
  const [selectedMonth,  setSelectedMonth]  = useState(currentMonth)
  const [followerLogs,   setFollowerLogs]   = useState([])
  const [monthStartFollowers, setMonthStartFollowers] = useState(null)
  const [followerFilter, setFollowerFilter] = useState('30d')
  const [followerLoading,setFollowerLoading]= useState(false)
  const [loading,        setLoading]        = useState(false)
  const [error,          setError]          = useState(null)
  const [disconnecting,  setDisconnecting]  = useState(false)
  const [deletingSnapshot, setDeletingSnapshot] = useState(false)
  const [stories,          setStories]          = useState(null)
  const [storiesScrapeOnly, setStoriesScrapeOnly] = useState(false)
  const [capturingStories, setCapturingStories] = useState(false)

  const fetchData = useCallback(async (signal) => {
    if (!projectId) return
    setLoading(true)
    setError(null)
    try {
      const intgsRes = await api.get(`/marketing/projects/${projectId}/integrations`, { signal })
      const ig = intgsRes.data.find(i => i.type === 'instagram')
      setIntegration(ig ?? null)
      if (!ig) { setLoading(false); return }

      const [metricsRes, snapshotsRes, logsRes, objsRes] = await Promise.allSettled([
        api.get(`/marketing/projects/${projectId}/instagram`, { signal }),
        api.get(`/marketing/projects/${projectId}/instagram/snapshots`, { signal }),
        api.get(`/marketing/projects/${projectId}/instagram/followers`, { params: { to: todayAR() }, signal }),
        api.get(`/marketing/projects/${projectId}/objectives/progress`, { signal }),
      ])

      if (metricsRes.status   === 'fulfilled') setMetrics(metricsRes.value.data)
      if (snapshotsRes.status === 'fulfilled') setSnapshots(snapshotsRes.value.data.snapshots ?? [])
      if (objsRes.status      === 'fulfilled') {
        const all = objsRes.value.data.objectives ?? []
        setObjectives(all.filter(o => ['seguidores', 'interaccion'].includes(o.metric) && o.detail?.platform === 'instagram'))
      }
      if (logsRes.status      === 'fulfilled') {
        const logs = logsRes.value.data.logs ?? []
        setFollowerLogs(logs)
        // Baseline de "nuevos del mes" = cierre del mes anterior (último log ANTES del mes):
        // un valor congelado que no se pisa en cada visita. Antes se usaba el primer log
        // del mes, que si era el de hoy quedaba igual al valor actual (nuevos = 0) y encima
        // se sobrescribía en cada carga (de "+3" a "0"). Fallback: el primer log del mes que
        // NO sea el de hoy; si solo existe el de hoy, sin baseline (no se muestra).
        const monthStart = todayAR().slice(0, 7) + '-01'
        const today      = todayAR()
        const before     = logs.filter(l => l.date < monthStart)
        const baseline = before.length
          ? before[before.length - 1].followersCount            // logs asc → último antes del mes
          : (logs.find(l => l.date >= monthStart && l.date < today)?.followersCount ?? null)
        setMonthStartFollowers(baseline)
      }
      if (metricsRes.status === 'rejected' && metricsRes.reason?.code !== 'ERR_CANCELED') {
        setError(metricsRes.reason?.response?.data?.error || 'No se pudieron cargar las métricas.')
      }
    } catch (err) {
      if (err.code === 'ERR_CANCELED' || err.name === 'CanceledError') return
      setError(err.response?.data?.error || 'Error al cargar datos de Instagram.')
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [projectId])

  const fetchFollowerLogs = useCallback(async (filterKey) => {
    if (!projectId) return
    setFollowerLoading(true)
    try {
      const today = todayAR()
      const f = FOLLOWER_FILTERS.find(x => x.key === filterKey)
      const from = f.days ? subtractDays(today, f.days - 1) : undefined
      const params = { to: today }
      if (from) params.from = from
      const { data } = await api.get(`/marketing/projects/${projectId}/instagram/followers`, { params })
      setFollowerLogs(data.logs ?? [])
    } catch { /* silencioso */ }
    finally { setFollowerLoading(false) }
  }, [projectId])

  useEffect(() => {
    const controller = new AbortController()
    fetchData(controller.signal)
    return () => controller.abort()
  }, [fetchData])

  // Stories del mes seleccionado (se leen de la DB; el cron las captura cada 6h).
  useEffect(() => {
    if (!projectId || !integration) { setStories(null); return }
    let active = true
    api.get(`/marketing/projects/${projectId}/instagram/stories`, { params: { month: selectedMonth } })
      .then(r => { if (active) { setStories(r.data.summary); setStoriesScrapeOnly(!!r.data.scrapeOnly) } })
      .catch(() => { if (active) setStories(null) })
    return () => { active = false }
  }, [projectId, selectedMonth, integration])

  async function handleCaptureStories() {
    setCapturingStories(true)
    try {
      const { data } = await api.post(`/marketing/projects/${projectId}/instagram/stories/capture`)
      setStories(data.summary)
    } catch (err) {
      alert(err.response?.data?.error || 'No se pudieron capturar las stories.')
    } finally { setCapturingStories(false) }
  }

  async function handleDisconnect() {
    if (!window.confirm('¿Desconectar la cuenta de Instagram de este proyecto?')) return
    setDisconnecting(true)
    try {
      await api.delete(`/marketing/projects/${projectId}/integrations/instagram`)
      setIntegration(null); setMetrics(null); setSnapshots([])
    } catch (err) {
      alert(err.response?.data?.error || 'No se pudo desconectar.')
    } finally { setDisconnecting(false) }
  }

  async function handleDeleteSnapshot() {
    if (!window.confirm(`¿Borrar el snapshot de ${monthLabel(selectedMonth)}? También se eliminarán los registros diarios de seguidores de ese mes. No se puede deshacer.`)) return
    setDeletingSnapshot(true)
    try {
      await api.delete(`/marketing/projects/${projectId}/instagram/snapshots/${selectedMonth}`)
      setSelectedMonth(currentMonth)
      await fetchData()
    } catch (err) {
      alert(err.response?.data?.error || 'No se pudo borrar el snapshot.')
    } finally { setDeletingSnapshot(false) }
  }

  const [refreshing, setRefreshing] = useState(false)
  const [debugLoading, setDebugLoading] = useState(false)
  const [debugData, setDebugData] = useState(null)
  const [debugError, setDebugError] = useState(null)
  async function handleScrapeDebug() {
    setDebugLoading(true); setDebugError(null); setDebugData(null)
    try {
      const { data } = await api.get(`/marketing/projects/${projectId}/instagram/scrape-debug`)
      setDebugData(data)
    } catch (err) {
      setDebugError(err.response?.data?.error || 'No se pudo correr el diagnóstico.')
    } finally { setDebugLoading(false) }
  }

  async function handleRefreshScrape() {
    setRefreshing(true)
    setError(null)
    try {
      const { data } = await api.post(`/marketing/projects/${projectId}/instagram/scrape/refresh`)
      setMetrics(data)
      // Refrescar snapshots y logs de seguidores en segundo plano
      fetchData()
    } catch (err) {
      const code = err.response?.data?.code
      setError(err.response?.data?.error || (code === 'COOLDOWN' ? 'Esperá un momento para actualizar de nuevo.' : 'No se pudo actualizar.'))
    } finally { setRefreshing(false) }
  }

  if (!projectId) {
    return <CrossProjectInstagramPanel onSelectProject={onSelectProject} />
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!integration) return <ConnectPrompt projectId={projectId} onConnected={fetchData} />
  if (integration.status === 'expired') {
    return (
      <div className="space-y-4">
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-2xl p-6 text-center">
          <div className="text-3xl mb-2">⚠️</div>
          <p className="text-sm font-semibold text-red-700 dark:text-red-300 mb-1">La conexión con Instagram expiró</p>
          <p className="text-xs text-red-500 dark:text-red-400">Reconectá la cuenta para seguir viendo las métricas.</p>
        </div>
        <ConnectPrompt projectId={projectId} onConnected={fetchData} />
      </div>
    )
  }

  // Meses disponibles: mes actual + meses con snapshot (ordenados más reciente primero)
  const availableMonths = [...new Set([currentMonth, ...snapshots.map(s => s.month)])]
    .sort().reverse()

  const isCurrentMonth = selectedMonth === currentMonth
  // Para el mes actual → datos en vivo; para meses anteriores → snapshot guardado
  const displayData = isCurrentMonth
    ? metrics
    : (snapshots.find(s => s.month === selectedMonth) ?? null)
  const canDeleteSnapshot = snapshots.some(s => s.month === selectedMonth)

  // Insights (reach/saved/shares) — el mes actual usa nombres *ThisMonth (en vivo),
  // los snapshots guardados usan las columnas reach/views. Normalizamos a un solo shape.
  const reachVal   = displayData?.reachThisMonth ?? displayData?.reach ?? null
  const viewsVal   = displayData?.viewsThisMonth ?? displayData?.views ?? null
  const savedVal   = displayData?.totalSaved  ?? null
  const sharesVal  = displayData?.totalShares ?? null
  const avgReachVal = displayData?.avgReach   ?? null
  const hasInsights = [reachVal, viewsVal, savedVal, sharesVal, avgReachVal].some(v => v != null)
  // Publicación de mayor alcance: en vivo viene calculada; en snapshots se deriva de topPosts.
  const bestByReach = displayData?.bestByReach
    ?? (Array.isArray(displayData?.topPosts)
      ? displayData.topPosts.filter(p => p.reach != null).sort((a, b) => (b.reach ?? 0) - (a.reach ?? 0))[0] ?? null
      : null)

  // Seguidores ganados en el mes actual: primer log del mes (fijado en la carga inicial) vs. valor actual
  const monthlyGain = (isCurrentMonth && displayData?.followersCount != null && monthStartFollowers != null)
    ? displayData.followersCount - monthStartFollowers
    : null

  return (
    <div className="space-y-4">

      {/* Header con perfil */}
      <AccountHeader metrics={metrics} integration={integration} onDisconnect={handleDisconnect} disconnecting={disconnecting} onRefresh={handleRefreshScrape} refreshing={refreshing} />

      {/* Error */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 text-sm text-red-700 dark:text-red-300">{error}</div>
      )}

      {integration?.scopes === 'scrape' && (
        <div className="bg-blue-50/60 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 rounded-xl px-4 py-3 text-xs text-blue-700 dark:text-blue-300">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <span>📊 Datos públicos vía scraping: seguidores, posts y engagement.</span>
            <button onClick={handleScrapeDebug} disabled={debugLoading}
              className="shrink-0 px-2.5 py-1 rounded-lg border border-blue-300 dark:border-blue-700 hover:bg-blue-100 dark:hover:bg-blue-900/30 disabled:opacity-50 transition-colors font-medium">
              {debugLoading ? 'Diagnosticando…' : '🔍 Diagnóstico'}
            </button>
          </div>

          {debugError && <p className="mt-2 text-red-600 dark:text-red-400">{debugError}</p>}

          {debugData && (
            <div className="mt-3 space-y-2">
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-blue-800 dark:text-blue-200 font-medium">
                <span>perfil: {debugData.perfil?.count} posts ({debugData.perfil?.inTarget ?? '—'} del mes)</span>
                <span>posts (2ª llamada): {debugData.posts?.count} ({debugData.posts?.inTarget ?? '—'} del mes)</span>
                <span>fusión: {debugData.fusion?.count} ({debugData.fusion?.inTarget ?? '—'} del mes)</span>
                <span>seguidores: {debugData.followersCount ?? '—'}</span>
              </div>
              <p className="text-[11px] text-blue-600/80 dark:text-blue-300/80">
                {debugData.postsActorConfigured
                  ? 'Actor de posts configurado. Si "posts (2ª llamada)" trae menos del mes que "perfil", revisá el actor en SuperAdmin → Configuración.'
                  : 'No hay actor de posts configurado (2ª llamada) — solo se usa el latestPosts del actor de perfil, que puede venir incompleto en cuentas activas.'}
                {debugData.postsActorError && ` Error de la 2ª llamada: ${debugData.postsActorError}`}
              </p>
              <pre className="max-h-80 overflow-auto bg-white dark:bg-gray-900 border border-blue-200 dark:border-blue-800 rounded-lg p-3 text-[11px] leading-relaxed text-gray-700 dark:text-gray-300 select-all whitespace-pre-wrap break-all">
{JSON.stringify(debugData, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}

      {isCurrentMonth && metrics?.monthCoverageComplete === false && (
        <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-xl px-4 py-3 text-xs text-amber-700 dark:text-amber-300">
          ⚠️ Esta cuenta puede postear más de lo que se pudo traer este mes — el engagement/posts del mes podrían estar subestimados. Corré el diagnóstico o subí el tope de posts en SuperAdmin → Configuración.
        </div>
      )}

      {/* Navegación por mes */}
      {availableMonths.length > 0 && (
        <MonthNav
          selectedMonth={selectedMonth}
          availableMonths={availableMonths}
          onChange={setSelectedMonth}
          canDelete={canDeleteSnapshot}
          onDelete={handleDeleteSnapshot}
          deleting={deletingSnapshot}
        />
      )}

      {/* KPI cards */}
      {displayData && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <FollowersCard followersCount={displayData.followersCount} mediaCount={displayData.mediaCount} monthlyGain={monthlyGain} />
          <KpiCard
            icon="❤️" label="Engagement"
            value={displayData.engagementRate != null ? `${displayData.engagementRate}%` : '—'}
            valueClass={engagementColor(displayData.engagementRate)}
            sub={engagementLabel(displayData.engagementRate)}
          />
          <KpiCard
            icon="👍" label="Avg. Likes"
            value={displayData.avgLikes != null ? fmtNum(displayData.avgLikes) : '—'}
            sub="promedio del mes"
          />
          <KpiCard
            icon="💬" label="Avg. Comentarios"
            value={displayData.avgComments != null ? fmtNum(displayData.avgComments) : '—'}
            sub="promedio del mes"
          />
          <KpiCard
            icon="📅" label="Posts del mes"
            value={(displayData.postsThisMonth ?? displayData.postsCount) != null
              ? fmtNum(displayData.postsThisMonth ?? displayData.postsCount)
              : '—'}
            sub={isCurrentMonth ? 'publicaciones este mes' : 'publicaciones ese mes'}
          />
        </div>
      )}

      {/* KPIs de Insights (alcance/guardados/compartidos) — solo si la cuenta los expone */}
      {hasInsights && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <KpiCard
            icon="📡" label="Alcance del mes"
            value={reachVal != null ? fmtNum(reachVal) : '—'}
            valueClass="text-purple-600 dark:text-purple-400"
            sub="cuentas alcanzadas"
          />
          <KpiCard
            icon="👁️" label="Vistas"
            value={viewsVal != null ? fmtNum(viewsVal) : '—'}
            sub="impresiones del mes"
          />
          <KpiCard
            icon="🔖" label="Guardados"
            value={savedVal != null ? fmtNum(savedVal) : '—'}
            sub="posts del mes"
          />
          <KpiCard
            icon="↗️" label="Compartidos"
            value={sharesVal != null ? fmtNum(sharesVal) : '—'}
            sub="posts del mes"
          />
          <KpiCard
            icon="📊" label="Alcance prom."
            value={avgReachVal != null ? fmtNum(avgReachVal) : '—'}
            sub="por publicación"
          />
        </div>
      )}

      {/* Objetivos de Instagram del período (seguidores / interacción) con barra de progreso */}
      <ObjectiveProgressBars objectives={objectives} title="🎯 Objetivos de Instagram" />

      {/* Análisis con IA: diagnóstico vs. mes anterior, competencia, objetivos y brief orgánico */}
      <RrssAdvisorPanel
        projectId={projectId}
        projectName={projects.find(p => String(p.id) === String(projectId))?.name}
        platform="instagram"
      />

      {/* Insights: breakdown por tipo + mejor horario — solo mes actual (datos en vivo) */}
      {isCurrentMonth && metrics && <ContentInsights byType={metrics.byType} bestHour={metrics.bestHour} />}

      {/* Publicación de mayor alcance (requiere Insights) */}
      <ReachHighlight post={bestByReach} />

      {/* TOP del mes — mes actual: datos en vivo; meses anteriores: snapshot guardado */}
      {isCurrentMonth && metrics?.topPosts && (
        <TopOfMonth topPosts={metrics.topPosts} postsThisMonth={metrics.postsThisMonth} />
      )}
      {!isCurrentMonth && displayData?.topPosts?.length > 0 && (
        <TopOfMonth
          topPosts={displayData.topPosts}
          postsThisMonth={displayData.postsThisMonth ?? displayData.postsCount}
          label={monthLabel(selectedMonth)}
          isPast
        />
      )}

      {/* Stories del mes — solo con conexión por API oficial (por scraping no son accesibles) */}
      {!storiesScrapeOnly && (
        <StoriesSection
          stories={stories}
          isCurrentMonth={isCurrentMonth}
          onCapture={handleCaptureStories}
          capturing={capturingStories}
        />
      )}

      {/* Evolución de seguidores */}
      {integration && (() => {
        // Fallback: si hay pocos logs diarios, usar snapshots mensuales como historial
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
                      <button
                        key={f.key}
                        onClick={() => { setFollowerFilter(f.key); fetchFollowerLogs(f.key) }}
                        className={`px-2.5 py-1 text-xs rounded-lg transition-colors ${
                          followerFilter === f.key
                            ? 'bg-purple-600 text-white'
                            : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                        }`}
                      >{f.label}</button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {followerLoading ? (
              <div className="flex justify-center py-10">
                <div className="w-5 h-5 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : hasChart ? (
              <LineChart
                data={chartData}
                valueAccessor={d => d.followersCount}
                labelAccessor={d => snapshotFallback ? d.date?.slice(0, 7) : d.date?.slice(5)}
                color="#a855f7"
                formatY={v => fmtK(Math.round(v))}
                chartHeight={160}
                displayHeight={180}
                bare
              />
            ) : (
              <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">
                Recopilando información, pronto vas a poder ver la evolución de seguidores.
              </p>
            )}
          </div>
        )
      })()}

      {/* Engagement histórico mensual — aparece cuando hay 2+ meses con datos */}
      {snapshots.filter(d => d.engagementRate != null).length >= 2 && (
        <LineChart
          data={snapshots.filter(d => d.engagementRate != null)}
          valueAccessor={d => d.engagementRate}
          labelAccessor={d => d.month?.slice(5)}
          label="Engagement rate mensual (%)"
          color="#ec4899"
          formatY={v => `${v.toFixed(1)}%`}
          chartHeight={160}
          displayHeight={180}
        />
      )}

      {/* Alcance histórico mensual — aparece cuando hay 2+ meses con Insights */}
      {snapshots.filter(d => d.reach != null).length >= 2 && (
        <LineChart
          data={snapshots.filter(d => d.reach != null)}
          valueAccessor={d => d.reach}
          labelAccessor={d => d.month?.slice(5)}
          label="Alcance mensual"
          color="#a855f7"
          formatY={v => fmtK(Math.round(v))}
          chartHeight={160}
          displayHeight={180}
        />
      )}
    </div>
  )
}
