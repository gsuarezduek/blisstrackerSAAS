/**
 * Wizard de onboarding: reemplaza al viejo `OnboardingTour` (modal de 5 pasos fijos que
 * mencionaba "Marketing toolkit" a cualquier workspace, tuviera o no el flag habilitado).
 *
 * Dos fases:
 *  A) Selector de módulos — lista los feature flags habilitados para el workspace
 *     (GET /workspaces/current/features, mismo endpoint que usa Preferencias → Módulos
 *     adicionales) con todos tildados por defecto. Al continuar, persiste el opt-out de
 *     los que quedaron destildados vía PATCH .../features/:key (mismo request que
 *     Preferencias). Si el workspace no tiene ningún módulo habilitado, se saltea directo
 *     a la fase B.
 *  B) Tour adaptativo — mismo estilo visual que el tour anterior, pero el array de pasos
 *     se arma en memoria: 3 pasos "spine" (siempre aplican) + 1 paso por cada módulo que
 *     quedó activo en la fase A + el paso final de invitar al equipo.
 *
 * Gate de aparición: server-side vía `Workspace.onboardingCompletedAt` (no localStorage
 * por browser/usuario) — solo lo ve el admin/owner, y no vuelve a aparecer una vez
 * completado o saltado, en ningún dispositivo.
 *
 * Eventos: tour_started, onboarding_modules_selected, tour_step_completed (con step),
 * tour_skipped, tour_completed.
 */
import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useWorkspace } from '../context/WorkspaceContext'
import api from '../api/client'
import { trackEvent } from '../lib/analytics'
import { moduleMeta } from '../lib/moduleCatalog'
import { invalidateFeatureFlag } from '../hooks/useFeatureFlag'

const INTRO_STEPS = [
  {
    emoji: '👋',
    title: '¡Bienvenido a BlissTracker!',
    body: 'Primero elegís qué módulos usar, después te muestro las cosas que importan. Podés saltar cuando quieras — queda guardado, no volvemos a molestar.',
  },
  {
    emoji: '🤖',
    title: 'Tu coach de IA',
    body: 'Cada mañana tenés una tarjeta arriba del dashboard con prioridades del día — generada con tu historial, tu rol y tus tareas pendientes. Llegás con un plan, no con preguntas.',
  },
  {
    emoji: '🎯',
    title: 'Una tarea activa a la vez',
    body: 'BlissTracker te obliga a comprometerte con una sola tarea en curso. Las otras esperan en sus secciones (Pendiente, Pausada, Bloqueada). Foco no es disciplina personal — es default del sistema.',
  },
]

const FINAL_STEP = {
  emoji: '👥',
  title: 'Invitá a tu equipo',
  body: 'En Admin → Equipo invitás por email con un click. Cada persona acepta su invitación y empieza a usar. Cuando esté tu equipo dentro, vas a sentir la diferencia real.',
}

function moduleStep(feat) {
  const meta = moduleMeta(feat.key, feat.name)
  return { emoji: meta.icon, title: meta.label ?? feat.name, body: meta.tourBody }
}

