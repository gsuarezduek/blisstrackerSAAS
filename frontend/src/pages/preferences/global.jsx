import { useState, useEffect } from 'react'
import api from '../../api/client'
import { useAuth } from '../../context/AuthContext'
import { useWorkspace } from '../../context/WorkspaceContext'
import LoadingSpinner from '../../components/LoadingSpinner'
import ConfirmModal from '../../components/ConfirmModal'
import { moduleMeta } from '../../lib/moduleCatalog'
import ModuleAccessEditor from '../../components/ModuleAccessEditor'
import { Toggle } from './shared'

const TIMEZONES = [
  { value: 'America/Argentina/Buenos_Aires', label: 'Buenos Aires (UTC-3)' },
  { value: 'America/Sao_Paulo',              label: 'São Paulo (UTC-3)' },
  { value: 'America/Santiago',               label: 'Santiago (UTC-4/-3)' },
  { value: 'America/Bogota',                 label: 'Bogotá (UTC-5)' },
  { value: 'America/Lima',                   label: 'Lima (UTC-5)' },
  { value: 'America/Mexico_City',            label: 'Ciudad de México (UTC-6/-5)' },
  { value: 'America/New_York',               label: 'Nueva York (UTC-5/-4)' },
  { value: 'America/Los_Angeles',            label: 'Los Ángeles (UTC-8/-7)' },
  { value: 'Europe/Madrid',                  label: 'Madrid (UTC+1/+2)' },
  { value: 'Europe/London',                  label: 'Londres (UTC+0/+1)' },
  { value: 'UTC',                            label: 'UTC' },
]

