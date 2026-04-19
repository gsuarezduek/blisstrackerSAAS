import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import Navbar from '../components/Navbar'
import api from '../api/client'
import { useAuth } from '../context/AuthContext'

export default function Preferences() {
  const { user, updateUser } = useAuth()
  const [prefTab, setPrefTab] = useState('global')
  const [weeklyEmail,  setWeeklyEmail]  = useState(true)
  const [dailyInsight, setDailyInsight] = useState(true)
  const [togglingW,    setTogglingW]    = useState(false)
  const [togglingD,    setTogglingD]    = useState(false)
  const [sending,      setSending]      = useState(false)
  const [sendMsg,      setSendMsg]      = useState({ text: '', error: false })
  const [loaded,         setLoaded]         = useState(false)
  const [globalSettings,      setGlobalSettings]      = useState(null)
  const [globalSettingsError, setGlobalSettingsError] = useState(false)
  const [aiUsage,             setAiUsage]             = useState(null)
  const [aiUsageError,        setAiUsageError]        = useState(false)

  // Eliminación de workspace
  const [workspaceName,      setWorkspaceName]      = useState('')
  const [deletionRequest,    setDeletionRequest]    = useState(null)   // null | { scheduledAt, requestedBy }
  const [deletionLoaded,     setDeletionLoaded]     = useState(false)
  const [showDeleteModal,    setShowDeleteModal]     = useState(false)
  const [deleteConfirmName,  setDeleteConfirmName]  = useState('')
  const [deletingWS,         setDeletingWS]         = useState(false)
  const [cancellingDel,      setCancellingDel]      = useState(false)
  const [deletionMsg,        setDeletionMsg]        = useState({ text: '', error: false })


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

  useEffect(() => {
    api.get('/profile').then(({ data }) => {
      setWeeklyEmail(data.weeklyEmailEnabled   ?? true)
      setDailyInsight(data.dailyInsightEnabled ?? true)
      setLoaded(true)
    })
  }, [])

  useEffect(() => {
    if (!user?.isAdmin) return
    api.get('/projects/settings/ai-usage')
      .then(({ data }) => setAiUsage(data))
      .catch(() => setAiUsageError(true))
  }, [user?.isAdmin])

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
    // Nombre del workspace — solo owners lo necesitan para el modal de confirmación
    if (user?.role === 'owner' || user?.isSuperAdmin) {
      api.get('/workspaces/current')
        .then(({ data }) => setWorkspaceName(data.name || ''))
        .catch(() => {})
    }
  }, [user?.isAdmin, user?.role, user?.isSuperAdmin])

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

  async function handleGlobalSetting(patch) {
    setGlobalSettings(prev => ({ ...prev, ...patch }))
    try {
      await api.patch('/projects/settings', patch)
    } catch (_) {
      api.get('/projects/settings').then(({ data }) => setGlobalSettings(data))
    }
  }

  async function handleToggleWeekly() {
    const next = !weeklyEmail
    setTogglingW(true)
    try {
      await api.patch('/profile/preferences', { weeklyEmailEnabled: next })
      setWeeklyEmail(next)
    } catch (_) {}
    finally { setTogglingW(false) }
  }

  async function handleToggleInsight() {
    const next = !dailyInsight
    setTogglingD(true)
    try {
      // Al apagar el insight se apagan también los sub-features
      await api.patch('/profile/preferences', {
        dailyInsightEnabled:  next,
        insightMemoryEnabled: next,
        taskQualityEnabled:   next,
      })
      setDailyInsight(next)
      updateUser({ dailyInsightEnabled: next })
    } catch (_) {}
    finally { setTogglingD(false) }
  }

  async function handleSendNow() {
    setSending(true)
    setSendMsg({ text: '', error: false })
    try {
      await api.post('/profile/weekly-email/send')
      setSendMsg({ text: '¡Email enviado! Revisá tu bandeja de entrada.', error: false })
    } catch (err) {
      setSendMsg({ text: err.response?.data?.error || 'Error al enviar el email.', error: true })
    } finally {
      setSending(false)
    }
  }

  function Toggle({ on, onToggle, disabled }) {
    return (
      <button
        onClick={onToggle}
        disabled={disabled || !loaded}
        title={on ? 'Desactivar' : 'Activar'}
        className={`relative flex-shrink-0 w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none disabled:opacity-50 ${
          on ? 'bg-primary-600' : 'bg-gray-300 dark:bg-gray-600'
        }`}
      >
        <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${
          on ? 'translate-x-5' : 'translate-x-0'
        }`} />
      </button>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Navbar />
      <main className="max-w-2xl mx-auto px-4 py-8 space-y-6">

        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Preferencias</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Configurá cómo querés usar BlissTracker.</p>
        </div>

        {/* Tabs — solo admins */}
        {user?.isAdmin && (
          <div className="mb-2">
            <select
              className="sm:hidden w-full px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary-500"
              value={prefTab}
              onChange={e => setPrefTab(e.target.value)}
            >
              <option value="global">Globales</option>
              <option value="personal">Personales</option>
            </select>
            <div className="hidden sm:flex gap-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-1 w-fit">
              {[{ id: 'global', label: 'Globales' }, { id: 'personal', label: 'Personales' }].map(t => (
                <button
                  key={t.id}
                  onClick={() => setPrefTab(t.id)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    prefTab === t.id
                      ? 'bg-primary-600 text-white'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Tab: Globales (solo admins) ─────────────────────── */}
        {user?.isAdmin && prefTab === 'global' && (
          <>
            {/* Consumo de IA */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl border dark:border-gray-700 p-6">
              <div className="flex items-center gap-2 mb-1">
                <h2 className="text-base font-semibold text-gray-900 dark:text-white">Consumo de IA</h2>
                <span className="text-xs bg-primary-100 dark:bg-primary-900/40 text-primary-600 dark:text-primary-400 rounded-full px-2 py-0.5 font-medium">Admin</span>
              </div>
              <p className="text-xs text-gray-400 dark:text-gray-500 mb-5">Tokens usados en llamadas a Claude (insights, reportes semanales, memoria).</p>

              {aiUsageError ? (
                <p className="text-sm text-red-500 dark:text-red-400">No se pudieron cargar las estadísticas.</p>
              ) : !aiUsage ? (
                <p className="text-sm text-gray-400 dark:text-gray-500 animate-pulse">Cargando estadísticas...</p>
              ) : (() => {
                const limit = globalSettings?.aiWeeklyTokenLimit ?? 500000
                const weekPct = limit > 0 ? Math.min(100, Math.round((aiUsage.week.total / limit) * 100)) : 0
                const barColor = weekPct >= 90 ? 'bg-red-500' : weekPct >= 70 ? 'bg-amber-400' : 'bg-primary-500'
                const fmtN = n => n >= 1000000 ? `${(n/1000000).toFixed(2)}M` : n >= 1000 ? `${(n/1000).toFixed(1)}k` : String(n)
                return (
                  <div className="space-y-4">
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
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <p className="text-xs font-medium text-gray-700 dark:text-gray-300">Límite semanal</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{fmtN(aiUsage.week.total)} / {fmtN(limit)} ({weekPct}%)</p>
                      </div>
                      <div className="w-full h-2.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all duration-500 ${barColor}`} style={{ width: `${weekPct}%` }} />
                      </div>
                      {weekPct >= 90 && <p className="text-xs text-red-500 mt-1.5">⚠️ Estás cerca del límite semanal de referencia.</p>}
                    </div>
                  </div>
                )
              })()}
            </div>

            {/* Proyectos */}
            {globalSettingsError ? (
              <div className="bg-white dark:bg-gray-800 rounded-2xl border dark:border-gray-700 p-6">
                <p className="text-sm text-red-500 dark:text-red-400">No se pudieron cargar las preferencias globales.</p>
              </div>
            ) : globalSettings && (
              <div className="bg-white dark:bg-gray-800 rounded-2xl border dark:border-gray-700 p-6">
                <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-1">Proyectos</h2>
                <p className="text-xs text-gray-400 dark:text-gray-500 mb-5">
                  Configuración global compartida por todos los admins. Los cambios se aplican a todos los proyectos.
                </p>

                <div className="space-y-5">
                  <div className="flex items-start justify-between gap-4 py-4 border-b dark:border-gray-700">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-200">Zona horaria</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Afecta cómo se muestran las fechas en la vista de cada proyecto.</p>
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

                  <div className="flex items-start justify-between gap-4 py-4 border-b dark:border-gray-700">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-200">Links útiles</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Muestra la sección de links en la vista de todos los proyectos.</p>
                    </div>
                    <Toggle on={globalSettings.linksEnabled !== false} onToggle={() => handleGlobalSetting({ linksEnabled: !globalSettings.linksEnabled })} />
                  </div>

                  <div className="flex items-start justify-between gap-4 py-4 border-b dark:border-gray-700">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-200">Situación de la cuenta</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Muestra el editor de situación en la vista de todos los proyectos.</p>
                    </div>
                    <Toggle on={globalSettings.situationEnabled !== false} onToggle={() => handleGlobalSetting({ situationEnabled: !globalSettings.situationEnabled })} />
                  </div>

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
          </>
        )}

        {/* ── Tab: Personales (no-admins siempre, admins si prefTab=personal) ── */}
        {(!user?.isAdmin || prefTab === 'personal') && (
          <>
            {/* Insight diario con IA */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl border dark:border-gray-700 p-6">
              <div className="flex items-start justify-between gap-4 mb-5">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h2 className="text-base font-semibold text-gray-900 dark:text-white">Insight diario con IA</h2>
                    <span className="text-xs bg-primary-100 dark:bg-primary-900/40 text-primary-600 dark:text-primary-400 rounded-full px-2 py-0.5 font-medium">IA</span>
                  </div>
                  <p className="text-xs text-gray-400 dark:text-gray-500">
                    Un coach de productividad personal basado en GTD que analiza tus tareas cada día y genera recomendaciones concretas y accionables.
                  </p>
                </div>
                <Toggle on={dailyInsight} onToggle={handleToggleInsight} disabled={togglingD} />
              </div>
              <div className={`space-y-0 border-t dark:border-gray-700 transition-opacity duration-200 ${dailyInsight ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
                <div className="flex items-start gap-3 py-4 border-b dark:border-gray-700">
                  <div className="mt-0.5 flex-shrink-0 text-green-500">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                      <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-200">Memoria de aprendizaje</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed mt-0.5">
                      El sistema aprende de tus patrones semana a semana: cuándo tendés a bloquearte, en qué proyectos rendís mejor y qué días son más productivos. El insight evoluciona con vos.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3 py-4 border-b dark:border-gray-700">
                  <div className="mt-0.5 flex-shrink-0 text-green-500">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                      <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-200">Coaching de calidad de tareas</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed mt-0.5">
                      La IA detecta tareas con descripciones vagas y sugiere reformularlas como acciones concretas según GTD. "Trabajar en web" se convierte en "Enviar 3 opciones de homepage para aprobación".
                    </p>
                  </div>
                </div>
                {user?.isAdmin && (
                  <div className="flex items-start gap-3 py-4">
                    <div className="mt-0.5 flex-shrink-0 text-green-500">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                        <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-200">Conocimiento de roles</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed mt-0.5">
                        El insight detecta tareas recurrentes esperadas según el rol que no fueron registradas.
                      </p>
                    </div>
                    <Link to="/admin?tab=role-ai"
                      className="flex-shrink-0 text-xs px-3 py-1.5 rounded-lg font-medium bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 hover:bg-primary-100 dark:hover:bg-primary-900/50 border border-primary-200 dark:border-primary-800 transition-colors whitespace-nowrap">
                      Configurar →
                    </Link>
                  </div>
                )}
              </div>
            </div>

            {/* Notificaciones y comunicación */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl border dark:border-gray-700 p-6">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-1">Notificaciones y comunicación</h2>
              <p className="text-xs text-gray-400 dark:text-gray-500 mb-5">Elegí qué comunicaciones querés recibir por email.</p>
              <div className="flex items-start justify-between gap-4 py-4 border-b dark:border-gray-700">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium text-gray-800 dark:text-gray-200">Resumen semanal de productividad</span>
                    <span className="text-xs bg-primary-100 dark:bg-primary-900/40 text-primary-600 dark:text-primary-400 rounded-full px-2 py-0.5 font-medium">IA</span>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                    Recibís un análisis de tu semana generado por inteligencia artificial cada <strong className="text-gray-600 dark:text-gray-300">viernes a primera hora</strong>. Incluye tareas completadas, tiempo por proyecto, insights de productividad y recomendaciones accionables.
                  </p>
                </div>
                <Toggle on={weeklyEmail} onToggle={handleToggleWeekly} disabled={togglingW} />
              </div>
              <div className="pt-4">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div>
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Enviar resumen ahora</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Genera y envía el resumen de esta semana de forma inmediata.</p>
                  </div>
                  <button onClick={handleSendNow} disabled={sending}
                    className="flex-shrink-0 flex items-center gap-2 bg-primary-50 dark:bg-primary-900/30 hover:bg-primary-100 dark:hover:bg-primary-900/50 text-primary-600 dark:text-primary-400 border border-primary-200 dark:border-primary-800 text-sm font-medium rounded-xl px-4 py-2 transition-colors disabled:opacity-50">
                    {sending ? (
                      <>
                        <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                        </svg>
                        Generando...
                      </>
                    ) : (
                      <>
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                          <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
                        </svg>
                        Enviar ahora
                      </>
                    )}
                  </button>
                </div>
                {sendMsg.text && (
                  <p className={`mt-3 text-sm rounded-lg px-3 py-2 ${sendMsg.error ? 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400' : 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400'}`}>
                    {sendMsg.text}
                  </p>
                )}
              </div>
            </div>
          </>
        )}

      </main>

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
    </div>
  )
}