export default function OnboardingWizard() {
  const { user } = useAuth()
  const { workspace, refreshWorkspace } = useWorkspace()

  const shouldShow = !!user?.isAdmin && !!workspace && !workspace.onboardingCompletedAt

  const [visible, setVisible]   = useState(false)
  const [phase, setPhase]       = useState('modules') // 'modules' | 'tour'
  const [features, setFeatures] = useState(null)       // [{key,name,description,disabled}]
  const [selected, setSelected] = useState({})          // key -> bool (true = mantener activo)
  const [saving, setSaving]     = useState(false)
  const [step, setStep]         = useState(0)

  useEffect(() => {
    if (!shouldShow) return
    setVisible(true)
    trackEvent('tour_started')
    api.get('/workspaces/current/features')
      .then(({ data }) => {
        if (!data.length) { setPhase('tour'); return } // nada para elegir → directo al tour
        setFeatures(data)
        // Opt-in: arranca todo destildado — el admin activa explícitamente lo que
        // quiere usar, en vez de tener que acordarse de destildar lo que no quiere
        // (con todo tildado por defecto, era fácil dejar activo un módulo sin querer).
        const initial = {}
        data.forEach(f => { initial[f.key] = false })
        setSelected(initial)
      })
      .catch(() => setPhase('tour'))
    // Solo debe correr una vez, cuando el gate pasa de false a true.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldShow])

  async function finish(reason) {
    setVisible(false)
    trackEvent(reason === 'skipped' ? 'tour_skipped' : 'tour_completed', { step, phase })
    try { await api.post('/workspaces/current/onboarding/complete') } catch (_) {}
    refreshWorkspace()
  }

  async function confirmModules() {
    setSaving(true)
    trackEvent('onboarding_modules_selected', { selected })
    await Promise.all(
      (features || []).map(f =>
        api.patch(`/workspaces/current/features/${f.key}`, { disabled: !selected[f.key] }).catch(() => {})
      )
    )
    invalidateFeatureFlag()
    setSaving(false)
    setPhase('tour')
    setStep(0)
  }

  if (!visible || !user?.id) return null

  const activeModuleSteps = (features || []).filter(f => selected[f.key]).map(moduleStep)
  const STEPS = [...INTRO_STEPS, ...activeModuleSteps, FINAL_STEP]
  const isLast = step === STEPS.length - 1

  function next() {
    trackEvent('tour_step_completed', { step })
    if (step < STEPS.length - 1) setStep(step + 1)
    else finish('completed')
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center px-4 sm:px-6">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => finish('skipped')}
      />

      {/* Card */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-title"
        className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 max-w-md w-full p-7"
      >
        {phase === 'modules' ? (
          <>
            <div className="text-5xl mb-4 text-center">🧩</div>
            <h2 id="onboarding-title" className="text-2xl font-bold text-gray-900 dark:text-white text-center mb-2">
              ¿Qué querés activar?
            </h2>
            <p className="text-gray-600 dark:text-gray-300 text-center text-sm mb-5 leading-relaxed">
              La ejecución diaria (tareas, foco, coach IA) siempre está activa. Elegí qué otros
              módulos usar — lo podés cambiar después desde Preferencias.
            </p>

            {!features ? (
              <div className="py-8 text-center text-sm text-gray-400">Cargando módulos…</div>
            ) : (
              <div className="space-y-2 mb-6 max-h-72 overflow-y-auto">
                <div className="flex items-center gap-3 rounded-xl border border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/30 px-4 py-3">
                  <span className="text-xl flex-shrink-0">✅</span>
                  <p className="flex-1 text-sm font-medium text-gray-600 dark:text-gray-300">
                    Ejecución diaria (tareas, foco, coach IA)
                  </p>
                  <span className="text-[11px] text-gray-400 dark:text-gray-500 flex-shrink-0">Siempre activo</span>
                </div>
                {features.map(f => {
                  const meta = moduleMeta(f.key, f.name)
                  const checked = !!selected[f.key]
                  return (
                    <label
                      key={f.key}
                      className="flex items-start gap-3 rounded-xl border border-gray-200 dark:border-gray-700 px-4 py-3 cursor-pointer hover:border-primary-300 dark:hover:border-primary-600 transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => setSelected(s => ({ ...s, [f.key]: !s[f.key] }))}
                        className="mt-1 w-4 h-4 accent-primary-500 flex-shrink-0"
                      />
                      <span className="text-xl flex-shrink-0">{meta.icon}</span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{f.name}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed mt-0.5">{meta.detail}</p>
                      </div>
                    </label>
                  )
                })}
              </div>
            )}

            <div className="flex items-center justify-between gap-3">
              <button
                onClick={() => finish('skipped')}
                className="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              >
                Saltar
              </button>
              <button
                onClick={confirmModules}
                disabled={!features || saving}
                className="bg-primary-500 hover:bg-primary-600 disabled:opacity-60 text-white text-sm font-semibold px-5 py-2.5 rounded-lg transition-colors"
              >
                {saving ? 'Guardando…' : 'Continuar'}
              </button>
            </div>
          </>
        ) : (
          <>
            {/* Progreso */}
            <div className="flex items-center gap-1.5 mb-5">
              {STEPS.map((_, i) => (
                <div
                  key={i}
                  className={`h-1.5 rounded-full flex-1 transition-colors ${
                    i <= step ? 'bg-primary-500' : 'bg-gray-200 dark:bg-gray-700'
                  }`}
                />
              ))}
            </div>

            <div className="text-5xl mb-4 text-center">{STEPS[step].emoji}</div>

            <h2 id="onboarding-title" className="text-2xl font-bold text-gray-900 dark:text-white text-center mb-3">
              {STEPS[step].title}
            </h2>
            <p className="text-gray-600 dark:text-gray-300 text-center leading-relaxed">
              {STEPS[step].body}
            </p>

            <div className="flex items-center justify-between gap-3 mt-7">
              <button
                onClick={() => finish('skipped')}
                className="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              >
                Saltar tour
              </button>
              <button
                onClick={next}
                className="bg-primary-500 hover:bg-primary-600 text-white text-sm font-semibold px-5 py-2.5 rounded-lg transition-colors"
              >
                {isLast ? 'Empezar a usar BlissTracker' : `Siguiente (${step + 1}/${STEPS.length})`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
