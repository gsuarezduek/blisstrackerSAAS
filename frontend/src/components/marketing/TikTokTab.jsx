import { useState, useEffect, useCallback } from 'react'
import api from '../../api/client'
import ObjectiveProgressBars from './ObjectiveProgressBars'
import RrssAdvisorPanel from './RrssAdvisorPanel'
import { BRANDS } from './networks/brands'
import { fmtNum, fmtK, engColor, engLabel, subtractDays, todayAR, monthLabel, FOLLOWER_FILTERS } from './networks/format'
import { LineChart, MonthNav, KpiCard, AudienceCard, BrandSpinner } from './networks/ui'
import ConnectScreen, { OAuthMethod, ExpiredNotice } from './networks/ConnectScreen'
import AccountHeader, { AccountBio } from './networks/AccountHeader'
import CrossProjectNetworkPanel from './networks/CrossProjectNetworkPanel'
import { Eye, Heart } from 'lucide-react'
import { Icon } from '../ui/Icon'

const BRAND = BRANDS.tiktok
const TEAL = BRAND.color

const authUrl = projectId => () =>
  api.get('/marketing/integrations/tiktok/auth-url', { params: { projectId } }).then(r => r.data.url)

function ConnectPrompt({ projectId, onConnected }) {
  return (
    <ConnectScreen brand={BRAND} title="Conectá la cuenta de TikTok"
      subtitle="Seguidores, videos del mes, vistas y engagement."
      methods={[{
        key: 'official', title: 'Conexión oficial',
        description: 'Iniciá sesión con TikTok. Necesitás una cuenta Business o Creator.',
        body: <OAuthMethod brand={BRAND} getAuthUrl={authUrl(projectId)} onConnected={onConnected} cta="Conectar con TikTok" />,
      }]}
    />
  )
}

// ── TOP del mes ───────────────────────────────────────────────────────────────

function TopVideoCard({ video, rank, category }) {
  if (!video) return (
    <div className="bg-white dark:bg-gray-800 border border-dashed border-gray-200 dark:border-gray-700 rounded-xl p-4 flex flex-col items-center justify-center gap-2 min-h-[160px]">
      <p className="text-xs text-gray-400 text-center">Sin videos este mes</p>
    </div>
  )
  return (
    <a href={video.shareUrl ?? '#'} target="_blank" rel="noopener noreferrer"
      className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden flex flex-col group hover:border-teal-300 dark:hover:border-teal-700 transition-colors">
      <div className="relative aspect-[9/16] bg-gray-100 dark:bg-gray-700 max-h-48">
        {video.coverUrl
          ? <img src={video.coverUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
          : <div className="w-full h-full bg-gradient-to-br from-gray-800 to-gray-900" />
        }
        <div className="absolute top-2 left-2 w-6 h-6 rounded-full bg-black/60 text-white text-xs font-bold flex items-center justify-center">{rank}</div>
      </div>
      <div className="p-3 space-y-1.5">
        <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: TEAL }}>{category}</p>
        <div className="flex items-center gap-3 text-xs text-gray-600 dark:text-gray-400">
          {video.viewCount   != null && <span>▶ {fmtK(video.viewCount)}</span>}
          {video.likeCount   != null && <span><Icon as={Heart} size={12} className="inline align-[-2px] mr-1" />{fmtK(video.likeCount)}</span>}
          {video.shareCount  != null && <span>↗ {fmtK(video.shareCount)}</span>}
        </div>
        {video.title && <p className="text-[11px] text-gray-500 dark:text-gray-400 line-clamp-2 leading-tight">{video.title}</p>}
      </div>
    </a>
  )
}

