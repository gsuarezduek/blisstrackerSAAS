import Link from 'next/link'
import { REGISTER_URL } from '@/lib/urls'
import { breadcrumbSchema } from '@/lib/seo'
import JsonLd from '@/components/JsonLd'
import ModuleLandingLayout from './ModuleLandingLayout'
import TrackedLink from './TrackedLink'

/**
 * Markup compartido de las tres sub-landings de módulo. En la SPA este markup estaba
 * copiado en SolutionMarketing.jsx, SolutionEos.jsx y SolutionVentas.jsx; acá vive una
 * sola vez y los datos llegan de lib/solutionsData.js.
 *
 * El FAQ usa <details> en vez del acordeón con useState, igual que en la landing y en
 * /pricing: las respuestas quedan en el HTML inicial y la página no necesita JS.
 */
export default function SolutionPage({ solution, breadcrumbName }) {
  const { badge, h1, subtitle, features, dark, faq, ctaLocation, ctaTitle, slug } = solution

  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: faq.map(f => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.a },
      })),
    },
    breadcrumbSchema([
      { name: 'Inicio', path: '/' },
      { name: breadcrumbName, path: `/soluciones/${slug}` },
    ]),
  ]

  return (
    <ModuleLandingLayout>
      <JsonLd schema={jsonLd} />

      {/* Hero */}
      <section className="pt-16 pb-16 px-4 sm:px-6 bg-gradient-to-b from-white to-gray-50">
        <div className="max-w-3xl mx-auto text-center">
          <span className="inline-block px-3 py-1 bg-primary-50 text-primary-700 text-xs font-semibold rounded-full mb-6">
            {badge}
          </span>
          <h1 className="text-4xl sm:text-5xl font-extrabold text-gray-900 leading-tight mb-5">
            {h1}
          </h1>
          <p className="text-lg text-gray-500 max-w-2xl mx-auto mb-8 leading-relaxed">
            {subtitle}
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <TrackedLink
              href={REGISTER_URL}
              event="landing_cta_click"
              params={{ location: `${ctaLocation}_hero` }}
              className="w-full sm:w-auto bg-primary-500 hover:bg-primary-600 text-white text-base font-semibold px-8 py-4 rounded-xl transition-colors shadow-lg shadow-primary-100"
            >
              Probar 14 días gratis →
            </TrackedLink>
            <Link
              href="/"
              className="w-full sm:w-auto text-gray-700 hover:text-gray-900 text-base font-medium px-8 py-4 rounded-xl border border-gray-200 hover:border-gray-300 transition-colors"
            >
              Ver el sistema completo
            </Link>
          </div>
        </div>
      </section>

      {/* Funcionalidades */}
      <section className="py-20 px-4 sm:px-6 bg-white">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {features.map((f, i) => (
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
            {dark.map((part, i) =>
              typeof part === 'string'
                ? part
                : <strong key={i} className="text-white">{part.strong}</strong>
            )}
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
            {faq.map((f, i) => (
              <details
                key={i}
                className="group bg-white rounded-xl border border-gray-200 overflow-hidden [&_summary::-webkit-details-marker]:hidden"
              >
                <summary className="w-full cursor-pointer list-none px-6 py-5 flex items-center justify-between gap-4 text-left hover:bg-gray-50 transition-colors">
                  <span className="font-semibold text-gray-900 text-sm sm:text-base">{f.q}</span>
                  <span className="text-primary-500 text-2xl font-light flex-shrink-0 transition-transform duration-200 group-open:rotate-45">+</span>
                </summary>
                <div className="px-6 pb-5 pt-3 text-gray-500 text-sm leading-relaxed border-t border-gray-100">
                  {f.a}
                </div>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* CTA final */}
      <section className="py-20 px-4 sm:px-6 bg-white text-center">
        <div className="max-w-xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-900 mb-4">{ctaTitle}</h2>
          <p className="text-gray-500 mb-8">14 días gratis. Sin tarjeta de crédito.</p>
          <TrackedLink
            href={REGISTER_URL}
            event="landing_cta_click"
            params={{ location: `${ctaLocation}_final` }}
            className="inline-block bg-primary-500 hover:bg-primary-600 text-white text-base font-semibold px-10 py-4 rounded-xl transition-colors shadow-lg shadow-primary-100"
          >
            Crear cuenta gratis →
          </TrackedLink>
        </div>
      </section>
    </ModuleLandingLayout>
  )
}