export default function GlobalTab({ loaded }) {
  const { user } = useAuth()
  const { refreshWorkspace } = useWorkspace()

  const [globalSettings,      setGlobalSettings]      = useState(null)
  const [globalSettingsError, setGlobalSettingsError] = useState(false)
  const [lateTest,            setLateTest]            = useState({ sending: false, msg: '', error: false })
  const [digestTest,          setDigestTest]          = useState({ sending: false, msg: '', error: false })
  const [marketingDigestTest, setMarketingDigestTest] = useState({ sending: false, msg: '', error: false })
  const [aiUsage,             setAiUsage]             = useState(null)
  const [aiUsageError,        setAiUsageError]        = useState(false)
  const [wsFeatures,          setWsFeatures]          = useState(null)
  const [togglingFeature,     setTogglingFeature]     = useState(null)
  const [moduleAccess,        setModuleAccess]        = useState(null)
  const [savingModuleAccess,  setSavingModuleAccess]  = useState(null)
  // EOS: proyecto asociado para tareas y reuniones
  const [projects,            setProjects]            = useState([])
  const [eosMeetingProjectId, setEosMeetingProjectId] = useState('')
  const [savingEosProject,    setSavingEosProject]    = useState(false)

  // Detalle de consumo de IA (desplegable)
  const [showAiDetail,   setShowAiDetail]   = useState(false)
  const [aiDetailPeriod, setAiDetailPeriod] = useState('month')
  const [aiDetailData,   setAiDetailData]   = useState(null)
  const [aiDetailLoading,setAiDetailLoading]= useState(false)

  // Eliminación de workspace
  const [workspaceName,      setWorkspaceName]      = useState('')
  const [deletionRequest,    setDeletionRequest]    = useState(null)   // null | { scheduledAt, requestedBy }
  const [deletionLoaded,     setDeletionLoaded]     = useState(false)
  const [showDeleteModal,    setShowDeleteModal]     = useState(false)
  const [deleteConfirmName,  setDeleteConfirmName]  = useState('')
  const [deletingWS,         setDeletingWS]         = useState(false)
  const [cancellingDel,      setCancellingDel]      = useState(false)
  const [deletionMsg,        setDeletionMsg]        = useState({ text: '', error: false })
  const [demoSeeded,         setDemoSeeded]         = useState(false)
  const [removingDemo,       setRemovingDemo]       = useState(false)
  const [confirmRemoveDemo,  setConfirmRemoveDemo]  = useState(false)

  useEffect(() => {
    if (!user?.isAdmin) return
    api.get('/projects/settings/ai-usage')
      .then(({ data }) => setAiUsage(data))
      .catch(() => setAiUsageError(true))
    api.get('/workspaces/current/features')
      .then(({ data }) => setWsFeatures(data))
      .catch(() => setWsFeatures([]))
    api.get('/workspaces/current/module-access')
      .then(({ data }) => setModuleAccess(data))
      .catch(() => setModuleAccess({}))
  }, [user?.isAdmin])

  // EOS habilitado → cargar proyectos + el proyecto asociado a tareas/reuniones
  const eosEnabled = !!wsFeatures?.some(f => f.key === 'eos' && !f.disabled)
  useEffect(() => {
    if (!user?.isAdmin || !eosEnabled) return
    api.get('/projects').then(({ data }) => setProjects(data || [])).catch(() => {})
    api.get('/eos').then(({ data }) => setEosMeetingProjectId(data?.meetingProjectId ?? '')).catch(() => {})
  }, [user?.isAdmin, eosEnabled])

  async function handleSaveEosProject(value) {
    const pid = value ? Number(value) : null
    const prev = eosMeetingProjectId
    setEosMeetingProjectId(value ? Number(value) : '')
    setSavingEosProject(true)
    try {
      await api.patch('/eos', { meetingProjectId: pid })
    } catch {
      setEosMeetingProjectId(prev)   // revertir si falla
    } finally {
      setSavingEosProject(false)
    }
  }

  useEffect(() => {
    if (!showAiDetail || !user?.isAdmin) return
    setAiDetailLoading(true)
    api.get(`/projects/settings/ai-usage?period=${aiDetailPeriod}`)
      .then(({ data }) => setAiDetailData(data))
      .catch(() => setAiDetailData(null))
      .finally(() => setAiDetailLoading(false))
  }, [showAiDetail, aiDetailPeriod, user?.isAdmin])

  useEffect(() => {
    if (!user?.isAdmin) return
    api.get('/projects/settings')
      .then(({ data }) => setGlobalSettings(data))
      .catch(() => setGlobalSettingsError(true))
  }, [user?.isAdmin])

  // Cargar estado de eliminación — todos los admins (para ver el banner y cancelar)
  useEffect(() => {
    if (!user?.isAdmin) return
    api.get('/workspaces/current/deletion-request')
      .then(({ data }) => { setDeletionRequest(data); setDeletionLoaded(true) })
      .catch(() => setDeletionLoaded(true))
    // Nombre del workspace + flag demoSeeded
    api.get('/workspaces/current')
      .then(({ data }) => {
        if (user?.role === 'owner' || user?.isSuperAdmin) setWorkspaceName(data.name || '')
        setDemoSeeded(!!data.demoSeeded)
      })
      .catch(() => {})
  }, [user?.isAdmin, user?.role, user?.isSuperAdmin])

  async function handleRemoveDemo() {
    setRemovingDemo(true)
    try {
      const { data } = await api.delete('/workspaces/current/demo-project')
      setDemoSeeded(false) // ocultar el botón aunque el proyecto pueda haber sido ya borrado
      window.alert(data.removed ? 'Proyecto demo eliminado correctamente.' : 'El proyecto demo ya no estaba en este workspace.')
    } catch (err) {
      window.alert(`Error: ${err.response?.data?.error || err.message}`)
    } finally {
      setRemovingDemo(false)
      setConfirmRemoveDemo(false)
    }
  }

  async function handleScheduleDeletion() {
    setDeletingWS(true)
    setDeletionMsg({ text: '', error: false })
    try {
      const { data } = await api.post('/workspaces/current/deletion-request')
      setDeletionRequest(data)
      setShowDeleteModal(false)
      setDeleteConfirmName('')
    } catch (err) {
      setDeletionMsg({ text: err.response?.data?.error || 'Error al programar la eliminación.', error: true })
    } finally {
      setDeletingWS(false)
    }
  }

  async function handleCancelDeletion() {
    setCancellingDel(true)
    try {
      await api.delete('/workspaces/current/deletion-request')
      setDeletionRequest(null)
    } catch (err) {
      setDeletionMsg({ text: err.response?.data?.error || 'Error al cancelar.', error: true })
    } finally {
      setCancellingDel(false)
    }
  }

  async function handleToggleFeature(key, currentlyDisabled) {
    const next = !currentlyDisabled
    setTogglingFeature(key)
    try {
      await api.patch(`/workspaces/current/features/${key}`, { disabled: next })
      setWsFeatures(prev => prev.map(f => f.key === key ? { ...f, disabled: next } : f))
    } catch (_) {}
    finally { setTogglingFeature(null) }
  }

  async function handleChangeModuleAccess(key, nextConfig) {
    const prev = moduleAccess?.[key]
    setModuleAccess(m => ({ ...m, [key]: nextConfig }))
    setSavingModuleAccess(key)
    try {
      await api.patch(`/workspaces/current/module-access/${key}`, nextConfig)
    } catch (_) {
      setModuleAccess(m => ({ ...m, [key]: prev }))
    } finally {
      setSavingModuleAccess(null)
    }
  }

  async function handleGlobalSetting(patch) {
    setGlobalSettings(prev => ({ ...prev, ...patch }))
    try {
      await api.patch('/projects/settings', patch)
      // El seguimiento de horarios, la tolerancia y la sección de Productividad viven en el workspace
      // y los leen otras vistas (RRHH, nav) vía contexto.
      if ('attendanceTrackingEnabled' in patch || 'lateToleranceMins' in patch || 'productivityEnabled' in patch) refreshWorkspace()
    } catch (_) {
      api.get('/projects/settings').then(({ data }) => setGlobalSettings(data))
    }
  }

  async function handleTestLateNotification() {
    setLateTest({ sending: true, msg: '', error: false })
    try {
      // Guarda primero el texto actual y luego envía el preview con ese mismo template.
      await api.patch('/projects/settings', { lateNotifyTemplate: globalSettings.lateNotifyTemplate })
      const { data } = await api.post('/projects/settings/late-notification/test', { template: globalSettings.lateNotifyTemplate })
      setLateTest({ sending: false, msg: `Enviado a ${data.sentTo}`, error: false })
    } catch (err) {
      setLateTest({ sending: false, msg: err.response?.data?.error || 'No se pudo enviar el email de prueba.', error: true })
    }
    setTimeout(() => setLateTest(s => ({ ...s, msg: '' })), 5000)
  }

  async function handleSendDigestNow() {
    setDigestTest({ sending: true, msg: '', error: false })
    try {
      const { data } = await api.post('/admin/productivity/digest/send-now')
      const detail = data.count > 0
        ? `${data.count} en alerta`
        : 'todo en orden, nadie en alerta'
      setDigestTest({ sending: false, msg: `Enviado a ${data.to} · ${detail}`, error: false })
    } catch (err) {
      setDigestTest({ sending: false, msg: err.response?.data?.error || 'No se pudo enviar el aviso de prueba.', error: true })
    }
    setTimeout(() => setDigestTest(s => ({ ...s, msg: '' })), 6000)
  }

  async function handleSendMarketingDigestNow() {
    setMarketingDigestTest({ sending: true, msg: '', error: false })
    try {
      const { data } = await api.post('/projects/settings/marketing-digest/test')
      const detail = data.count > 0
        ? `${data.count} proyecto${data.count === 1 ? '' : 's'} con pendientes`
        : 'todo al día, sin pendientes'
      setMarketingDigestTest({ sending: false, msg: `Enviado a ${data.to} · ${detail}`, error: false })
    } catch (err) {
      setMarketingDigestTest({ sending: false, msg: err.response?.data?.error || 'No se pudo enviar el aviso de prueba.', error: true })
    }
    setTimeout(() => setMarketingDigestTest(s => ({ ...s, msg: '' })), 6000)
  }

  return (
    <>
      {/* Consumo de IA */}
      {(() => {
        const fmtN = n => n >= 1_000_000 ? `${(n/1_000_000).toFixed(2)}M` : n >= 1_000 ? `${(n/1_000).toFixed(1)}K` : String(n)
        const SERVICE_LABELS = {
          insight:          'Insight diario',
          weeklyReport:     'Resumen semanal',
          insightMemory:    'Memoria de insights',
          geoAudit:         'Auditoría GEO',
          analyticsInsight: 'Análisis Analytics',
          seoAiInsight:     'Análisis SEO',
          pageSpeed:        'PageSpeed',
          orgAssessment:    'Evaluación EOS',
          keywordAnalysis:  'Análisis keyword',
        }
        const svcLabel = k => SERVICE_LABELS[k] || k
        const limit = aiUsage?.monthlyTokenLimit ?? 1000000
        const monthPct = aiUsage && limit > 0 ? Math.min(100, Math.round((aiUsage.month.total / limit) * 100)) : 0
        const weekPct = aiUsage && limit > 0 ? Math.min(100, Math.round((aiUsage.week.total / limit) * 100)) : 0
        const barColor = monthPct >= 95 ? 'bg-red-500' : monthPct >= 90 ? 'bg-amber-400' : 'bg-primary-500'
        const maxSvc = aiDetailData?.byService?.[0]?.total ?? 1
        const PERIOD_TABS = [
          { id: 'month',      label: 'Este mes'       },
          { id: 'prev_month', label: 'Mes anterior'   },
          { id: 'all',        label: 'Todo el tiempo' },
        ]

        return (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border dark:border-gray-700 p-6">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-1">Consumo de IA</h2>
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-5">Tokens usados en llamadas a Claude (insights, reportes semanales, memoria).</p>

            {aiUsageError ? (
              <p className="text-sm text-red-500 dark:text-red-400">No se pudieron cargar las estadísticas.</p>
            ) : !aiUsage ? (
              <LoadingSpinner size="sm" className="py-2" />
            ) : (
              <div className="space-y-4">
                {/* Cards resumen */}
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: 'Hoy',    data: aiUsage.day },
                    { label: 'Semana', data: aiUsage.week },
                    { label: 'Mes',    data: aiUsage.month },
                  ].map(({ label, data }) => (
                    <div key={label} className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-3 text-center">
                      <p className="text-lg font-bold text-gray-800 dark:text-white">{fmtN(data.total)}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{label}</p>
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                        <span className="text-blue-500">{fmtN(data.input)}</span> in · <span className="text-green-500">{fmtN(data.output)}</span> out
                      </p>
                    </div>
                  ))}
                </div>

                {/* Barra límite mensual */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-xs font-medium text-gray-700 dark:text-gray-300">Límite mensual</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{fmtN(aiUsage.month.total)} / {fmtN(limit)} ({monthPct}%)</p>
                  </div>
                  <div className="w-full h-2.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all duration-500 ${barColor}`} style={{ width: `${monthPct}%` }} />
                  </div>
                  {monthPct >= 95 && <p className="text-xs text-red-500 mt-1.5">🚫 Límite mensual alcanzado — las funcionalidades de IA están deshabilitadas.</p>}
                  {monthPct >= 90 && monthPct < 95 && <p className="text-xs text-amber-600 dark:text-amber-400 mt-1.5">⚠️ Cerca del límite mensual — quedan {fmtN(limit - aiUsage.month.total)} tokens.</p>}
                </div>

                {/* Botón desplegable */}
                <button
                  onClick={() => setShowAiDetail(v => !v)}
                  className="flex items-center gap-1.5 text-xs text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 font-medium transition-colors"
                >
                  <svg className={`w-3.5 h-3.5 transition-transform duration-200 ${showAiDetail ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                  {showAiDetail ? 'Ocultar detalle' : 'Ver detalle por servicio'}
                </button>

                {/* Sección desplegable */}
                {showAiDetail && (
                  <div className="space-y-4 pt-1">
                    {/* Selector de período */}
                    <div className="flex gap-1.5 bg-gray-100 dark:bg-gray-700 p-1 rounded-xl w-fit">
                      {PERIOD_TABS.map(t => (
                        <button
                          key={t.id}
                          onClick={() => setAiDetailPeriod(t.id)}
                          className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                            aiDetailPeriod === t.id
                              ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm'
                              : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                          }`}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>

                    {aiDetailLoading ? (
                      <div className="flex justify-center py-6">
                        <div className="w-5 h-5 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
                      </div>
                    ) : !aiDetailData || aiDetailData.byService?.length === 0 ? (
                      <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-6">Sin actividad para este período.</p>
                    ) : (
                      <div className="rounded-xl border border-gray-100 dark:border-gray-700 overflow-hidden">
                        {/* Total del período */}
                        <div className="px-4 py-3 bg-gray-50 dark:bg-gray-700/40 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
                          <p className="text-xs font-semibold text-gray-600 dark:text-gray-300">Total del período</p>
                          <div className="text-right">
                            <span className="text-sm font-bold text-gray-900 dark:text-white">{fmtN(aiDetailData.periodTotal.total)}</span>
                            <span className="text-xs text-gray-400 dark:text-gray-500 ml-2">
                              <span className="text-blue-500">{fmtN(aiDetailData.periodTotal.input)}</span> in · <span className="text-green-500">{fmtN(aiDetailData.periodTotal.output)}</span> out
                            </span>
                          </div>
                        </div>

                        {/* Filas por servicio */}
                        <div className="divide-y divide-gray-50 dark:divide-gray-700/50">
                          {aiDetailData.byService.map(svc => {
                            const pct = maxSvc > 0 ? Math.max(2, Math.round((svc.total / maxSvc) * 100)) : 0
                            return (
                              <div key={svc.service} className="px-4 py-3 flex items-center gap-3">
                                <p className="text-xs font-medium text-gray-700 dark:text-gray-300 w-36 shrink-0">{svcLabel(svc.service)}</p>
                                <div className="flex-1 h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                                  <div className="h-full bg-primary-500 rounded-full" style={{ width: `${pct}%` }} />
                                </div>
                                <div className="text-right shrink-0 w-28">
                                  <p className="text-xs font-semibold text-gray-800 dark:text-gray-200">{fmtN(svc.total)}</p>
                                  <p className="text-[10px] text-gray-400 dark:text-gray-500">
                                    <span className="text-blue-500">{fmtN(svc.inputTokens)}</span> in · <span className="text-green-500">{fmtN(svc.outputTokens)}</span> out
                                  </p>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })()}

      {/* Proyectos */}
      {globalSettingsError ? (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border dark:border-gray-700 p-6">
          <p className="text-sm text-red-500 dark:text-red-400">No se pudieron cargar las preferencias globales.</p>
        </div>
      ) : globalSettings && (
        <>
        {/* Zona horaria */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border dark:border-gray-700 p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-0.5">Zona horaria</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">Afecta cómo se muestran las fechas en la vista de cada proyecto.</p>
            </div>
            <select
              value={globalSettings.timezone || 'America/Argentina/Buenos_Aires'}
              onChange={e => handleGlobalSetting({ timezone: e.target.value })}
              className="text-xs border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary-400 min-w-[190px]"
            >
              {TIMEZONES.map(tz => (
                <option key={tz.value} value={tz.value}>{tz.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Proyectos */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border dark:border-gray-700 p-6">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-1">Proyectos</h2>
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-5">
            Configuración global compartida por todos los admins. Los cambios se aplican a todos los proyectos.
          </p>

          <div className="space-y-5">
            <div className="flex items-start justify-between gap-4 py-4 border-b dark:border-gray-700">
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-800 dark:text-gray-200">Links útiles</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Muestra la sección de links en la vista de todos los proyectos.</p>
              </div>
              <Toggle on={globalSettings.linksEnabled !== false} onToggle={() => handleGlobalSetting({ linksEnabled: !globalSettings.linksEnabled })} disabled={!loaded} />
            </div>

            <div className="flex items-start justify-between gap-4 py-4 border-b dark:border-gray-700">
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-800 dark:text-gray-200">Situación de la cuenta</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Muestra el editor de situación en la vista de todos los proyectos.</p>
              </div>
              <Toggle on={globalSettings.situationEnabled !== false} onToggle={() => handleGlobalSetting({ situationEnabled: !globalSettings.situationEnabled })} disabled={!loaded} />
            </div>

            <div className="flex items-start justify-between gap-4 py-4 border-b dark:border-gray-700">
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-800 dark:text-gray-200">Briefs</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Muestra la sección de briefs (cuestionarios de relevamiento) en la vista de todos los proyectos.</p>
              </div>
              <Toggle on={globalSettings.briefsEnabled !== false} onToggle={() => handleGlobalSetting({ briefsEnabled: !globalSettings.briefsEnabled })} disabled={!loaded} />
            </div>

            <div className="flex items-start justify-between gap-4 py-4">
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-800 dark:text-gray-200">Horas por proyecto</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Permite cargar un presupuesto mensual de horas por proyecto y compara el tiempo trabajado contra ese presupuesto en el reporte por proyecto.</p>
              </div>
              <Toggle on={!!globalSettings.hoursEnabled} onToggle={() => handleGlobalSetting({ hoursEnabled: !globalSettings.hoursEnabled })} disabled={!loaded} />
            </div>
          </div>
        </div>

        {/* Marketing */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border dark:border-gray-700 p-6">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-1">Marketing</h2>
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-5">
            Configuración global compartida por todos los admins.
          </p>

          <div className="space-y-5">
            <div className="flex items-start justify-between gap-4 py-4 border-b dark:border-gray-700">
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-800 dark:text-gray-200">Análisis automático de Ads (IA)</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Cada lunes analiza con IA las cuentas de Meta Ads / Google Ads conectadas de todos los proyectos y guarda el diagnóstico para el panel "Prioridades" — no hace falta apretar "Analizar" a mano. Solo corre en proyectos con una cuenta de ads conectada.</p>
              </div>
              <Toggle on={globalSettings.adsAdvisorAutoEnabled !== false} onToggle={() => handleGlobalSetting({ adsAdvisorAutoEnabled: !(globalSettings.adsAdvisorAutoEnabled !== false) })} disabled={!loaded} />
            </div>

            <div className="flex items-start justify-between gap-4 py-4 border-b dark:border-gray-700">
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-800 dark:text-gray-200">Análisis automático de RRSS (IA)</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Cada lunes analiza con IA las redes sociales conectadas de todos los proyectos (tendencia vs. el mes anterior, competencia, objetivos y brief de contenido orgánico) y guarda el diagnóstico para el panel "Prioridades". Solo corre en proyectos con alguna red social conectada.</p>
              </div>
              <Toggle on={globalSettings.rrssAdvisorAutoEnabled !== false} onToggle={() => handleGlobalSetting({ rrssAdvisorAutoEnabled: !(globalSettings.rrssAdvisorAutoEnabled !== false) })} disabled={!loaded} />
            </div>

            <div className="py-4 border-b dark:border-gray-700">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200">Aviso semanal de Prioridades por email</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Todos los lunes, si hay proyectos con recomendaciones de alta prioridad pendientes en Marketing (SEO/GEO, objetivos, RRSS, Ads, informes), se manda un resumen a los admins/owners.</p>
                </div>
                <Toggle on={globalSettings.marketingDigestEnabled !== false} onToggle={() => handleGlobalSetting({ marketingDigestEnabled: !(globalSettings.marketingDigestEnabled !== false) })} disabled={!loaded} />
              </div>
              {globalSettings.marketingDigestEnabled !== false && (
                <div className="mt-4 ml-1 pl-4 border-l-2 border-gray-100 dark:border-gray-700">
                  <div className="flex items-center gap-3 flex-wrap">
                    <button
                      onClick={handleSendMarketingDigestNow}
                      disabled={marketingDigestTest.sending}
                      className="text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors"
                    >
                      {marketingDigestTest.sending ? 'Enviando…' : '✉️ Enviar ahora a mi correo'}
                    </button>
                    {marketingDigestTest.msg && (
                      <span className={`text-xs ${marketingDigestTest.error ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>{marketingDigestTest.msg}</span>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-start justify-between gap-4 py-4">
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-800 dark:text-gray-200">Alertas SEO automáticas</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Compara Search Console del mes cerrado vs. el anterior y avisa por email a los admins si hay caídas relevantes (clicks, posición, Domain Rating, keywords fuera del top 10). Corre el 1° de cada mes.</p>
              </div>
              <Toggle on={globalSettings.seoAlertsEnabled !== false} onToggle={() => handleGlobalSetting({ seoAlertsEnabled: !(globalSettings.seoAlertsEnabled !== false) })} disabled={!loaded} />
            </div>
          </div>
        </div>

        {/* Administración */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border dark:border-gray-700 p-6">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-1">Administración</h2>
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-5">
            Visibilidad y seguimiento del equipo. Los cambios aplican a todo el workspace.
          </p>

          <div className="space-y-5">
            <div className="py-4 border-b dark:border-gray-700">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200">Sección de Productividad</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Muestra la sección Administración → Productividad: ritmo, horas, asistencia y estado de cada persona. Si la apagás, se oculta del menú.</p>
                </div>
                <Toggle on={globalSettings.productivityEnabled !== false} onToggle={() => handleGlobalSetting({ productivityEnabled: !(globalSettings.productivityEnabled !== false) })} disabled={!loaded} />
              </div>

              {globalSettings.productivityEnabled !== false && (
                <div className="mt-4 ml-1 pl-4 border-l-2 border-gray-100 dark:border-gray-700 space-y-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-200">Aviso semanal automático</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Cada lunes a la mañana enviamos un mail a los administradores con las personas que necesitan atención (en baja, inactivas o con tareas atascadas). Solo se envía si hay alguien en alerta.</p>
                    </div>
                    <Toggle on={globalSettings.productivityDigestEnabled !== false} onToggle={() => handleGlobalSetting({ productivityDigestEnabled: !(globalSettings.productivityDigestEnabled !== false) })} disabled={!loaded} />
                  </div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <button
                      onClick={handleSendDigestNow}
                      disabled={digestTest.sending}
                      className="text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors"
                    >
                      {digestTest.sending ? 'Enviando…' : '✉️ Enviar ahora a mi correo'}
                    </button>
                    {digestTest.msg && (
                      <span className={`text-xs ${digestTest.error ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>{digestTest.msg}</span>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className={`flex items-start justify-between gap-4 py-4 ${globalSettings.attendanceTrackingEnabled !== false ? 'border-b dark:border-gray-700' : ''}`}>
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-800 dark:text-gray-200">Seguimiento de horarios y puntualidad</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Mide llegadas, tardanzas y puntualidad del equipo en RRHH comparando el horario laboral de cada persona con su primer ingreso. Desactivalo si tu equipo no trabaja con horarios fijos (ej: full freelance o distintas franjas horarias): se ocultan las tarjetas de puntualidad.</p>
              </div>
              <Toggle on={globalSettings.attendanceTrackingEnabled !== false} onToggle={() => handleGlobalSetting({ attendanceTrackingEnabled: !(globalSettings.attendanceTrackingEnabled !== false) })} disabled={!loaded} />
            </div>

            {globalSettings.attendanceTrackingEnabled !== false && (
              <>
                <div className="flex items-start justify-between gap-4 py-4 border-b dark:border-gray-700 pl-4 border-l-2 border-l-gray-100 dark:border-l-gray-700">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-200">Tolerancia para tardanza</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Minutos de gracia después del horario de ingreso. Con 5, una llegada hasta 5 min tarde no cuenta como tardanza (9:05 con horario 9:00 está OK; 9:06 es tardanza). Aplica a las tardanzas por persona y del equipo.</p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <input
                      type="number" min="0" max="120"
                      value={globalSettings.lateToleranceMins ?? 0}
                      onChange={e => setGlobalSettings(p => ({ ...p, lateToleranceMins: e.target.value }))}
                      onBlur={e => handleGlobalSetting({ lateToleranceMins: Math.max(0, Math.min(120, Number(e.target.value) || 0)) })}
                      className="w-20 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-1.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                    <span className="text-sm text-gray-500 dark:text-gray-400">min</span>
                  </div>
                </div>

                <div className="flex items-start justify-between gap-4 py-4 pl-4 border-l-2 border-l-gray-100 dark:border-l-gray-700">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-200">Notificación por email</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Envía un email a quien acumula tardanzas en los últimos 30 días, invitando a regularizar el horario.</p>
                  </div>
                  <Toggle on={!!globalSettings.lateNotifyEnabled} onToggle={() => handleGlobalSetting({ lateNotifyEnabled: !globalSettings.lateNotifyEnabled })} disabled={!loaded} />
                </div>

                {globalSettings.lateNotifyEnabled && (
                  <div className="pl-4 border-l-2 border-l-gray-100 dark:border-l-gray-700 pb-4 space-y-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-800 dark:text-gray-200">Enviar después de</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Cantidad de tardanzas (en 30 días) que dispara el email. Con 1, se envía la primera vez que llega tarde; con 3, después de la tercera. Se envía una sola vez cada 30 días por persona.</p>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <input
                          type="number" min="1" max="10"
                          value={globalSettings.lateNotifyThreshold ?? 3}
                          onChange={e => setGlobalSettings(p => ({ ...p, lateNotifyThreshold: e.target.value }))}
                          onBlur={e => handleGlobalSetting({ lateNotifyThreshold: Math.max(1, Math.min(10, Number(e.target.value) || 1)) })}
                          className="w-20 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-1.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-primary-500"
                        />
                        <span className="text-sm text-gray-500 dark:text-gray-400">tardanzas</span>
                      </div>
                    </div>

                    <div>
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-200 mb-1">Texto del email</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Podés usar <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">[Nombre]</code> y <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">[workspace]</code>; se reemplazan automáticamente al enviar.</p>
                      <textarea
                        rows={12}
                        value={globalSettings.lateNotifyTemplate ?? ''}
                        onChange={e => setGlobalSettings(p => ({ ...p, lateNotifyTemplate: e.target.value }))}
                        onBlur={e => handleGlobalSetting({ lateNotifyTemplate: e.target.value })}
                        className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-y leading-relaxed"
                      />
                      <div className="flex items-center gap-3 mt-2">
                        <button
                          type="button"
                          onClick={handleTestLateNotification}
                          disabled={lateTest.sending}
                          className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-60 transition-colors"
                        >
                          {lateTest.sending ? 'Enviando…' : '✉️ Probar ahora'}
                        </button>
                        <span className="text-xs text-gray-500 dark:text-gray-400">Te envía este email a tu casilla para ver cómo llega.</span>
                      </div>
                      {lateTest.msg && (
                        <p className={`text-sm mt-1.5 ${lateTest.error ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                          {lateTest.msg}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}

          </div>
        </div>
        </>
      )}

      {/* ── Módulos adicionales ── */}
      {moduleAccess && wsFeatures && wsFeatures.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border dark:border-gray-700 p-6">
          <div className="flex items-center gap-2 mb-1">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">Módulos adicionales</h2>
          </div>
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-5">
            Funcionalidades opcionales de tu workspace. Podés desactivar las que no uses y elegir qué roles del equipo ven cada una (los administradores siempre acceden).
          </p>
          <div className="space-y-0">
            {(wsFeatures ?? []).map((feat, idx) => {
              const meta = moduleMeta(feat.key, feat.description)
              const isLast = idx === (wsFeatures?.length ?? 0) - 1
              return (
                <div key={feat.key} className={`py-4 ${isLast ? '' : 'border-b dark:border-gray-700'}`}>
                  <div className="flex items-start gap-4">
                    <span className="text-2xl flex-shrink-0 mt-0.5">{meta.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{feat.name}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed mt-0.5">{meta.detail}</p>
                      {feat.disabled && (
                        <span className="inline-block mt-1.5 text-xs bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded-full px-2 py-0.5">
                          Desactivado en este workspace
                        </span>
                      )}
                    </div>
                    <Toggle
                      on={!feat.disabled}
                      onToggle={() => handleToggleFeature(feat.key, feat.disabled)}
                      disabled={togglingFeature === feat.key || !loaded}
                    />
                  </div>

                  {/* EOS y Gamification quedan estrictamente admin-only, sin acceso configurable por
                      rol — moduleAccess[feat.key] no viene para esas claves (ver lib/moduleAccess.js). */}
                  {!feat.disabled && moduleAccess[feat.key] && (
                    <ModuleAccessEditor
                      config={moduleAccess[feat.key]}
                      onChange={next => handleChangeModuleAccess(feat.key, next)}
                      disabled={savingModuleAccess === feat.key}
                    />
                  )}

                  {/* EOS habilitado → proyecto asociado a tareas y reuniones */}
                  {feat.key === 'eos' && !feat.disabled && (
                    <div className="mt-3 ml-12 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/30 p-3">
                      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Proyecto para tareas y reuniones de EOS
                      </label>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-2 leading-snug">
                        El tiempo de las reuniones L10 y las tareas enviadas al dashboard se registran en este proyecto.
                        Las reuniones también traen automáticamente a su equipo.
                      </p>
                      <select
                        value={eosMeetingProjectId || ''}
                        onChange={e => handleSaveEosProject(e.target.value)}
                        disabled={savingEosProject}
                        className="w-full sm:w-80 text-sm border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-1.5 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-primary-400 disabled:opacity-60"
                      >
                        <option value="">— Elegir proyecto —</option>
                        {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                      {!eosMeetingProjectId && (
                        <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1.5">
                          Asociá un proyecto para poder iniciar reuniones y enviar To-Dos al dashboard.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Zona de peligro / banner de eliminación ── */}
      {deletionLoaded && (
        <>
          {/* Banner activo cuando hay eliminación programada — todos los admins */}
          {deletionRequest && !deletionRequest.cancelledAt && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl p-5">
              <div className="flex items-start gap-3">
                <span className="text-red-500 text-xl flex-shrink-0">⚠️</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-red-700 dark:text-red-400 mb-1">
                    Este workspace está programado para eliminarse
                  </p>
                  <p className="text-xs text-red-600 dark:text-red-500 mb-1">
                    Solicitado por <strong>{deletionRequest.requestedBy?.name}</strong>.
                    Se eliminará permanentemente el{' '}
                    <strong>
                      {new Date(deletionRequest.scheduledAt).toLocaleString('es-AR', {
                        timeZone: 'America/Argentina/Buenos_Aires',
                        day: 'numeric', month: 'long', year: 'numeric',
                        hour: '2-digit', minute: '2-digit',
                      })}
                    </strong>{' '}
                    (hora de Argentina).
                  </p>
                  <p className="text-xs text-red-500 dark:text-red-600 mb-3">
                    Una vez eliminado, no hay forma de recuperar los datos.
                  </p>
                  <button
                    onClick={handleCancelDeletion}
                    disabled={cancellingDel}
                    className="text-sm font-medium bg-green-600 hover:bg-green-700 text-white rounded-xl px-4 py-2 transition-colors disabled:opacity-50"
                  >
                    {cancellingDel ? 'Cancelando...' : 'Cancelar eliminación'}
                  </button>
                  {deletionMsg.text && (
                    <p className="mt-2 text-xs text-red-600 dark:text-red-400">{deletionMsg.text}</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Proyecto demo del onboarding — solo si está activo */}
          {demoSeeded && (user?.isAdmin || user?.isSuperAdmin) && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 mb-4">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-1">Proyecto demo</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-5">
                "Demo — Aprendé BlissTracker" es el proyecto de ejemplo que se crea al registrarse. Cuando ya conozcas el flujo, podés eliminarlo (no afecta a otros proyectos).
              </p>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200">Eliminar proyecto demo</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    Borra el proyecto demo y sus tareas. No se vuelve a crear.
                  </p>
                </div>
                <button
                  onClick={() => setConfirmRemoveDemo(true)}
                  disabled={removingDemo}
                  className="flex-shrink-0 text-sm font-medium bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-600 rounded-xl px-4 py-2 transition-colors disabled:opacity-50 whitespace-nowrap"
                >
                  {removingDemo ? 'Eliminando…' : 'Eliminar demo'}
                </button>
              </div>
            </div>
          )}

          {/* Sección zona de peligro — solo owners, cuando NO hay eliminación activa */}
          {(!deletionRequest || deletionRequest.cancelledAt) && (user?.role === 'owner' || user?.isSuperAdmin) && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-red-200 dark:border-red-900/50 p-6">
              <h2 className="text-base font-semibold text-red-600 dark:text-red-500 mb-1">Zona de peligro</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-5">
                Estas acciones son irreversibles. Procedé con cuidado.
              </p>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200">Eliminar workspace</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    Elimina permanentemente este workspace y todos sus datos en 48 horas. Se notificará a todos los administradores.
                  </p>
                </div>
                <button
                  onClick={() => { setShowDeleteModal(true); setDeletionMsg({ text: '', error: false }) }}
                  className="flex-shrink-0 text-sm font-medium bg-red-50 dark:bg-red-900/30 hover:bg-red-100 dark:hover:bg-red-900/50 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 rounded-xl px-4 py-2 transition-colors whitespace-nowrap"
                >
                  Eliminar workspace
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Modal de confirmación de eliminación */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-md w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <span className="text-2xl">⚠️</span>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">Eliminar workspace</h2>
            </div>
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 mb-5">
              <p className="text-sm text-red-700 dark:text-red-400 font-medium mb-1">Esta acción es irreversible</p>
              <p className="text-xs text-red-600 dark:text-red-500">
                Se eliminará permanentemente en <strong>48 horas</strong>: proyectos, tareas, miembros, insights, reportes y todos los datos del workspace. Se enviará un email a todos los administradores con la opción de cancelar.
              </p>
            </div>
            <div className="mb-5">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Para confirmar, escribí el nombre del workspace:{' '}
                <strong className="text-gray-900 dark:text-white">{workspaceName}</strong>
              </label>
              <input
                type="text"
                value={deleteConfirmName}
                onChange={e => setDeleteConfirmName(e.target.value)}
                placeholder={workspaceName}
                className="w-full text-sm border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-red-400"
                autoFocus
              />
            </div>
            {deletionMsg.text && (
              <p className="mb-4 text-sm bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg px-3 py-2">
                {deletionMsg.text}
              </p>
            )}
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => { setShowDeleteModal(false); setDeleteConfirmName(''); setDeletionMsg({ text: '', error: false }) }}
                className="text-sm font-medium px-4 py-2 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleScheduleDeletion}
                disabled={deletingWS || deleteConfirmName !== (workspaceName)}
                className="text-sm font-medium px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white transition-colors disabled:opacity-40"
              >
                {deletingWS ? 'Programando...' : 'Confirmar eliminación'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={confirmRemoveDemo}
        title="Eliminar proyecto demo"
        message='Borra "Demo — Aprendé BlissTracker" y sus tareas. Esta acción no se puede deshacer.'
        loading={removingDemo}
        onConfirm={handleRemoveDemo}
        onCancel={() => setConfirmRemoveDemo(false)}
      />
    </>
  )
}
