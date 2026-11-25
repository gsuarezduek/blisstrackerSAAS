import Link from 'next/link'
import { apiGet } from '@/lib/api'
import { SITE_URL, siteUrl, REGISTER_URL } from '@/lib/urls'
import { buildMetadata } from '@/lib/seo'
import JsonLd from '@/components/JsonLd'
import { metaFor } from '@/lib/pageMeta'
import { CONTENT_DEFAULTS, PRICING_DEFAULTS } from '@/lib/landingDefaults'
import SiteNav from '@/components/landing/SiteNav'
import SiteFooter from '@/components/landing/SiteFooter'
import BlissLogo from '@/components/BlissLogo'
import TypewriterAccent from '@/components/landing/TypewriterAccent'
import TrackedLink from '@/components/landing/TrackedLink'
import AppMockup from '@/components/landing/AppMockup'
import DemoVideo from '@/components/landing/DemoVideo'
import HighlightedTitle from '@/components/landing/HighlightedTitle'
import FaqSection from '@/components/landing/FaqSection'
import TrustedByBar from '@/components/landing/TrustedByBar'
import SegmentCards from '@/components/landing/SegmentCards'
import ComparisonTable from '@/components/landing/ComparisonTable'
import TestimonialsSection from '@/components/landing/TestimonialsSection'

export const revalidate = 600

export const metadata = buildMetadata({ ...metaFor('/'), path: '/' })

/**
 * Landing. Todo el copy y los precios se leen en el server y viajan en el HTML: en la
 * SPA esto eran cuatro fetch en useEffect, así que Google veía el marco vacío.
 *
 * Lo único que sigue siendo client component es lo que de verdad necesita interacción:
 * el menú de mobile, el typewriter del hero, el play del video, los carruseles y los
 * clicks que registran analítica. El FAQ dejó de serlo (ahora es <details>), con lo
 * cual las 15 respuestas pasaron a estar en el HTML inicial.
 */
