import { Fragment } from 'react'
import { apiGet } from '@/lib/api'
import { REGISTER_URL } from '@/lib/urls'
import { buildMetadata, breadcrumbSchema } from '@/lib/seo'
import JsonLd from '@/components/JsonLd'
import { metaFor } from '@/lib/pageMeta'
import { PRICING_DEFAULTS } from '@/lib/landingDefaults'
import { comparisonWithSeats, pricingFaqs } from '@/lib/pricingData'
import ModuleLandingLayout from '@/components/landing/ModuleLandingLayout'
import PricingCalculator from '@/components/pricing/PricingCalculator'
import TrackPageView from '@/components/TrackPageView'

export const revalidate = 600

export const metadata = buildMetadata({ ...metaFor('/pricing'), path: '/pricing' })

function Cell({ v }) {
  if (v === true)  return <span className="text-primary-600 font-bold">✓</span>
  if (v === false) return <span className="text-gray-300">—</span>
  return <span className="text-gray-700">{v}</span>
}

const GUARANTEES = [
  { icon: '💳', title: 'Sin tarjeta', desc: 'Te registrás sin tarjeta de crédito y arrancás.' },
  { icon: '🛑', title: 'Cancelás cuando quieras', desc: 'Un click en /billing y listo. Sin permanencia.' },
  { icon: '📦', title: 'Datos exportables', desc: 'Todo tu workspace en JSON, cuando quieras.' },
  { icon: '🇦🇷', title: 'Soporte en español', desc: 'Atendemos rápido y en tu idioma.' },
]

