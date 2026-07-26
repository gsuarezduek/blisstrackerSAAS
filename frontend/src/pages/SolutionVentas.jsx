import { useState } from 'react'
import { Link } from 'react-router-dom'
import ModuleLandingLayout from '../components/landing/ModuleLandingLayout'
import { trackEvent } from '../lib/analytics'

const FEATURES = [
  { icon: '🗂️', title: 'Pipeline de leads', desc: 'Empresas, contactos y oportunidades separados. Kanban por estado: prospecto → contactado → reunión → propuesta → ganado/perdido.' },
  { icon: '⏰', title: 'Próxima acción + recordatorios', desc: 'Cada lead tiene una única próxima acción pendiente, con recordatorio automático por email al responsable si queda vencida.' },
  { icon: '🔎', title: 'Investigación de empresas con IA', desc: 'Un click analiza el sitio del prospecto y arma un resumen: servicios, mercado, redes, SEO, oportunidades y necesidades detectadas.' },
  { icon: '📝', title: 'Generador de propuestas con IA', desc: 'A partir de tus servicios y los objetivos del cliente, genera una propuesta editable en HTML — exportable a PDF con tu marca.' },
  { icon: '📊', title: 'Métricas y forecast', desc: 'Forecast ponderado por probabilidad de cada etapa, win rate, ciclo de venta promedio, y ranking por responsable.' },
  { icon: '🔁', title: 'Conversión directa a proyecto', desc: 'Un lead ganado se convierte en un proyecto real de tu agencia con un click — sin recargar datos a mano.' },
]

const FAQ = [
  { q: '¿Reemplaza a un CRM como HubSpot o Pipedrive?',
    a: 'Para una agencia que gestiona su propio proceso comercial, sí — con la diferencia de que un lead ganado se convierte directamente en un proyecto real de BlissTracker, sin exportar/importar nada entre sistemas.' },
  { q: '¿Quién puede ver el módulo de Ventas?',
    a: 'Los admins/owners del workspace y el equipo comercial que vos definas (por rol interno) desde Admin → Equipo. El resto del equipo no lo ve.' },
  { q: '¿La IA necesita que yo escriba la propuesta desde cero?',
    a: 'No — elegís los servicios y los objetivos del cliente, la IA genera un HTML editable con la estructura y el tono que vos configures, y lo ajustás antes de exportarlo a PDF.' },
  { q: '¿Cuánto cuesta activar Ventas?',
    a: 'Viene incluido en cualquier plan pago, sin costo adicional — lo activás o desactivás cuando quieras desde Preferencias.' },
]

export default function SolutionVentas() {
  const [openFaq, setOpenFaq] = useState(null)

  return (
    <ModuleLandingLayout
      metaTitle="CRM de Ventas para agencias — BlissTracker"
      metaDescription="Pipeline de leads, próximas acciones con recordatorio automático, investigación de empresas con IA y generador de propuestas — el CRM comercial de tu agencia, conectado a tus proyectos reales."
      canonicalPath="/soluciones/ventas"
    >
      {/* Hero */}
      <section className="pt-16 pb-16 px-4 sm:px-6 bg-gradient-to-b from-white to-gray-50">
        <div className="max-w-3xl mx-auto text-center">
          <span className="inline-block px-3 py-1 bg-primary-50 text-primary-700 text-xs font-semibold rounded-full mb-6">
            💰 Módulo Ventas (CRM)
          </span>
          <h1 className="text-4xl sm:text-5xl font-extrabold text-gray-900 leading-tight mb-5">
            El CRM de tu agencia, no uno genérico
          </h1>
          <p className="text-lg text-gray-500 max-w-2xl mx-auto mb-8 leading-relaxed">
            Pipeline de leads, próximas acciones que no se pierden, investigación de empresas y
            propuestas con IA — y cuando ganás un cliente, se convierte en un proyecto real con un click.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              to="/register"
              onClick={() => trackEvent('landing_cta_click', { location: 'solution_ventas_hero' })}
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
            Ganaste el lead: con un click se crea un <strong className="text-white">proyecto real</strong>,
            con su equipo y sus tareas — nada de recargar el cliente a mano en un segundo sistema
            después de cerrarlo.
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
            Activá Ventas cuando lo necesites.
          </h2>
          <p className="text-gray-500 mb-8">14 días gratis. Sin tarjeta de crédito.</p>
          <Link
            to="/register"
            onClick={() => trackEvent('landing_cta_click', { location: 'solution_ventas_final' })}
            className="inline-block bg-primary-500 hover:bg-primary-600 text-white text-base font-semibold px-10 py-4 rounded-xl transition-colors shadow-lg shadow-primary-100"
          >
            Crear cuenta gratis →
          </Link>
        </div>
      </section>
    </ModuleLandingLayout>
  )
}
