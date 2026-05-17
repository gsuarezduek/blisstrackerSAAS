/**
 * Tour de onboarding de 5 pasos para usuarios nuevos.
 *
 * Estrategia simple: modal centrado (no apunta a elementos específicos) con narrativa
 * progresiva. Más robusto que tooltips con anchors — funciona aunque el DOM cambie.
 * Si después querés tooltips con anclas, podemos usar `react-joyride` o similar.
 *
 * Trigger: localStorage flag `bliss_tour_completed_<userId>` no existe → mostrar.
 * Skip: persistir flag inmediatamente para no volver a aparecer.
 *
 * Eventos trackeados: tour_started, tour_step_completed (con step), tour_skipped, tour_completed
 */
import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { trackEvent } from '../lib/analytics'

const STEPS = [
  {
    emoji: '👋',
    title: '¡Bienvenido a BlissTracker!',
    body: 'En 60 segundos te muestro las 5 cosas que importan. Podés saltar el tour cuando quieras — está persistido para no molestar.',
  },
  {
    emoji: '🤖',
    title: 'Tu coach de IA',
    body: 'Cada mañana tenés una tarjeta arriba del dashboard con prioridades del día — generada por Claude Haiku usando tu historial, tu rol y tareas pendientes. Llegá a la oficina con un plan, no con preguntas.',
  },
  {
    emoji: '🎯',
    title: 'Una tarea activa a la vez',
    body: 'BlissTracker te obliga a comprometerte con una sola tarea en curso. Las otras esperan en sus secciones (Pendiente, Pausada, Bloqueada). Foco no es disciplina personal — es default del sistema.',
  },
  {
    emoji: '📊',
    title: 'Marketing toolkit + reportes',
    body: 'En el menú vas a ver "Marketing": GEO Audit, SEO, Ads, Social, todo por proyecto. Y los Informes mensuales generan una URL pública que le mandás al cliente sin que se loguee.',
  },
  {
    emoji: '👥',
    title: 'Invitá a tu equipo',
    body: 'En Admin → Equipo invitás por email con un click. Cada persona acepta su invitación, fija su contraseña y empieza a usar. Cuando esté tu equipo dentro, vas a sentir la diferencia real.',
  },
]

function tourKey(userId) {
  return `bliss_tour_completed_${userId}`
}

export default function OnboardingTour() {
  const { user } = useAuth()
  const [step,    setStep]    = useState(0)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!user?.id) return
    const completed = localStorage.getItem(tourKey(user.id))
    if (!completed) {
      setVisible(true)
      trackEvent('tour_started')
    }
  }, [user?.id])

  function finish(reason = 'completed') {
    if (user?.id) localStorage.setItem(tourKey(user.id), '1')
    setVisible(false)
    trackEvent(reason === 'skipped' ? 'tour_skipped' : 'tour_completed', { step })
  }

  function next() {
    trackEvent('tour_step_completed', { step })
    if (step < STEPS.length - 1) setStep(step + 1)
    else finish('completed')
  }

  if (!visible || !user?.id) return null

  const s = STEPS[step]
  const isLast = step === STEPS.length - 1

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
        aria-labelledby="tour-title"
        className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 max-w-md w-full p-7"
      >
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

        <div className="text-5xl mb-4 text-center">{s.emoji}</div>

        <h2 id="tour-title" className="text-2xl font-bold text-gray-900 dark:text-white text-center mb-3">
          {s.title}
        </h2>
        <p className="text-gray-600 dark:text-gray-300 text-center leading-relaxed">
          {s.body}
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
      </div>
    </div>
  )
}