export default async function PricingPage() {
  const pricing = await apiGet('/api/public/pricing', { fallback: PRICING_DEFAULTS, tags: ['pricing'] })
  const { pricingTiers, freeSeatLimit, trialDays } = { ...PRICING_DEFAULTS, ...pricing }

  const proPrice       = pricingTiers[0].pricePerSeat
  const scalePrice     = pricingTiers[pricingTiers.length - 1].pricePerSeat
  const scaleThreshold = (pricingTiers[0].upTo ?? 0) + 1

  const faqs = pricingFaqs({ freeSeatLimit, trialDays })
  const rows = comparisonWithSeats(freeSeatLimit, scaleThreshold)

  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: faqs.map(f => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.a },
      })),
    },
    breadcrumbSchema([
      { name: 'Inicio', path: '/' },
      { name: 'Precios', path: '/pricing' },
    ]),
  ]

  return (
    <ModuleLandingLayout>
      <JsonLd schema={jsonLd} />
      <TrackPageView event="pricing_page_viewed" />

      {/* ── Hero ── */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 pt-16 pb-12 text-center">
        <span className="inline-block px-3 py-1 bg-primary-50 text-primary-700 text-xs font-semibold rounded-full">
          Pricing
        </span>
        <h1 className="text-4xl sm:text-5xl font-bold mt-4 leading-tight">
          Simple para agencias que crecen.
        </h1>
        <p className="text-lg text-gray-600 mt-4 max-w-2xl mx-auto">
          Empezás gratis hasta {freeSeatLimit} usuarios. Cuando crece el equipo, pagás solo por seat
          activo. Sin trampas, sin contratos anuales obligatorios, sin tarjeta de crédito para arrancar.
        </p>
      </section>

      {/* ── Tres planes ── */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-16 grid md:grid-cols-3 gap-6">
        <div className="border border-gray-200 rounded-2xl p-6 bg-white flex flex-col">
          <h2 className="text-2xl font-bold">Gratis</h2>
          <p className="text-gray-500 text-sm mt-1">Para equipos pequeños que arrancan.</p>
          <div className="mt-6">
            <span className="text-5xl font-bold">$0</span>
            <span className="text-gray-500 ml-1">/mes</span>
          </div>
          <ul className="mt-6 space-y-3 text-sm text-gray-700 flex-1">
            <li>✓ Hasta {freeSeatLimit} usuarios</li>
            <li>✓ Proyectos ilimitados</li>
            <li>✓ Coach de IA diario</li>
            <li>✓ Resúmenes semanales</li>
            <li>✓ Soporte por email</li>
          </ul>
          <a
            href={REGISTER_URL}
            className="mt-6 block w-full text-center border border-gray-300 hover:border-gray-400 text-gray-800 px-5 py-3 rounded-xl font-medium transition-colors"
          >
            Crear cuenta gratis
          </a>
        </div>

        <div className="relative border-2 border-primary-500 rounded-2xl p-6 bg-white flex flex-col shadow-xl">
          <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-primary-500 text-white text-xs font-bold px-3 py-1 rounded-full">
            MÁS POPULAR
          </span>
          <h2 className="text-2xl font-bold">Pro</h2>
          <p className="text-gray-500 text-sm mt-1">Para agencias y equipos en crecimiento.</p>
          <div className="mt-6">
            <span className="text-5xl font-bold">${proPrice}</span>
            <span className="text-gray-500 ml-1">/usuario/mes</span>
          </div>
          <ul className="mt-6 space-y-3 text-sm text-gray-700 flex-1">
            <li>✓ Usuarios ilimitados</li>
            <li>✓ Todo lo del plan Gratis</li>
            <li>✓ <strong>Marketing toolkit completo</strong> (GEO, SEO, Ads, Social)</li>
            <li>✓ <strong>Reportes públicos para clientes</strong> (URL token)</li>
            <li>✓ Sistema EOS (Traction)</li>
            <li>✓ Panel RRHH + Productividad</li>
            <li>✓ Soporte prioritario</li>
          </ul>
          <a
            href={REGISTER_URL}
            className="mt-6 block w-full text-center bg-primary-500 hover:bg-primary-600 text-white px-5 py-3 rounded-xl font-medium transition-colors"
          >
            Empezar — {trialDays} días gratis
          </a>
        </div>

        <div className="border border-gray-200 rounded-2xl p-6 bg-white flex flex-col">
          <h2 className="text-2xl font-bold">Scale</h2>
          <p className="text-gray-500 text-sm mt-1">Para equipos de más de {scaleThreshold - 1} personas.</p>
          <div className="mt-6">
            <span className="text-5xl font-bold">${scalePrice}</span>
            <span className="text-gray-500 ml-1">/usuario/mes</span>
          </div>
          <ul className="mt-6 space-y-3 text-sm text-gray-700 flex-1">
            <li>✓ Desde {scaleThreshold} usuarios</li>
            <li>✓ Todo lo del plan Pro</li>
            <li>✓ Precio reducido por escala</li>
            <li>✓ Onboarding personalizado</li>
            <li>✓ Account manager dedicado</li>
            <li>✓ Límite de tokens IA negociable</li>
          </ul>
          <a
            href="mailto:gaston@blissmkt.ar?subject=BlissTracker%20Scale"
            className="mt-6 block w-full text-center border border-gray-300 hover:border-gray-400 text-gray-800 px-5 py-3 rounded-xl font-medium transition-colors"
          >
            Hablemos
          </a>
        </div>
      </section>

      {/* ── Calculadora ── */}
      <section className="bg-gray-50 border-y border-gray-100 py-16">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <h2 className="text-3xl font-bold">Calculadora de costo</h2>
          <p className="text-gray-600 mt-2">Movés el deslizador y ves tu costo final. Sin sorpresas.</p>
          <PricingCalculator
            pricingTiers={pricingTiers}
            freeSeatLimit={freeSeatLimit}
            scaleThreshold={scaleThreshold}
          />
        </div>
      </section>

      {/* ── Tabla comparativa ── */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-20">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold">Compará los tres planes</h2>
          <p className="text-gray-600 mt-2">Todo lo que incluye cada uno, de un vistazo.</p>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-gray-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-5 py-4 font-semibold text-gray-700">Funcionalidad</th>
                <th className="text-center px-5 py-4 font-semibold text-gray-700">Gratis</th>
                <th className="text-center px-5 py-4 font-semibold text-primary-700 bg-primary-50">Pro</th>
                <th className="text-center px-5 py-4 font-semibold text-gray-700">Scale</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(group => (
                <Fragment key={group.group}>
                  <tr className="bg-gray-50/50 border-b border-gray-100">
                    <td colSpan={4} className="px-5 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      {group.group}
                    </td>
                  </tr>
                  {group.rows.map((row, i) => (
                    <tr key={`${group.group}-${i}`} className="border-b border-gray-100">
                      <td className="px-5 py-3 text-gray-800">{row.feature}</td>
                      <td className="px-5 py-3 text-center"><Cell v={row.free} /></td>
                      <td className="px-5 py-3 text-center bg-primary-50/30"><Cell v={row.pro} /></td>
                      <td className="px-5 py-3 text-center"><Cell v={row.scale} /></td>
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Garantías ── */}
      <section className="bg-gray-50 border-y border-gray-100 py-16">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 grid grid-cols-2 md:grid-cols-4 gap-6">
          {GUARANTEES.map(g => (
            <div key={g.title} className="text-center">
              <div className="text-3xl">{g.icon}</div>
              <p className="font-semibold text-gray-900 mt-2">{g.title}</p>
              <p className="text-xs text-gray-500 mt-1 leading-snug">{g.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── FAQ ── Mismo criterio que el FAQ de la landing: <details> nativo, así las
           respuestas están en el HTML inicial y no hacen falta ni estado ni JavaScript. */}
      <section className="max-w-3xl mx-auto px-4 sm:px-6 py-20">
        <h2 className="text-3xl font-bold text-center">Preguntas sobre el pricing</h2>
        <div className="mt-10 space-y-3">
          {faqs.map((f, i) => (
            <details
              key={i}
              className="group border border-gray-200 rounded-xl bg-white [&_summary::-webkit-details-marker]:hidden"
            >
              <summary className="w-full cursor-pointer list-none px-5 py-4 flex items-center justify-between gap-4 text-left">
                <span className="font-medium text-gray-900">{f.q}</span>
                <span className="text-primary-500 text-xl transition-transform duration-200 group-open:rotate-45">+</span>
              </summary>
              <div className="px-5 pb-4 text-sm text-gray-600 leading-relaxed">{f.a}</div>
            </details>
          ))}
        </div>
      </section>

      {/* ── CTA final ── */}
      <section className="bg-gray-900 text-white py-20">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold">¿Listo para empezar?</h2>
          <p className="text-gray-300 mt-3">Crear tu workspace toma menos de 60 segundos.</p>
          <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
            <a
              href={REGISTER_URL}
              className="inline-block bg-primary-500 hover:bg-primary-600 text-white px-8 py-4 rounded-xl font-semibold text-lg transition-colors shadow-lg"
            >
              Probá {trialDays} días gratis →
            </a>
            <a
              href="mailto:gaston@blissmkt.ar?subject=Quiero%20saber%20m%C3%A1s%20de%20BlissTracker"
              className="inline-block border border-gray-700 hover:border-gray-500 text-gray-200 px-8 py-4 rounded-xl font-semibold text-lg transition-colors"
            >
              Hablar con Gastón
            </a>
          </div>
        </div>
      </section>
    </ModuleLandingLayout>
  )
}