export default async function LandingPage() {
  const [content, pricing, trusted, testimonials] = await Promise.all([
    apiGet('/api/landing/content',           { fallback: CONTENT_DEFAULTS, tags: ['landing'] }),
    apiGet('/api/public/pricing',            { fallback: PRICING_DEFAULTS, tags: ['pricing'] }),
    apiGet('/api/landing/trusted-companies', { fallback: [],               tags: ['landing'] }),
    apiGet('/api/landing/testimonials',      { fallback: [],               tags: ['landing'] }),
  ])

  const hero = { ...CONTENT_DEFAULTS, ...content }
  const { pricingTiers, freeSeatLimit, trialDays } = { ...PRICING_DEFAULTS, ...pricing }
  const proPrice       = pricingTiers[0].pricePerSeat
  const scalePrice     = pricingTiers[pricingTiers.length - 1].pricePerSeat
  const scaleThreshold = (pricingTiers[0].upTo ?? 0) + 1 // primer seat fuera del tier de Pro

  const faqs = hero.faqGroups.flatMap(g => g.items)

  // Mismo @graph que armaba la SPA (SoftwareApplication + Organization + FAQPage), con
  // una diferencia que importa: acá sale en el HTML inicial, no después de hidratar.
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'SoftwareApplication',
        '@id': `${SITE_URL}/#software`,
        name: 'BlissTracker',
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'Web',
        description: 'Sistema operativo para agencias: gestión de tareas con foco forzado + coach de IA, más los módulos que tu agencia necesite (marketing GEO/SEO/Ads, EOS/Traction, CRM de ventas) y reportes para clientes con URL pública.',
        url: siteUrl('/'),
        offers: {
          '@type': 'Offer',
          price: '0',
          priceCurrency: 'USD',
          description: `Plan Gratis hasta ${freeSeatLimit} usuarios. Trial de ${trialDays} días para Pro y Scale.`,
        },
        publisher: { '@id': `${SITE_URL}/#org` },
      },
      {
        '@type': 'Organization',
        '@id': `${SITE_URL}/#org`,
        name: 'BlissTracker',
        url: siteUrl('/'),
        logo: siteUrl('/blisstracker_logo.svg'),
        email: 'gaston@blissmkt.ar',
        sameAs: ['https://blissmkt.ar'],
      },
      {
        '@type': 'FAQPage',
        mainEntity: faqs.map(f => ({
          '@type': 'Question',
          name: f.q,
          acceptedAnswer: { '@type': 'Answer', text: f.a },
        })),
      },
    ],
  }

  return (
    <div className="min-h-screen bg-white text-gray-900 antialiased">
      <JsonLd schema={jsonLd} />

      <SiteNav />

      {/* ── Hero ── */}
      <section className="pt-16 pb-20 sm:pt-24 sm:pb-28 px-4 sm:px-6 bg-gradient-to-b from-white via-white to-gray-50">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-primary-50 border border-primary-100 text-primary-700 text-xs font-semibold px-3 py-1.5 rounded-full mb-8">
            <span className="w-1.5 h-1.5 bg-primary-500 rounded-full" />
            {hero.heroBadge}
          </div>

          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-extrabold text-gray-900 leading-[1.08] tracking-tight mb-6">
            {hero.heroTitle}<br />
            <span className="text-primary-500">
              <TypewriterAccent words={hero.heroTitleAccentWords} />
            </span>
          </h1>

          <p className="text-lg sm:text-xl text-gray-500 max-w-2xl mx-auto mb-10 leading-relaxed">
            {hero.heroSubtitle}
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-4">
            <TrackedLink
              href={REGISTER_URL}
              event="landing_cta_click"
              params={{ location: 'hero' }}
              className="w-full sm:w-auto bg-primary-500 hover:bg-primary-600 text-white text-base font-semibold px-8 py-4 rounded-xl transition-colors shadow-lg shadow-primary-100"
            >
              Probá {trialDays} días gratis →
            </TrackedLink>
            <TrackedLink
              href="#demo"
              event="landing_cta_click"
              params={{ location: 'hero_demo' }}
              className="w-full sm:w-auto text-gray-700 hover:text-gray-900 text-base font-medium px-8 py-4 rounded-xl border border-gray-200 hover:border-gray-300 transition-colors inline-flex items-center justify-center gap-2"
            >
              <span>▶</span> Ver demo (90s)
            </TrackedLink>
          </div>
          <p className="text-xs text-gray-400">Sin tarjeta de crédito · Cancelás cuando quieras</p>
        </div>

        {/* Video de demo (URL configurable en SuperAdmin → Landing) o maqueta de respaldo.
            En la SPA había un tercer estado —un rectángulo gris mientras viajaba
            /landing/content— porque hasta que no llegaba la respuesta no se sabía si había
            video. Server-side eso ya se sabe al renderizar, así que el placeholder
            desapareció y con él el salto de layout que provocaba. */}
        <div id="demo" className="max-w-5xl mx-auto mt-16 px-2 sm:px-0">
          {hero.demoVideoUrl ? <DemoVideo url={hero.demoVideoUrl} /> : <AppMockup />}
        </div>
      </section>

      <TrustedByBar clients={trusted} />

      {/* ── Problema ── */}
      <section className="py-24 px-4 sm:px-6 bg-gray-900">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white mb-4">
              {hero.problemTitle}
            </h2>
            <p className="text-gray-400 text-lg max-w-xl mx-auto">
              {hero.problemSubtitle}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {hero.problemCards.map((item, i) => (
              <div key={i} className="bg-gray-800 border border-gray-700 rounded-2xl p-6">
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-2xl">{item.emoji}</span>
                  <h3 className="text-white font-bold text-lg leading-tight">{item.title}</h3>
                </div>
                <p className="text-gray-400 text-sm leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Solución ── */}
      <section className="py-24 px-4 sm:px-6 bg-white">
        <div className="max-w-3xl mx-auto text-center">
          <p className="text-primary-500 font-semibold text-xs uppercase tracking-widest mb-6">
            La solución
          </p>
          <BlissLogo variant="lockup" className="h-12 w-auto mx-auto mb-8" />
          <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-8">
            {hero.solutionTitle}
          </h2>
          <div className="max-w-2xl mx-auto bg-primary-50 border border-primary-100 rounded-2xl px-6 sm:px-10 py-7 sm:py-9">
            <p className="text-gray-900 text-xl sm:text-2xl font-bold leading-snug">
              {hero.solutionParagraph1}
            </p>
          </div>
        </div>
      </section>

      <SegmentCards />

      {/* ── Funcionalidades ── */}
      <section className="py-24 px-4 sm:px-6 bg-gray-50">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-primary-500 font-semibold text-xs uppercase tracking-widest mb-4">
              Funcionalidades
            </p>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900">
              {hero.featuresTitle.split('\n').flatMap((line, i, arr) =>
                i < arr.length - 1 ? [line, <br key={`br-${i}`} className="hidden sm:block" />, ' '] : [line]
              )}
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {hero.featureCards.map((f, i) => (
              <div key={i} className="flex gap-4 bg-white border border-gray-100 rounded-2xl p-6 shadow-sm">
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

      {/* ── Cómo funciona ── */}
      <section id="como-funciona" className="py-24 px-4 sm:px-6 bg-white">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-primary-500 font-semibold text-xs uppercase tracking-widest mb-4">
              Cómo funciona
            </p>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900">
              <HighlightedTitle text={hero.stepsTitle} phrase="equipo enfocado" />
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10">
            {hero.steps.map((s, i) => (
              <div key={i} className="text-center">
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary-50 border border-primary-100 text-primary-600 font-black text-xl mb-5">
                  {String(i + 1).padStart(2, '0')}
                </div>
                <h3 className="font-bold text-gray-900 text-xl mb-3">{s.title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <ComparisonTable />
      <TestimonialsSection testimonials={testimonials} />

      {/* ── Beneficios ── */}
      <section className="py-24 px-4 sm:px-6 bg-primary-500">
        <div className="max-w-5xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white mb-4">
            {hero.benefitsTitle}
          </h2>
          <p className="text-primary-100 text-lg mb-12 max-w-xl mx-auto">
            {hero.benefitsSubtitle}
          </p>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {hero.benefitCards.map((b, i) => (
              <div key={i} className="bg-primary-600/40 border border-primary-400/30 rounded-2xl p-5">
                <p className="text-white font-extrabold text-lg mb-1.5">{b.label}</p>
                <p className="text-primary-100 text-xs leading-relaxed">{b.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Precios ── */}
      <section id="precios" className="py-24 px-4 sm:px-6 bg-white">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-primary-500 font-semibold text-xs uppercase tracking-widest mb-4">
              Precios
            </p>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-3">
              Simple. Sin sorpresas.
            </h2>
            <p className="text-gray-500 text-lg">Empezás gratis. Pagás cuando escala.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            {/* Gratis */}
            <div className="rounded-2xl border border-gray-200 p-8 flex flex-col">
              <div>
                <h3 className="font-bold text-gray-900 text-xl mb-1">Gratis</h3>
                <p className="text-gray-400 text-sm mb-6">Para equipos pequeños que arrancan</p>
                <div className="mb-7">
                  <span className="text-4xl font-extrabold text-gray-900">$0</span>
                  <span className="text-gray-400 text-sm ml-1">/mes</span>
                </div>
                <ul className="space-y-3 mb-8">
                  {[`Hasta ${freeSeatLimit} usuarios`, 'Proyectos ilimitados', 'Coach de IA incluido', 'Resúmenes semanales'].map(item => (
                    <li key={item} className="flex items-center gap-2.5 text-sm text-gray-600">
                      <span className="text-primary-500 font-bold">✓</span> {item}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="mt-auto">
                <a
                  href={REGISTER_URL}
                  className="block w-full text-center border border-gray-300 hover:border-gray-400 text-gray-700 hover:text-gray-900 font-semibold py-3 rounded-xl transition-colors"
                >
                  Crear cuenta gratis
                </a>
              </div>
            </div>

            {/* Pro — destacado */}
            <div className="rounded-2xl border-2 border-primary-500 p-8 relative shadow-xl shadow-primary-100/60 flex flex-col">
              <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-primary-500 text-white text-xs font-bold px-4 py-1 rounded-full whitespace-nowrap">
                MÁS POPULAR
              </div>
              <div>
                <h3 className="font-bold text-gray-900 text-xl mb-1">Pro</h3>
                <p className="text-gray-400 text-sm mb-6">Para agencias y equipos en crecimiento</p>
                <div className="mb-7">
                  <span className="text-4xl font-extrabold text-gray-900">${proPrice}</span>
                  <span className="text-gray-400 text-sm ml-1">/usuario/mes</span>
                </div>
                <ul className="space-y-3 mb-8">
                  {[
                    'Usuarios ilimitados',
                    'Todo lo del plan Gratis',
                    'Panel de administración',
                    'Reportes de productividad',
                    'RRHH y legajos del equipo',
                    'Soporte prioritario',
                  ].map(item => (
                    <li key={item} className="flex items-center gap-2.5 text-sm text-gray-600">
                      <span className="text-primary-500 font-bold">✓</span> {item}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="mt-auto">
                <a
                  href={REGISTER_URL}
                  className="block w-full text-center bg-primary-500 hover:bg-primary-600 text-white font-semibold py-3 rounded-xl transition-colors shadow-md shadow-primary-200"
                >
                  Empezar — {trialDays} días gratis
                </a>
              </div>
            </div>

            {/* Scale */}
            <div className="rounded-2xl border border-gray-200 p-8 flex flex-col">
              <div>
                <h3 className="font-bold text-gray-900 text-xl mb-1">Scale</h3>
                <p className="text-gray-400 text-sm mb-6">Para equipos de más de {scaleThreshold - 1} personas</p>
                <div className="mb-7">
                  <span className="text-4xl font-extrabold text-gray-900">${scalePrice}</span>
                  <span className="text-gray-400 text-sm ml-1">/usuario/mes</span>
                </div>
                <ul className="space-y-3 mb-8">
                  {[`+${scaleThreshold} usuarios`, 'Todo lo del plan Pro', 'Precio reducido por escala', 'Onboarding personalizado'].map(item => (
                    <li key={item} className="flex items-center gap-2.5 text-sm text-gray-600">
                      <span className="text-primary-500 font-bold">✓</span> {item}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="mt-auto">
                <a
                  href="mailto:gaston@blissmkt.ar?subject=BlissTracker%20Scale"
                  className="block w-full text-center border border-gray-300 hover:border-gray-400 text-gray-700 hover:text-gray-900 font-semibold py-3 rounded-xl transition-colors"
                >
                  Hablemos
                </a>
              </div>
            </div>
          </div>

          <div className="text-center mt-10">
            <Link
              href="/pricing"
              className="inline-flex items-center gap-2 text-primary-600 hover:text-primary-700 font-medium text-sm"
            >
              Ver tabla comparativa completa y calculadora
              <span>→</span>
            </Link>
          </div>
        </div>
      </section>

      <FaqSection groups={hero.faqGroups} />

      {/* ── CTA final ── */}
      <section className="py-24 px-4 sm:px-6 bg-gray-900 text-center">
        <div className="max-w-2xl mx-auto">
          <BlissLogo variant="honeycomb" className="w-20 h-20 mx-auto mb-5" />
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white mb-4 leading-tight">
            Tu equipo puede ejecutar mejor.<br />Empezá hoy.
          </h2>
          <p className="text-gray-400 text-lg mb-8">
            {trialDays} días gratis. Sin tarjeta de crédito. Sin configuración complicada.
          </p>
          <TrackedLink
            href={REGISTER_URL}
            event="landing_cta_click"
            params={{ location: 'final' }}
            className="inline-block bg-primary-500 hover:bg-primary-600 text-white text-base font-semibold px-10 py-4 rounded-xl transition-colors shadow-lg shadow-primary-900/30"
          >
            Crear cuenta gratis →
          </TrackedLink>
        </div>
      </section>

      <SiteFooter />
    </div>
  )
}