function TopOfMonth({ topOfMonth }) {
  if (!topOfMonth) return null
  const { topViews, topLikes, topShares, postsThisMonth } = topOfMonth
  const ids = new Set()
  function dedup(v) { if (!v || ids.has(v.id)) return null; ids.add(v.id); return v }
  const v1 = dedup(topViews)
  const v2 = dedup(topLikes)
  const v3 = dedup(topShares)
  const currentMonth = new Date().toLocaleString('es-AR', { month: 'long', timeZone: 'America/Argentina/Buenos_Aires' })
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">TOP del mes — {currentMonth}</p>
          <p className="text-xs text-gray-400 mt-0.5">
            {postsThisMonth > 0 ? `${postsThisMonth} video${postsThisMonth !== 1 ? 's' : ''} este mes` : 'Sin videos en lo que va del mes'}
          </p>
        </div>
      </div>
      {postsThisMonth === 0
        ? <p className="text-sm text-gray-400 text-center py-6">Aún no hay videos este mes.</p>
        : <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <TopVideoCard video={v1} rank={1} category="Más visto" />
            <TopVideoCard video={v2} rank={2} category="Más likeado" />
            <TopVideoCard video={v3} rank={3} category="Más compartido" />
          </div>
      }
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function TikTokTab({ projectId, onSelectProject, projects = [] }) {
  const currentMonth = todayAR().slice(0, 7)

  const [integration,     setIntegration]    = useState(null)
  const [metrics,         setMetrics]        = useState(null)
  const [snapshots,       setSnapshots]      = useState([])
  const [objectives,      setObjectives]     = useState([])
  const [selectedMonth,   setSelectedMonth]  = useState(currentMonth)
  const [followerLogs,    setFollowerLogs]   = useState([])
  const [monthStartFollowers, setMonthStartFollowers] = useState(null)
  const [followerFilter,  setFollowerFilter] = useState('30d')
  const [followerLoading, setFollowerLoading]= useState(false)
  const [loading,         setLoading]        = useState(false)
  const [error,           setError]          = useState(null)
  const [disconnecting,   setDisconnecting]  = useState(false)
  const [deletingSnapshot, setDeletingSnapshot] = useState(false)

  const fetchData = useCallback(async () => {
    if (!projectId) return
    setLoading(true); setError(null)
    try {
      const intgsRes = await api.get(`/marketing/projects/${projectId}/integrations`)
      const tk = intgsRes.data.find(i => i.type === 'tiktok')
      setIntegration(tk ?? null)
      if (!tk) { setLoading(false); return }

      const today = todayAR()
      const f = FOLLOWER_FILTERS.find(x => x.key === followerFilter)
      const from = f.days ? subtractDays(today, f.days - 1) : undefined
      const logParams = { to: today }
      if (from) logParams.from = from

      const [metricsRes, snapshotsRes, logsRes, objsRes] = await Promise.allSettled([
        api.get(`/marketing/projects/${projectId}/tiktok`),
        api.get(`/marketing/projects/${projectId}/tiktok/snapshots`),
        api.get(`/marketing/projects/${projectId}/tiktok/followers`, { params: logParams }),
        api.get(`/marketing/projects/${projectId}/objectives/progress`),
      ])

      if (metricsRes.status   === 'fulfilled') setMetrics(metricsRes.value.data)
      if (snapshotsRes.status === 'fulfilled') setSnapshots(snapshotsRes.value.data.snapshots ?? [])
      if (objsRes.status      === 'fulfilled') {
        const all = objsRes.value.data.objectives ?? []
        setObjectives(all.filter(o => ['seguidores', 'interaccion'].includes(o.metric) && o.detail?.platform === 'tiktok'))
      }
      if (logsRes.status      === 'fulfilled') {
        const logs = logsRes.value.data.logs ?? []
        setFollowerLogs(logs)
        const monthStart = todayAR().slice(0, 7) + '-01'
        const firstInMonth = logs.find(l => l.date >= monthStart)
        setMonthStartFollowers(firstInMonth?.followersCount ?? null)
      }
      if (metricsRes.status   === 'rejected')  setError(metricsRes.reason?.response?.data?.error || 'No se pudieron cargar las métricas.')
    } catch (err) {
      setError(err.response?.data?.error || 'Error al cargar datos de TikTok.')
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
      const { data } = await api.get(`/marketing/projects/${projectId}/tiktok/followers`, { params })
      setFollowerLogs(data.logs ?? [])
    } catch { /* silencioso */ }
    finally { setFollowerLoading(false) }
  }, [projectId])

  useEffect(() => { fetchData() }, [fetchData])

  async function handleDisconnect() {
    if (!window.confirm('¿Desconectar la cuenta de TikTok de este proyecto?')) return
    setDisconnecting(true)
    try {
      await api.delete(`/marketing/projects/${projectId}/integrations/tiktok`)
      setIntegration(null); setMetrics(null); setSnapshots([])
    } catch (err) {
      alert(err.response?.data?.error || 'No se pudo desconectar.')
    } finally { setDisconnecting(false) }
  }

  async function handleDeleteSnapshot() {
    if (!window.confirm(`¿Borrar el snapshot de ${monthLabel(selectedMonth)}? También se eliminarán los registros diarios de seguidores de ese mes. No se puede deshacer.`)) return
    setDeletingSnapshot(true)
    try {
      await api.delete(`/marketing/projects/${projectId}/tiktok/snapshots/${selectedMonth}`)
      setSelectedMonth(currentMonth)
      await fetchData()
    } catch (err) {
      alert(err.response?.data?.error || 'No se pudo borrar el snapshot.')
    } finally { setDeletingSnapshot(false) }
  }

  if (!projectId) return (
    <CrossProjectNetworkPanel brand={BRAND} network="tiktok" onSelectProject={onSelectProject}
      renderSecondary={p => (
        <>
          <span className="text-gray-400">{fmtK(p.followersCount)} seguidores</span>
          {p.avgViews != null && <span className="text-gray-400"><Icon as={Eye} size={12} className="inline align-[-2px] mr-1" />{fmtK(Math.round(p.avgViews))} vistas/video</span>}
          {p.engagementRate != null && <span className={engColor(p.engagementRate)}>{p.engagementRate.toFixed(2)}% eng.</span>}
          {p.postsThisMonth != null && <span className="text-gray-400">{p.postsThisMonth} videos</span>}
        </>
      )}
    />
  )

  if (loading) return <BrandSpinner brand={BRAND} />

  if (!integration) return <ConnectPrompt projectId={projectId} onConnected={fetchData} />
  if (integration.status === 'expired') return (
    <ExpiredNotice brand={BRAND}>
      <OAuthMethod brand={BRAND} getAuthUrl={authUrl(projectId)} onConnected={fetchData} cta="Reconectar TikTok" />
    </ExpiredNotice>
  )

  const availableMonths = [...new Set([currentMonth, ...snapshots.map(s => s.month)])].sort().reverse()
  const isCurrentMonth  = selectedMonth === currentMonth
  const displayData     = isCurrentMonth ? metrics : (snapshots.find(s => s.month === selectedMonth) ?? null)
  const canDeleteSnapshot = snapshots.some(s => s.month === selectedMonth)

  // Seguidores ganados en el mes actual: primer log del mes (fijado en la carga inicial) vs. valor actual
  const monthlyGain = (isCurrentMonth && displayData?.followersCount != null && monthStartFollowers != null)
    ? displayData.followersCount - monthStartFollowers
    : null

  return (
    <div className="space-y-4">

      <AccountHeader brand={BRAND} integration={integration}
        avatarUrl={metrics?.avatarUrl} name={metrics?.displayName} verified={metrics?.isVerified}
        profileUrl={metrics?.username && `https://www.tiktok.com/@${metrics.username}`}
        subtitle={metrics && `${fmtK(metrics.followingCount)} siguiendo · ${fmtK(metrics.likesCount)} likes totales`}
        onDisconnect={handleDisconnect} disconnecting={disconnecting}>
        <AccountBio>{metrics?.bioDescription}</AccountBio>
      </AccountHeader>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 text-sm text-red-700 dark:text-red-300">{error}</div>
      )}

      {availableMonths.length > 0 && (
        <MonthNav selectedMonth={selectedMonth} availableMonths={availableMonths} onChange={setSelectedMonth}
          canDelete={canDeleteSnapshot} onDelete={handleDeleteSnapshot} deleting={deletingSnapshot} />
      )}

      {displayData && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <AudienceCard count={displayData.followersCount} monthlyGain={monthlyGain}
            sub={displayData.videoCount != null ? `${fmtNum(displayData.videoCount)} videos` : null} />
          <KpiCard label="Engagement"
            value={displayData.engagementRate != null ? `${displayData.engagementRate}%` : '—'}
            valueClass={engColor(displayData.engagementRate)}
            sub={engLabel(displayData.engagementRate)}
          />
          <KpiCard label="Avg. Views"
            value={displayData.avgViews != null ? fmtK(displayData.avgViews) : '—'}
            sub="promedio del mes"
          />
          <KpiCard label="Avg. Likes"
            value={displayData.avgLikes != null ? fmtNum(displayData.avgLikes) : '—'}
            sub="promedio del mes"
          />
          <KpiCard label="Videos del mes"
            value={(displayData.postsThisMonth ?? displayData.postsCount) != null
              ? fmtNum(displayData.postsThisMonth ?? displayData.postsCount)
              : '—'}
            sub={isCurrentMonth ? 'videos este mes' : 'videos ese mes'}
          />
        </div>
      )}

      {/* Objetivos de TikTok del período (seguidores / interacción) con barra de progreso */}
      <ObjectiveProgressBars objectives={objectives} title="Objetivos de TikTok" />

      {/* Análisis con IA: diagnóstico vs. mes anterior, objetivos y brief orgánico */}
      <RrssAdvisorPanel
        projectId={projectId}
        projectName={projects.find(p => String(p.id) === String(projectId))?.name}
        platform="tiktok"
      />

      {isCurrentMonth && metrics?.topOfMonth && <TopOfMonth topOfMonth={metrics.topOfMonth} />}

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
                        style={followerFilter === f.key ? { backgroundColor: TEAL } : {}}
                      >{f.label}</button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            {followerLoading
              ? <div className="flex justify-center py-10"><div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: `${TEAL} transparent ${TEAL} ${TEAL}` }} /></div>
              : hasChart
                ? <LineChart data={chartData} valueAccessor={d => d.followersCount} labelAccessor={d => snapshotFallback ? d.date?.slice(0, 7) : d.date?.slice(5)} color={TEAL} formatY={v => fmtK(Math.round(v))} chartHeight={160} displayHeight={180} bare />
                : <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">Recopilando información, pronto vas a poder ver la evolución de seguidores.</p>
            }
          </div>
        )
      })()}

      {/* Engagement histórico mensual */}
      {snapshots.filter(d => d.engagementRate != null).length >= 2 && (
        <LineChart
          data={snapshots.filter(d => d.engagementRate != null)}
          valueAccessor={d => d.engagementRate}
          labelAccessor={d => d.month?.slice(5)}
          label="Engagement rate mensual (%)"
          color={TEAL}
          formatY={v => `${v.toFixed(1)}%`}
          chartHeight={160} displayHeight={180}
        />
      )}
    </div>
  )
}
