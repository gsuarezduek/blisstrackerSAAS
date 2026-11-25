import { buildMetadata, breadcrumbSchema } from '@/lib/seo'
import JsonLd from '@/components/JsonLd'
import { metaFor } from '@/lib/pageMeta'
import ModuleLandingLayout from '@/components/landing/ModuleLandingLayout'
import ContactForm from '@/components/contacto/ContactForm'

export const metadata = buildMetadata({ ...metaFor('/contacto'), path: '/contacto' })

const REASONS = [
  { title: 'Hablar con ventas', desc: 'Más de 20 usuarios, plan Scale, o preguntas sobre precios y facturación.' },
  { title: 'Soporte técnico', desc: 'Algo no funciona como esperabas, o necesitás ayuda para configurar un módulo.' },
  { title: 'Alianzas y prensa', desc: 'Propuestas comerciales, integraciones o notas de prensa.' },
]

export default function ContactoPage() {
  return (
    <ModuleLandingLayout>
      <JsonLd schema={breadcrumbSchema([
        { name: 'Inicio', path: '/' },
        { name: 'Contacto', path: '/contacto' },
      ])} />

      <section className="pt-16 pb-24 px-4 sm:px-6 bg-gradient-to-b from-white to-gray-50">
        <div className="max-w-5xl mx-auto">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <span className="inline-block px-3 py-1 bg-primary-50 text-primary-700 text-xs font-semibold rounded-full mb-6">
              Contacto
            </span>
            <h1 className="text-4xl sm:text-5xl font-extrabold text-gray-900 leading-tight mb-5">
              Hablemos.
            </h1>
            <p className="text-lg text-gray-500 leading-relaxed">
              Contanos qué necesita tu agencia y te respondemos en menos de 24hs hábiles.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-10">
            <div className="lg:col-span-2 space-y-4">
              {REASONS.map(r => (
                <div key={r.title} className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
                  <h2 className="font-bold text-gray-900 text-base mb-1">{r.title}</h2>
                  <p className="text-gray-500 text-sm leading-relaxed">{r.desc}</p>
                </div>
              ))}
              <p className="text-xs text-gray-400 px-1">
                También podés escribirnos directo a{' '}
                <a href="mailto:gaston@blissmkt.ar" className="text-primary-600 hover:text-primary-700 font-medium">
                  gaston@blissmkt.ar
                </a>.
              </p>
            </div>

            <div className="lg:col-span-3 bg-white border border-gray-200 rounded-2xl p-6 sm:p-8 shadow-sm">
              <ContactForm />
            </div>
          </div>
        </div>
      </section>
    </ModuleLandingLayout>
  )
}
