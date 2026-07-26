import { useState } from 'react'
import { Link } from 'react-router-dom'
import ModuleLandingLayout from '../components/landing/ModuleLandingLayout'
import { trackEvent } from '../lib/analytics'

const FEATURES = [
  { icon: '🧭', title: 'Visión (VTO)', desc: 'Valores centrales, propósito, BHAG, estrategia de marketing y metas a 1/3/10 años en un mismo documento vivo.' },
  { icon: '👤', title: 'Personas', desc: 'People Analyzer (GWC) por persona, Accountability Chart jerárquico y registro de Strikes.' },
  { icon: '📈', title: 'Datos (Scorecard)', desc: 'Métricas semanales y mensuales con responsable y meta. Incluye automáticas: tardanzas, ocupación del equipo, tareas completadas — calculadas solas, sin cargar nada a mano.' },
  { icon: '🧩', title: 'Asuntos (IDS)', desc: 'Identify-Discuss-Solve semanal y trimestral, con prioridad y estado, para que nada se discuta dos veces.' },
  { icon: '🗂️', title: 'Procesos', desc: 'Documentación de tus procesos clave con pasos ordenados y responsable por rol.' },
  { icon: '🎯', title: 'Tracción', desc: 'Rocks trimestrales + reunión L10 semanal con cronómetro que cuenta el tiempo a los participantes, y To-Dos que se envían al dashboard como tareas reales.' },
]

const FAQ = [
  { q: '¿Hace falta conocer el libro Traction para usarlo?',
    a: 'Ayuda, pero no es requisito — cada sección del sistema (Visión, Personas, Datos, Asuntos, Procesos, Tracción, Evaluación) viene con su propia guía dentro de la app.' },
  { q: '¿Reemplaza a un software de EOS dedicado?',
    a: 'Cubre los 6 componentes del sistema Traction, con la diferencia de que las tareas de tus reuniones L10 y tus Rocks son las mismas tareas reales que ejecuta tu equipo — no hay que duplicar nada en dos sistemas.' },
  { q: '¿Los To-Dos de la reunión L10 se convierten en tareas de verdad?',
    a: 'Sí. Un To-Do con responsable se puede enviar al dashboard con un click — crea una tarea real en el proyecto que elijas, y si esa tarea se completa, el To-Do se tilda solo.' },
  { q: '¿Cuánto cuesta activar EOS?',
    a: 'Viene incluido en cualquier plan pago, sin costo adicional — lo activás o desactivás cuando quieras desde Preferencias.' },
]

export default function SolutionEos() {
  const [openFaq, setOpenFaq] = useState(null)

  return (
    <ModuleLandingLayout
      metaTitle="EOS / Traction para empresas — BlissTracker"
      metaDescription="Los 6 componentes del sistema Traction (Gino Wickman) — Visión, Personas, Datos, Asuntos, Procesos y Tracción — integrados al mismo task tracker que usa tu equipo todos los días."
      canonicalPath="/soluciones/eos"
    >
      {/* Hero */}
      <section className="pt-16 pb-16 px-4 sm:px-6 bg-gradient-to-b from-white to-gray-50">
        <div className="max-w-3xl mx-auto text-center">
          <span className="inline-block px-3 py-1 bg-primary-50 text-primary-700 text-xs font-semibold rounded-full mb-6">
            🏢 Módulo EOS / Traction
          </span>
          <h1 className="text-4xl sm:text-5xl font-extrabold text-gray-900 leading-tight mb-5">
            Tu sistema Traction, sin cambiar de app
          </h1>
          <p className="text-lg text-gray-500 max-w-2xl mx-auto mb-8 leading-relaxed">
            Visión, Personas, Datos, Asuntos, Procesos y Tracción — los componentes del libro de
            Gino Wickman, corriendo sobre el mismo task tracker donde tu equipo ya ejecuta.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              to="/register"
              onClick={() => trackEvent('landing_cta_click', { location: 'solution_eos_hero' })}
              className="w-full sm:w-auto bg-primary-500 hover:bg-primary-600 text-white text-base font-semibold px-8 py-4 rounded-xl transition-colors shadow-lg shadow-primary-100"
            >
              Probar 14 días gratis →
            </Link>
            <Link to="/" className="w-full sm:w-auto text-gray-700 hover:text-gray-900 text-base font-medium px-8 py-4 rounded-xl border border-gray-200 hover:border-gray-300 transition-colors">
              Ver el sistema completo
            </Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 px-4 sm:px-6 bg-white">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {FEATURES.map((f, i) => (
              <div key={i} className="flex gap-4 bg-gray-50 border border-gray-100 rounded-2xl p-6">
                <div className="text-3xl flex-shrink-0 mt-0.5">{f.icon}</div>
                <div>
                  <h3 className="font-bold text-gray-900 text-base sm:text-lg mb-1.5">{f.title}</h3>
                  <p className="text-gray-500 text-sm leading-relaxed">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Se integra con el sistema */}
      <section className="py-20 px-4 sm:px-6 bg-gray-900">
        <div className="max-w-3xl mx-auto text-center">
          <p className="text-primary-400 font-semibold text-xs uppercase tracking-widest mb-4">
            No es una herramienta más
          </p>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white mb-4">
            Un módulo de tu sistema, no un login aparte
          </h2>
          <p className="text-gray-400 text-lg leading-relaxed">
            Un Rock o un To-Do de la L10 se vuelve una <strong className="text-white">tarea real</strong>,
            asignada a quien corresponda, con foco forzado y coach de IA — la misma ejecución diaria
            que usa el resto de tu equipo, no un tablero aparte que nadie mira entre reunión y reunión.
          </p>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-20 px-4 sm:px-6 bg-gray-50">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-900 text-center mb-10">
            Preguntas frecuentes
          </h2>
          <div className="space-y-3">
            {FAQ.map((f, i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full text-left px-6 py-5 flex items-center justify-between gap-4 hover:bg-gray-50 transition-colors"
                >
                  <span className="font-semibold text-gray-900 text-sm sm:text-base">{f.q}</span>
                  <span className={`text-primary-500 text-2xl font-light flex-shrink-0 transition-transform duration-200 ${openFaq === i ? 'rotate-45' : ''}`}>+</span>
                </button>
                {openFaq === i && (
                  <div className="px-6 pb-5 pt-3 text-gray-500 text-sm leading-relaxed border-t border-gray-100">
                    {f.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA final */}
      <section className="py-20 px-4 sm:px-6 bg-white text-center">
        <div className="max-w-xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-900 mb-4">
            Activá EOS cuando lo necesites.
          </h2>
          <p className="text-gray-500 mb-8">14 días gratis. Sin tarjeta de crédito.</p>
          <Link
            to="/register"
            onClick={() => trackEvent('landing_cta_click', { location: 'solution_eos_final' })}
            className="inline-block bg-primary-500 hover:bg-primary-600 text-white text-base font-semibold px-10 py-4 rounded-xl transition-colors shadow-lg shadow-primary-100"
          >
            Crear cuenta gratis →
          </Link>
        </div>
      </section>
    </ModuleLandingLayout>
  )
}
