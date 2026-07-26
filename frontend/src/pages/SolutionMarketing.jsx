import { useState } from 'react'
import { Link } from 'react-router-dom'
import ModuleLandingLayout from '../components/landing/ModuleLandingLayout'
import { trackEvent } from '../lib/analytics'

const FEATURES = [
  { icon: '🤖', title: 'GEO Audit para IA', desc: 'Visibilidad en ChatGPT, Perplexity, Claude y AI Overviews: score 0-100, crawlers de IA, llms.txt, JSON-LD sugerido.' },
  { icon: '🔍', title: 'SEO + Search Console', desc: 'Keyword tracking con historial, SERP snapshots, Domain Rating, canibalización, oportunidades de contenido y content briefs con IA.' },
  { icon: '📢', title: 'Meta Ads + Google Ads', desc: 'Spend, impresiones, clicks y conversiones de ambas plataformas en un solo lugar, por proyecto y por mes.' },
  { icon: '📱', title: 'Instagram, TikTok, LinkedIn, Facebook, YouTube', desc: 'Métricas oficiales o por scraping, seguimiento de competidores, y el mejor post/video del mes en cada red.' },
  { icon: '⚡', title: 'Performance + Health Score', desc: 'PageSpeed Insights (mobile + desktop) y un score compuesto que junta GEO, SEO, GA4 y velocidad en un número.' },
  { icon: '📄', title: 'Informes con URL pública', desc: 'Un link que el cliente abre sin loguearse, con feedback 1-5 estrellas y objetivos de marketing por período.' },
]

const FAQ = [
  { q: '¿Necesito el resto de BlissTracker para usar este módulo?',
    a: 'No hace falta configurar nada más — el módulo Marketing viene con cualquier plan pago y se activa en un click. Pero sí queda conectado al resto: cada hallazgo de una auditoría se convierte en una tarea asignada a quien corresponda, sin salir del sistema.' },
  { q: '¿Qué necesito conectar para empezar?',
    a: 'Nada es obligatorio de entrada. El GEO Audit solo pide la URL del sitio. Para GA4, Search Console, Ads o redes sociales, conectás cada integración por proyecto cuando la necesites (~3 minutos cada una).' },
  { q: '¿El informe funciona para varios clientes/proyectos?',
    a: 'Sí, es por proyecto e ilimitado. Cada proyecto tiene su propia URL pública, sus propias integraciones y su propio historial de informes mensuales.' },
  { q: '¿Y si mi agencia no hace SEO/Ads para todos los clientes?',
    a: 'El módulo se activa por workspace, no por proyecto — así que convive con proyectos que no lo usan. No estás obligado a conectar integraciones en los que no aplique.' },
]

export default function SolutionMarketing() {
  const [openFaq, setOpenFaq] = useState(null)

  return (
    <ModuleLandingLayout
      metaTitle="Marketing (GEO/SEO/Ads) para agencias — BlissTracker"
      metaDescription="GEO Audit para IA, SEO con Search Console, Meta Ads + Google Ads, redes sociales e informes con URL pública para clientes. Módulo de marketing dentro del sistema operativo de tu agencia."
      canonicalPath="/soluciones/marketing"
    >
      {/* Hero */}
      <section className="pt-16 pb-16 px-4 sm:px-6 bg-gradient-to-b from-white to-gray-50">
        <div className="max-w-3xl mx-auto text-center">
          <span className="inline-block px-3 py-1 bg-primary-50 text-primary-700 text-xs font-semibold rounded-full mb-6">
            📊 Módulo Marketing
          </span>
          <h1 className="text-4xl sm:text-5xl font-extrabold text-gray-900 leading-tight mb-5">
            GEO, SEO y Ads para agencias — dentro de tu sistema de ejecución
          </h1>
          <p className="text-lg text-gray-500 max-w-2xl mx-auto mb-8 leading-relaxed">
            Auditá visibilidad en IA, trackeá keywords, seguí tus campañas de Ads y mandale al
            cliente un informe con URL pública — todo conectado a las tareas reales de tu equipo,
            no en una herramienta aparte.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              to="/register"
              onClick={() => trackEvent('landing_cta_click', { location: 'solution_marketing_hero' })}
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
            Cada hallazgo de una auditoría GEO, cada oportunidad SEO, cada tarea de una campaña se
            convierte en una <strong className="text-white">tarea real</strong> asignada a quien
            corresponda — con foco forzado, coach de IA y visibilidad de equipo, igual que cualquier
            otra tarea de tu agencia.
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
            Activá Marketing cuando lo necesites.
          </h2>
          <p className="text-gray-500 mb-8">14 días gratis. Sin tarjeta de crédito.</p>
          <Link
            to="/register"
            onClick={() => trackEvent('landing_cta_click', { location: 'solution_marketing_final' })}
            className="inline-block bg-primary-500 hover:bg-primary-600 text-white text-base font-semibold px-10 py-4 rounded-xl transition-colors shadow-lg shadow-primary-100"
          >
            Crear cuenta gratis →
          </Link>
        </div>
      </section>
    </ModuleLandingLayout>
  )
}
