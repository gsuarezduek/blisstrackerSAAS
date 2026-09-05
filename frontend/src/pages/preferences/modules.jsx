import { useState, useEffect } from 'react'
import api from '../../api/client'
import { useAuth } from '../../context/AuthContext'
import { useWorkspace } from '../../context/WorkspaceContext'
import { moduleMeta } from '../../lib/moduleCatalog'
import ModuleAccessEditor from '../../components/ModuleAccessEditor'
import { invalidateFeatureFlag } from '../../hooks/useFeatureFlag'
import { NAV, SECTION_DESCRIPTIONS } from '../../components/marketing/marketingNav'
import { Toggle } from './shared'

// Toda la configuración de un módulo opcional en un solo lugar: encendido/apagado,
// acceso por rol, y lo específico de cada módulo (hoy solo Marketing tiene algo
// propio: qué pestañas se ven + sus automatizaciones/avisos por email). Antes esto
// vivía repartido en 3 sitios distintos (⚙️ dentro de Marketing, bloque "Marketing"
// y bloque "Módulos adicionales" en Preferencias → Globales), lo que confundía cuál
// "on/off" era cuál.
export default function ModulesTab({ loaded }) {
  const { user } = useAuth()
  const { refreshWorkspace } = useWorkspace()

  const [wsFeatures,         setWsFeatures]         = useState(null)
  const [togglingFeature,    setTogglingFeature]    = useState(null)
  const [moduleAccess,       setModuleAccess]       = useState(null)
  const [savingModuleAccess, setSavingModuleAccess] = useState(null)

  // EOS: proyecto asociado para tareas y reuniones
  const [projects,            setProjects]            = useState([])
  const [eosMeetingProjectId, setEosMeetingProjectId] = useState('')
  const [savingEosProject,    setSavingEosProject]    = useState(false)

  // Marketing: configuración propia del módulo
  const [globalSettings,      setGlobalSettings]      = useState(null)
  const [sectionsErr,         setSectionsErr]         = useState('')
  const [marketingDigestTest, setMarketingDigestTest] = useState({ sending: false, msg: '', error: false })

  useEffect(() => {
    if (!user?.isAdmin) return
    api.get('/workspaces/current/features').then(({ data }) => setWsFeatures(data)).catch(() => setWsFeatures([]))
    api.get('/workspaces/current/module-access').then(({ data }) => setModuleAccess(data)).catch(() => setModuleAccess({}))
    api.get('/projects/settings').then(({ data }) => setGlobalSettings(data)).catch(() => {})
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
      setEosMeetingProjectId(prev)
    } finally {
      setSavingEosProject(false)
    }
  }

  async function handleToggleFeature(key, currentlyDisabled) {
    const next = !currentlyDisabled
    setTogglingFeature(key)
    try {
      await api.patch(`/workspaces/current/features/${key}`, { disabled: next })
      setWsFeatures(prev => prev.map(f => f.key === key ? { ...f, disabled: next } : f))
      invalidateFeatureFlag(key)
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
      if ('marketingDisabledSections' in patch) refreshWorkspace()
    } catch (_) {
      api.get('/projects/settings').then(({ data }) => setGlobalSettings(data))
    }
  }

  async function handleToggleNavSection(id) {
    setSectionsErr('')
    const current = globalSettings?.marketingDisabledSections || []
    const next = current.includes(id) ? current.filter(x => x !== id) : [...current, id]
    if (next.length >= NAV.length) {
      setSectionsErr('Debe quedar al menos una pestaña visible.')
      return
    }
    handleGlobalSetting({ marketingDisabledSections: next })
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

  if (!moduleAccess || !wsFeatures) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-2xl border dark:border-gray-700 p-6">
        <p className="text-sm text-gray-400 dark:text-gray-500">Cargando…</p>
      </div>
    )
  }

  const disabledSections = globalSettings?.marketingDisabledSections || []

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border dark:border-gray-700 p-6">
      <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-1">Módulos</h2>
      <p className="text-xs text-gray-400 dark:text-gray-500 mb-5">
        Funcionalidades opcionales de tu workspace: encendido/apagado, quién las ve, y su configuración propia — todo junto por módulo.
      </p>

      <div className="space-y-0">
        {wsFeatures.map((feat, idx) => {
          const meta = moduleMeta(feat.key, feat.description)
          const isLast = idx === wsFeatures.length - 1
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

              {/* Marketing habilitado → pestañas visibles + automatizaciones/avisos */}
              {feat.key === 'marketing' && !feat.disabled && globalSettings && (
                <div className="mt-3 ml-12 space-y-4">

                  <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/30 p-3">
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Pestañas visibles
                    </label>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-2 leading-snug">
                      Elegí qué pestañas ve el equipo dentro de Marketing. Útil para ocultar las que no aplican a este workspace.
                    </p>
                    <div className="space-y-0.5">
                      {NAV.map(n => (
                        <label key={n.id} className="flex items-start gap-2.5 py-1.5 px-1 rounded-lg hover:bg-white dark:hover:bg-gray-700/60 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={!disabledSections.includes(n.id)}
                            onChange={() => handleToggleNavSection(n.id)}
                            className="mt-0.5 rounded border-gray-300 text-primary-600 focus:ring-primary-500 flex-shrink-0"
                          />
                          <span className="min-w-0">
                            <span className="block text-xs font-medium text-gray-800 dark:text-gray-200">{n.label}</span>
                            <span className="block text-[11px] text-gray-400 dark:text-gray-500">{SECTION_DESCRIPTIONS[n.id]}</span>
                          </span>
                        </label>
                      ))}
                    </div>
                    {sectionsErr && <p className="text-[11px] text-red-600 dark:text-red-400 mt-1.5">{sectionsErr}</p>}
                  </div>

                  <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/30 p-3">
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Automatizaciones y avisos
                    </label>

                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-4 pb-3 border-b border-gray-200/70 dark:border-gray-700">
                        <div className="flex-1">
                          <p className="text-xs font-medium text-gray-800 dark:text-gray-200">Análisis automático de Ads (IA)</p>
                          <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">Cada lunes analiza con IA las cuentas de Meta Ads / Google Ads conectadas de todos los proyectos y guarda el diagnóstico para "Prioridades". Solo corre en proyectos con una cuenta de ads conectada.</p>
                        </div>
                        <Toggle on={globalSettings.adsAdvisorAutoEnabled !== false} onToggle={() => handleGlobalSetting({ adsAdvisorAutoEnabled: !(globalSettings.adsAdvisorAutoEnabled !== false) })} disabled={!loaded} />
                      </div>

                      <div className="flex items-start justify-between gap-4 pb-3 border-b border-gray-200/70 dark:border-gray-700">
                        <div className="flex-1">
                          <p className="text-xs font-medium text-gray-800 dark:text-gray-200">Análisis automático de RRSS (IA)</p>
                          <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">Cada lunes analiza con IA las redes sociales conectadas de todos los proyectos (tendencia, competencia, objetivos y brief) y guarda el diagnóstico para "Prioridades". Solo corre en proyectos con alguna red social conectada.</p>
                        </div>
                        <Toggle on={globalSettings.rrssAdvisorAutoEnabled !== false} onToggle={() => handleGlobalSetting({ rrssAdvisorAutoEnabled: !(globalSettings.rrssAdvisorAutoEnabled !== false) })} disabled={!loaded} />
                      </div>

                      <div className="pb-3 border-b border-gray-200/70 dark:border-gray-700">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <p className="text-xs font-medium text-gray-800 dark:text-gray-200">Aviso semanal de Prioridades por email</p>
                            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">Todos los lunes, si hay proyectos con recomendaciones de alta prioridad pendientes (SEO/GEO, objetivos, RRSS, Ads, informes), se manda un resumen a los admins/owners.</p>
                          </div>
                          <Toggle on={globalSettings.marketingDigestEnabled !== false} onToggle={() => handleGlobalSetting({ marketingDigestEnabled: !(globalSettings.marketingDigestEnabled !== false) })} disabled={!loaded} />
                        </div>
                        {globalSettings.marketingDigestEnabled !== false && (
                          <div className="mt-3 flex items-center gap-3 flex-wrap">
                            <button
                              onClick={handleSendMarketingDigestNow}
                              disabled={marketingDigestTest.sending}
                              className="text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-white dark:hover:bg-gray-700 disabled:opacity-50 transition-colors"
                            >
                              {marketingDigestTest.sending ? 'Enviando…' : '✉️ Enviar ahora a mi correo'}
                            </button>
                            {marketingDigestTest.msg && (
                              <span className={`text-xs ${marketingDigestTest.error ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>{marketingDigestTest.msg}</span>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <p className="text-xs font-medium text-gray-800 dark:text-gray-200">Alertas SEO automáticas</p>
                          <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">Compara Search Console del mes cerrado vs. el anterior y avisa por email a los admins si hay caídas relevantes (clicks, posición, Domain Rating, keywords fuera del top 10). Corre el 1° de cada mes.</p>
                        </div>
                        <Toggle on={globalSettings.seoAlertsEnabled !== false} onToggle={() => handleGlobalSetting({ seoAlertsEnabled: !(globalSettings.seoAlertsEnabled !== false) })} disabled={!loaded} />
                      </div>
                    </div>
                  </div>

                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
