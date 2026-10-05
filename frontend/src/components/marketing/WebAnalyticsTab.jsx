import { useState, useEffect } from 'react'
import api from '../../api/client'
import { CalendarDays, ChartColumn, Hash, Monitor, TriangleAlert } from 'lucide-react'
import { Icon } from '../ui/Icon'
import ObjectiveProgressBars from './ObjectiveProgressBars'
import useObjectiveProgress from './useObjectiveProgress'
import CreateTaskModal from './web/CreateTaskModal'
import { MetricCard, SectionTitle, AllEventsBlock, ConversionsBlock } from './web/WebAnalyticsBlocks'
import { CrossProjectAnalyticsPanel } from './web/CrossProjectPanels'
import {
  PRESET_RANGES, todayStr, getDateParams, formatDateLabel,
  fmt, fmtDuration, pct, prevMonthStr, getActiveMonth,
  DEVICE_ICONS, CHANNEL_COLORS, sourceColor,
} from './web/webTabHelpers'

// Subtab "Analytics" de la pestaña Web — Google Analytics (sesiones, canales,
// dispositivos, fuentes de tráfico, conversiones) + insight IA mensual. No
// necesita `projects` (a diferencia de WebPerformanceTab): websiteUrl/nombre
// de proyecto vienen en la respuesta de /analytics, no del listado de proyectos.
// Separado de WebPerformanceTab (PageSpeed) — ver el comentario de ese archivo.
export default function WebAnalyticsTab({ projectId, onSelectProject }) {
  const [rangePreset,  setRangePreset]  = useState('thisMonth')
  const [customStart,  setCustomStart]  = useState(todayStr())
  const [customEnd,    setCustomEnd]    = useState(todayStr())
  const [appliedRange, setAppliedRange] = useState({ preset: 'thisMonth', start: '', end: '' })
  const [compare,      setCompare]      = useState(true)
  const [analytics,    setAnalytics]    = useState(null)
  const [loading,      setLoading]      = useState(false)
  const [errorStatus,   setErrorStatus]   = useState(null)
  const [error,         setError]         = useState('')
  const [reconnecting,  setReconnecting]  = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const [retryKey,      setRetryKey]      = useState(0)

  const allObjectives = useObjectiveProgress(projectId)
  const webObjectives = allObjectives.filter(o => o.metric === 'visitas' || o.metric === 'leads')

  // Snapshot del mes anterior (para deltas)
  const [prevSnap,     setPrevSnap]     = useState(null)

  // Insight IA
  const [insight,      setInsight]      = useState(null)
  const [insightLoading, setInsightLoading] = useState(false)
  const [savingSnap,   setSavingSnap]   = useState(false)
  const [snapSaved,    setSnapSaved]    = useState(false)

  // Modal crear tarea desde recomendación IA
  const [taskModal,    setTaskModal]    = useState(null) // { title }

  async function handleReconnectGoogle() {
    if (!projectId || reconnecting) return
    setReconnecting(true)
    try {
      const res    = await api.get(`/marketing/integrations/google/auth-url?projectId=${projectId}&type=google_analytics`)
      const popup  = window.open(res.data.url, 'google_oauth', 'width=560,height=660,left=200,top=100')

      const poll = setInterval(() => {
        try {
          const raw = localStorage.getItem('__ga_oauth_result')
          if (!raw) return
          const result = JSON.parse(raw)
          if (Date.now() - result.ts > 60000) { localStorage.removeItem('__ga_oauth_result'); return }
          localStorage.removeItem('__ga_oauth_result')
          clearInterval(poll)
          setReconnecting(false)
          if (result.success) {
            setErrorStatus(null)
            setError('')
            setRetryKey(k => k + 1)          // fuerza re-fetch de analytics
          }
          if (popup && !popup.closed) popup.close()
        } catch { /* ignorar */ }
      }, 600)

      // Limpiar si no hubo resultado en 5 min
      setTimeout(() => { clearInterval(poll); setReconnecting(false) }, 300_000)
    } catch (err) {
      setReconnecting(false)
      alert(err.response?.data?.error || 'No se pudo iniciar la reconexión con Google')
    }
  }

  async function handleDisconnectGoogle() {
    if (!projectId || disconnecting) return
    if (!window.confirm('¿Desconectar Google Analytics de este proyecto? Vas a tener que volver a autorizar el acceso.')) return
    setDisconnecting(true)
    try {
      await api.delete(`/marketing/projects/${projectId}/integrations/google_analytics`)
      setError('')
      setAnalytics(null)
      setErrorStatus('no_integration')
    } catch (err) {
      alert(err.response?.data?.error || 'No se pudo desconectar la integración')
    } finally {
      setDisconnecting(false)
    }
  }

  function handlePresetChange(val) {
    setRangePreset(val)
    if (val !== 'custom') setAppliedRange({ preset: val, start: '', end: '' })
  }

  function handleApplyCustom() {
    if (!customStart || !customEnd || customStart > customEnd) return
    setAppliedRange({ preset: 'custom', start: customStart, end: customEnd })
  }

  // Fetch principal: analytics en tiempo real
  useEffect(() => {
    if (!projectId) return
    const controller = new AbortController()
    const { startDate, endDate } = getDateParams(appliedRange.preset, appliedRange.start, appliedRange.end)
    setLoading(true)
    setError('')
    setErrorStatus(null)
    setAnalytics(null)
    setPrevSnap(null)
    setInsight(null)
    setSnapSaved(false)

    const isMonthlyPreset = appliedRange.preset === 'thisMonth' || appliedRange.preset === 'lastMonth'
    const firstDayOfMonth = new Date().getDate() === 1
    const useCompare = compare && isMonthlyPreset && !(appliedRange.preset === 'thisMonth' && firstDayOfMonth)
    api.get(`/marketing/projects/${projectId}/analytics?startDate=${startDate}&endDate=${endDate}&compare=${useCompare}`, { signal: controller.signal })
      .then(r => setAnalytics(r.data))
      .catch(e => {
        if (e.name === 'CanceledError' || e.code === 'ERR_CANCELED') return
        const status = e.response?.status
        const body   = e.response?.data
        if (status === 404)                                              setErrorStatus('no_integration')
        else if (body?.status === 'no_property')                        setErrorStatus('no_property')
        else if (body?.code === 'TOKEN_EXPIRED' || body?.status === 'revoked' || body?.status === 'error') setErrorStatus('revoked')
        else if (body?.code === 'FETCH_ERROR')                          setErrorStatus('fetch_error')
        else setError(body?.error || 'Error al cargar datos')
      })
      .finally(() => setLoading(false))
    return () => controller.abort()
  }, [projectId, appliedRange, retryKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // Cuando hay analytics y el período es mensual: cargar snapshot anterior + insight
  useEffect(() => {
    if (!analytics || !projectId) return
    const activeMonth = getActiveMonth(appliedRange.preset)
    if (!activeMonth) return

    const controller = new AbortController()
    const compMonth = prevMonthStr(activeMonth)

    // Snapshot del mes anterior para deltas
    api.get(`/marketing/projects/${projectId}/snapshots?month=${compMonth}`, { signal: controller.signal })
      .then(r => setPrevSnap(r.data))
      .catch(e => { if (e.name !== 'CanceledError' && e.code !== 'ERR_CANCELED') setPrevSnap(null) })

    // Insight IA existente
    api.get(`/marketing/projects/${projectId}/insights/${activeMonth}`, { signal: controller.signal })
      .then(r => setInsight(r.data))
      .catch(e => { if (e.name !== 'CanceledError' && e.code !== 'ERR_CANCELED') setInsight(null) })

    return () => controller.abort()
  }, [analytics, projectId, appliedRange])

  async function handleSaveSnapshot() {
    const activeMonth = getActiveMonth(appliedRange.preset)
    if (!activeMonth || !projectId) return
    setSavingSnap(true)
    try {
      await api.post(`/marketing/projects/${projectId}/snapshots`, { month: activeMonth })
      setSnapSaved(true)
      setTimeout(() => setSnapSaved(false), 3000)
    } catch (e) {
      alert(e.response?.data?.error || 'Error al guardar snapshot')
    } finally {
      setSavingSnap(false)
    }
  }

  async function handleGenerateInsight() {
    const activeMonth = getActiveMonth(appliedRange.preset)
    if (!activeMonth || !projectId) return
    setInsightLoading(true)
    try {
      const { data } = await api.post(`/marketing/projects/${projectId}/insights/${activeMonth}`)
      setInsight(data)
    } catch (e) {
      alert(e.response?.data?.error || 'Error al generar insight')
    } finally {
      setInsightLoading(false)
    }
  }

  // Vista global cuando no hay proyecto seleccionado
  if (!projectId) return <CrossProjectAnalyticsPanel onSelectProject={onSelectProject} />

  const ov              = analytics?.overview ?? {}
  const totalSessions   = analytics?.channels?.reduce((s, c) => s + c.sessions, 0) || 0
  const dateLabel     = formatDateLabel(appliedRange.preset, appliedRange.start, appliedRange.end)
  const activeMonth   = getActiveMonth(appliedRange.preset)
  const isMonthly     = !!activeMonth

  // El 1° del mes, "Este mes" solo tiene datos parciales del día actual:
  // comparar contra el mismo período del mes anterior devuelve -99% (0 sesiones vs día completo).
  // Suprimimos la comparación ese día y mostramos un aviso.
  const dayOfMonth          = new Date().getDate()
  const isFirstDayOfMonth   = dayOfMonth === 1
  const suppressComparison  = appliedRange.preset === 'thisMonth' && isFirstDayOfMonth

  // Deltas: preferir analytics.comparison (de GA4), fallback a prevSnap
  // No aplicar deltas si el mes acaba de comenzar.
  const gaComp = analytics?.comparison
  function snapDelta(curr, prevVal) {
    if (prevVal == null || prevVal === 0 || curr == null) return null
    return Math.round(((curr - prevVal) / prevVal) * 100)
  }
  const deltas = suppressComparison ? {} : gaComp ? {
    sessions:    gaComp.sessionsDelta,
    activeUsers: gaComp.activeUsersDelta,
    newUsers:    gaComp.newUsersDelta,
    pageviews:   gaComp.screenPageViewsDelta,
    bounceRate:  gaComp.bounceRateDelta,
    avgDuration: gaComp.averageSessionDurationDelta,
  } : prevSnap ? {
    sessions:    snapDelta(ov.sessions,              prevSnap.sessions),
    activeUsers: snapDelta(ov.activeUsers,            prevSnap.activeUsers),
    newUsers:    snapDelta(ov.newUsers,               prevSnap.newUsers),
    pageviews:   snapDelta(ov.screenPageViews,        prevSnap.pageviews),
    bounceRate:  snapDelta(ov.bounceRate,             prevSnap.bounceRate),
    avgDuration: snapDelta(ov.averageSessionDuration, prevSnap.avgDuration),
  } : {}

  return (
    <div className="space-y-5">

      {/* Controles */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 flex flex-wrap gap-4 items-end">
        <div className="flex flex-wrap items-end gap-2">
          <div className="w-[180px]">
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
              Período
            </label>
            <select
              value={rangePreset}
              onChange={e => handlePresetChange(e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              {PRESET_RANGES.map(d => (
                <option key={d.value} value={d.value}>{d.label}</option>
              ))}
            </select>
          </div>

          {/* Inputs de fecha personalizada */}
          {rangePreset === 'custom' && (
            <>
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
                  Desde
                </label>
                <input
                  type="date"
                  value={customStart}
                  max={customEnd || todayStr()}
                  onChange={e => setCustomStart(e.target.value)}
                  className="border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
                  Hasta
                </label>
                <input
                  type="date"
                  value={customEnd}
                  min={customStart}
                  max={todayStr()}
                  onChange={e => setCustomEnd(e.target.value)}
                  className="border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <button
                onClick={handleApplyCustom}
                disabled={!customStart || !customEnd || customStart > customEnd}
                className="px-4 py-2 bg-primary-600 hover:bg-primary-700 disabled:opacity-40 text-white text-sm font-medium rounded-lg transition-colors"
              >
                Aplicar
              </button>
            </>
          )}
        </div>
        {(appliedRange.preset === 'thisMonth' || appliedRange.preset === 'lastMonth') && !(appliedRange.preset === 'thisMonth' && new Date().getDate() === 1) && (
          <label className="flex items-center gap-2 cursor-pointer pb-2">
            <input
              type="checkbox"
              checked={compare}
              onChange={e => setCompare(e.target.checked)}
              className="w-4 h-4 rounded text-primary-600 focus:ring-primary-500"
            />
            <span className="text-xs text-gray-600 dark:text-gray-400">Comparar con período anterior</span>
          </label>
        )}
        {analytics?.websiteUrl && (
          <a
            href={/^https?:\/\//i.test(analytics.websiteUrl) ? analytics.websiteUrl : `https://${analytics.websiteUrl}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs text-primary-600 dark:text-primary-400 hover:underline pb-2"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
              <path fillRule="evenodd" d="M4.25 5.5a.75.75 0 00-.75.75v8.5c0 .414.336.75.75.75h8.5a.75.75 0 00.75-.75v-4a.75.75 0 011.5 0v4A2.25 2.25 0 0112.75 17h-8.5A2.25 2.25 0 012 14.75v-8.5A2.25 2.25 0 014.25 4h5a.75.75 0 010 1.5h-5z" clipRule="evenodd" />
              <path fillRule="evenodd" d="M6.194 12.753a.75.75 0 001.06.053L16.5 4.44v2.81a.75.75 0 001.5 0v-4.5a.75.75 0 00-.75-.75h-4.5a.75.75 0 000 1.5h2.553l-9.056 8.194a.75.75 0 00-.053 1.06z" clipRule="evenodd" />
            </svg>
            Ver sitio
          </a>
        )}
      </div>

      {/* Estados de error */}
      {errorStatus === 'no_integration' && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-2xl p-8 text-center">
          <div className="mb-3"><Icon as={ChartColumn} size={28} className="inline-block text-gray-300 dark:text-gray-600" /></div>
          <p className="text-sm font-semibold text-amber-800 dark:text-amber-300 mb-1">
            Google Analytics no está conectado para este proyecto
          </p>
          <p className="text-xs text-amber-600 dark:text-amber-400 mb-4">
            Conectalo ahora o ingresá a <strong>Mis Proyectos → Info</strong> para configurar el Property ID.
          </p>
          <button
            onClick={handleReconnectGoogle}
            disabled={reconnecting}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white text-sm font-medium rounded-xl transition-colors"
          >
            {reconnecting ? (
              <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Esperando autorización…</>
            ) : 'Conectar con Google'}
          </button>
        </div>
      )}
      {errorStatus === 'no_property' && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-2xl p-8 text-center">
          <div className="mb-3"><Icon as={Hash} size={28} className="inline-block text-gray-300 dark:text-gray-600" /></div>
          <p className="text-sm font-semibold text-amber-800 dark:text-amber-300 mb-1">
            Falta el GA4 Property ID
          </p>
          <p className="text-xs text-amber-600 dark:text-amber-400">
            Ingresalo en <strong>Mis Proyectos → [Proyecto] → Info → Integraciones Google</strong>
          </p>
        </div>
      )}
      {errorStatus === 'revoked' && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-2xl p-8 text-center">
          <div className="mb-3"><Icon as={TriangleAlert} size={28} className="inline-block text-amber-500" /></div>
          <p className="text-sm font-semibold text-red-700 dark:text-red-300 mb-1">
            La conexión con Google expiró
          </p>
          <p className="text-xs text-red-500 dark:text-red-400 mb-4">
            Volvé a autorizar para restaurar el acceso a Analytics y Search Console.
          </p>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={handleReconnectGoogle}
              disabled={reconnecting || disconnecting}
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white text-sm font-medium rounded-xl transition-colors"
            >
              {reconnecting ? (
                <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Esperando autorización…</>
              ) : 'Reconectar con Google'}
            </button>
            <button
              onClick={handleDisconnectGoogle}
              disabled={reconnecting || disconnecting}
              className="text-xs text-red-500 dark:text-red-400 hover:underline disabled:opacity-50"
            >
              {disconnecting ? 'Desconectando…' : 'Desconectar'}
            </button>
          </div>
        </div>
      )}
      {errorStatus === 'fetch_error' && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-2xl p-8 text-center">
          <div className="mb-3"><Icon as={TriangleAlert} size={28} className="inline-block text-amber-500" /></div>
          <p className="text-sm font-semibold text-red-700 dark:text-red-300 mb-1">
            No se pudo cargar Analytics
          </p>
          <p className="text-xs text-red-500 dark:text-red-400 mb-4">
            Puede ser algo puntual con Google, o que la conexión necesite reautorizarse.
          </p>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => setRetryKey(k => k + 1)}
              className="inline-flex items-center gap-2 px-4 py-2 border border-red-300 dark:border-red-700 hover:bg-red-100 dark:hover:bg-red-900/40 text-red-700 dark:text-red-300 text-sm font-medium rounded-xl transition-colors"
            >
              Reintentar
            </button>
            <button
              onClick={handleReconnectGoogle}
              disabled={reconnecting || disconnecting}
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white text-sm font-medium rounded-xl transition-colors"
            >
              {reconnecting ? (
                <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Esperando autorización…</>
              ) : 'Reconectar con Google'}
            </button>
            <button
              onClick={handleDisconnectGoogle}
              disabled={reconnecting || disconnecting}
              className="text-xs text-red-500 dark:text-red-400 hover:underline disabled:opacity-50"
            >
              {disconnecting ? 'Desconectando…' : 'Desconectar'}
            </button>
          </div>
        </div>
      )}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 rounded-2xl p-4 text-sm text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-12 text-center">
          <div className="inline-block w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin mb-3" />
          <p className="text-sm text-gray-400">Cargando datos de Google Analytics…</p>
        </div>
      )}

      {/* Dashboard */}
      {analytics && !loading && (
        <>
          {/* Aviso primer día del mes */}
          {suppressComparison && (
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-xl px-4 py-3 flex items-center gap-3">
              <span className="flex-shrink-0"><Icon as={CalendarDays} size={20} className="inline-block text-gray-300 dark:text-gray-600" /></span>
              <p className="text-sm text-blue-700 dark:text-blue-300">
                El mes acaba de comenzar. Los datos de hoy son parciales, así que las comparaciones con el mes anterior estarán disponibles a partir de mañana.
              </p>
            </div>
          )}

          {/* Banner de caída de tráfico */}
          {!suppressComparison && gaComp?.sessionsDelta != null && gaComp.sessionsDelta < -20 && (
            <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-700 rounded-xl px-4 py-3 flex items-center gap-3">
              <span className="flex-shrink-0"><Icon as={TriangleAlert} size={20} className="inline-block text-amber-500" /></span>
              <p className="text-sm text-orange-700 dark:text-orange-300">
                Las sesiones cayeron <strong>{Math.abs(gaComp.sessionsDelta)}%</strong> respecto al período anterior.
              </p>
            </div>
          )}

          {/* Métricas principales */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <SectionTitle>Resumen · {dateLabel}</SectionTitle>
              {prevSnap && (
                <span className="text-xs text-gray-400">vs mes anterior</span>
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <MetricCard
                label="Sesiones"
                value={fmt(ov.sessions)}
                highlight
                delta={deltas.sessions}
                deltaPositivo={deltas.sessions >= 0}
              />
              <MetricCard
                label="Usuarios activos"
                value={fmt(ov.activeUsers)}
                delta={deltas.activeUsers}
                deltaPositivo={deltas.activeUsers >= 0}
              />
              <MetricCard
                label="Nuevos usuarios"
                value={fmt(ov.newUsers)}
                sub={ov.sessions ? `${pct(ov.newUsers, ov.sessions)}% del total` : undefined}
                delta={deltas.newUsers}
                deltaPositivo={deltas.newUsers >= 0}
              />
              <MetricCard
                label="Páginas vistas"
                value={fmt(ov.screenPageViews)}
                sub={ov.sessions ? `${fmt(ov.screenPageViews / ov.sessions, 1)} por sesión` : undefined}
                delta={deltas.pageviews}
                deltaPositivo={deltas.pageviews >= 0}
              />
              <MetricCard
                label="Tasa de rebote"
                value={ov.bounceRate != null ? `${fmt(ov.bounceRate * 100, 1)}%` : '—'}
                delta={deltas.bounceRate}
                deltaPositivo={deltas.bounceRate <= 0}
              />
              <MetricCard
                label="Duración media"
                value={fmtDuration(ov.averageSessionDuration)}
                delta={deltas.avgDuration}
                deltaPositivo={deltas.avgDuration >= 0}
              />
            </div>
          </div>

          {/* Objetivos del proyecto (visitas / leads) */}
          <ObjectiveProgressBars objectives={webObjectives} title="Objetivos web" />

          {/* Análisis IA — primero para períodos mensuales */}
          {isMonthly && (
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                    Análisis IA · {dateLabel}
                  </h3>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Guardá un snapshot del período y generá un análisis mensual con IA.
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={handleSaveSnapshot}
                    disabled={savingSnap}
                    className="px-3 py-1.5 text-xs border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 rounded-lg transition-colors"
                  >
                    {savingSnap ? 'Guardando…' : snapSaved ? 'Guardado' : 'Guardar snapshot'}
                  </button>
                  <button
                    onClick={handleGenerateInsight}
                    disabled={insightLoading}
                    className="px-3 py-1.5 text-xs bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white font-medium rounded-lg transition-colors"
                  >
                    {insightLoading ? 'Analizando…' : insight ? 'Regenerar' : 'Analizar con IA'}
                  </button>
                </div>
              </div>

              {insightLoading && (
                <div className="flex items-center gap-2 text-sm text-gray-400">
                  <div className="w-4 h-4 border-2 border-primary-400 border-t-transparent rounded-full animate-spin" />
                  Generando análisis con IA…
                </div>
              )}

              {insight && !insightLoading && (
                <div className="space-y-4">
                  <div>
                    <p className="text-base font-semibold text-gray-800 dark:text-gray-200 mb-1">
                      {insight.content?.titulo}
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                      {insight.content?.resumen}
                    </p>
                  </div>

                  {insight.content?.tendencias?.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                        Tendencias
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {insight.content.tendencias.map((t, i) => (
                          <span
                            key={i}
                            className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium
                              ${t.positivo
                                ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300'
                                : 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                              }`}
                          >
                            {t.delta != null ? (t.delta > 0 ? '▲' : '▼') : '–'}
                            {t.metrica}
                            {t.delta != null && ` ${Math.abs(t.delta)}%`}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {insight.content?.recomendaciones?.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                        Recomendaciones
                      </p>
                      <ul className="space-y-1.5">
                        {insight.content.recomendaciones.map((rec, i) => (
                          <li key={i} className="flex items-start justify-between gap-2">
                            <span className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-400">
                              <span className="text-primary-500 mt-0.5 flex-shrink-0">→</span>
                              {rec}
                            </span>
                            <button
                              onClick={() => setTaskModal({ title: rec })}
                              title="Crear tarea a partir de esta recomendación"
                              className="flex-shrink-0 text-xs text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 border border-gray-200 dark:border-gray-600 hover:border-primary-400 rounded-lg px-2 py-0.5 transition-all"
                            >
                              + tarea
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <p className="text-[11px] text-gray-400">
                    Generado: {new Date(insight.generatedAt).toLocaleString('es-AR')}
                  </p>
                </div>
              )}

              {!insight && !insightLoading && (
                <p className="text-xs text-gray-400">
                  Guardá un snapshot del período actual y hacé click en "Analizar con IA" para obtener un resumen inteligente con comparaciones y recomendaciones.
                </p>
              )}
            </div>
          )}

          {/* Total de eventos + Eventos clave */}
          <div className="grid sm:grid-cols-2 gap-4">
            <AllEventsBlock allEvents={analytics.allEvents} />
            <ConversionsBlock conversions={analytics.conversions} sessions={ov.sessions} />
          </div>

          {/* Canales + Dispositivos */}
          <div className="grid sm:grid-cols-5 gap-4">

            {/* Canales — 3/5 */}
            {analytics.channels?.length > 0 && (
              <div className="sm:col-span-3 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
                <SectionTitle>Canales de tráfico</SectionTitle>
                <div className="space-y-3">
                  {analytics.channels.map((ch, i) => (
                    <div key={i}>
                      <div className="flex items-center justify-between text-xs mb-1.5">
                        <span className="flex items-center gap-2 text-gray-700 dark:text-gray-300 font-medium">
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${CHANNEL_COLORS[i % CHANNEL_COLORS.length]}`} />
                          {ch.channel || 'Directo'}
                        </span>
                        <span className="text-gray-500 tabular-nums">
                          {fmt(ch.sessions)} ses.
                          <span className="ml-1.5 text-gray-400">
                            ({pct(ch.sessions, totalSessions)}%)
                          </span>
                        </span>
                      </div>
                      <div className="h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${CHANNEL_COLORS[i % CHANNEL_COLORS.length]}`}
                          style={{ width: `${pct(ch.sessions, totalSessions)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Dispositivos — 2/5 */}
            {analytics.devices?.length > 0 && (
              <div className="sm:col-span-2 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
                <SectionTitle>Dispositivos</SectionTitle>
                <div className="space-y-4">
                  {analytics.devices.map((d, i) => {
                    const totalDev = analytics.devices.reduce((s, x) => s + x.sessions, 0)
                    const p = pct(d.sessions, totalDev)
                    const icon = DEVICE_ICONS[d.channel?.toLowerCase()] ?? Monitor
                    return (
                      <div key={i}>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-xs text-gray-700 dark:text-gray-300 capitalize flex items-center gap-1.5">
                            <Icon as={icon} size={14} className="text-gray-400" />
                            {d.channel}
                          </span>
                          <span className="text-xs font-semibold text-gray-900 dark:text-white tabular-nums">
                            {p}%
                          </span>
                        </div>
                        <div className="h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-500 rounded-full transition-all"
                            style={{ width: `${p}%` }}
                          />
                        </div>
                        <p className="text-[11px] text-gray-400 mt-0.5 text-right tabular-nums">
                          {fmt(d.sessions)} sesiones
                        </p>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Fuentes de tráfico detalladas */}
          {analytics.trafficSources?.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
              <SectionTitle>Fuentes de tráfico</SectionTitle>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-gray-400 border-b border-gray-100 dark:border-gray-700">
                      <th className="pb-2 font-medium">Fuente</th>
                      <th className="pb-2 font-medium">Medium</th>
                      <th className="pb-2 font-medium text-right w-20">Sesiones</th>
                      <th className="pb-2 font-medium text-right w-14">%</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
                    {analytics.trafficSources.map((src, i) => (
                      <tr key={i}>
                        <td className="py-2 pr-3">
                          <span className="flex items-center gap-1.5">
                            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${sourceColor(src.source, src.medium)}`} />
                            <span className="font-medium text-gray-700 dark:text-gray-300">
                              {src.source || '(direct)'}
                            </span>
                          </span>
                        </td>
                        <td className="py-2 pr-3 text-gray-500 dark:text-gray-400">{src.medium || '—'}</td>
                        <td className="py-2 text-right font-medium text-gray-700 dark:text-gray-300 tabular-nums">
                          {fmt(src.sessions)}
                        </td>
                        <td className="py-2 text-right text-gray-400 tabular-nums">
                          {src.pct != null ? `${src.pct}%` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Top páginas */}
          {analytics.topPages?.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
              <SectionTitle>Top páginas</SectionTitle>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-gray-400 border-b border-gray-100 dark:border-gray-700">
                      <th className="pb-2 font-medium w-6">#</th>
                      <th className="pb-2 font-medium">Página</th>
                      <th className="pb-2 font-medium text-right w-20">Vistas</th>
                      <th className="pb-2 font-medium text-right w-20">Sesiones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
                    {analytics.topPages.map((page, i) => (
                      <tr key={i} className="group">
                        <td className="py-2.5 text-gray-400">{i + 1}</td>
                        <td className="py-2.5 pr-4">
                          <p className="font-mono text-gray-700 dark:text-gray-300 truncate max-w-[280px]">
                            {page.path}
                          </p>
                          {page.title && page.title !== page.path && (
                            <p className="text-gray-400 truncate max-w-[280px]">{page.title}</p>
                          )}
                        </td>
                        <td className="py-2.5 text-right font-medium text-gray-700 dark:text-gray-300 tabular-nums">
                          {fmt(page.pageviews)}
                        </td>
                        <td className="py-2.5 text-right text-gray-500 tabular-nums">
                          {fmt(page.sessions)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Footer */}
          <p className="text-xs text-gray-400 text-right">
            Datos de Google Analytics · Actualizado:{' '}
            {analytics.fetchedAt
              ? new Date(analytics.fetchedAt).toLocaleString('es-AR')
              : '—'}
          </p>
        </>
      )}

      {/* Modal crear tarea desde recomendación IA */}
      {taskModal && (
        <CreateTaskModal
          title={taskModal.title}
          projectId={projectId}
          projectName={analytics?.projectName ?? ''}
          onClose={() => setTaskModal(null)}
        />
      )}
    </div>
  )
}
