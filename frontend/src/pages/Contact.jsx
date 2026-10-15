import { useState } from 'react'
import ModuleLandingLayout from '../components/landing/ModuleLandingLayout'
import api from '../api/client'
import { trackEvent } from '../lib/analytics'

const REASONS = [
  { title: 'Hablar con ventas', desc: 'Más de 20 usuarios, plan Scale, o preguntas sobre precios y facturación.' },
  { title: 'Soporte técnico', desc: 'Algo no funciona como esperabas, o necesitás ayuda para configurar un módulo.' },
  { title: 'Alianzas y prensa', desc: 'Propuestas comerciales, integraciones o notas de prensa.' },
]

export default function Contact() {
  const [form, setForm] = useState({ name: '', email: '', company: '', message: '', website: '' })
  const [status, setStatus] = useState('idle') // idle | sending | sent | error
  const [error, setError] = useState('')

  const set = (field) => (e) => setForm(f => ({ ...f, [field]: e.target.value }))

  async function handleSubmit(e) {
    e.preventDefault()
    if (status === 'sending') return
    setStatus('sending')
    setError('')
    try {
      await api.post('/landing/contact', form)
      trackEvent('landing_contact_submit')
      setStatus('sent')
    } catch (err) {
      setError(err.response?.data?.error || 'No pudimos enviar tu mensaje. Probá de nuevo en un momento.')
      setStatus('error')
    }
  }

  return (
    <ModuleLandingLayout
      metaTitle="Contacto — BlissTracker"
      metaDescription="Escribinos para hablar con ventas, pedir soporte o proponer una alianza. Te respondemos en menos de 24hs hábiles."
      canonicalPath="/contacto"
    >
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
            {/* Razones para escribir */}
            <div className="lg:col-span-2 space-y-4">
              {REASONS.map(r => (
                <div key={r.title} className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
                  <h3 className="font-bold text-gray-900 text-base mb-1">{r.title}</h3>
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

            {/* Form */}
            <div className="lg:col-span-3 bg-white border border-gray-200 rounded-2xl p-6 sm:p-8 shadow-sm">
              {status === 'sent' ? (
                <div className="text-center py-10">
                  <div className="text-4xl mb-4">✓</div>
                  <h2 className="text-xl font-bold text-gray-900 mb-2">¡Listo, lo recibimos!</h2>
                  <p className="text-gray-500 text-sm">Te vamos a responder a la brevedad al email que nos dejaste.</p>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  {/* Honeypot anti-spam: invisible para personas, un bot de formulario lo completa igual. */}
                  <input
                    type="text"
                    name="website"
                    value={form.website}
                    onChange={set('website')}
                    autoComplete="off"
                    tabIndex={-1}
                    aria-hidden="true"
                    className="absolute w-0 h-0 opacity-0 overflow-hidden"
                  />

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">Nombre</label>
                      <input
                        type="text" required maxLength={160}
                        value={form.name} onChange={set('name')}
                        className="w-full border border-gray-300 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-200 focus:border-primary-400"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
                      <input
                        type="email" required maxLength={160}
                        value={form.email} onChange={set('email')}
                        className="w-full border border-gray-300 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-200 focus:border-primary-400"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Empresa <span className="text-gray-400 font-normal">(opcional)</span></label>
                    <input
                      type="text" maxLength={160}
                      value={form.company} onChange={set('company')}
                      className="w-full border border-gray-300 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-200 focus:border-primary-400"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Mensaje</label>
                    <textarea
                      required maxLength={5000} rows={5}
                      value={form.message} onChange={set('message')}
                      className="w-full border border-gray-300 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-200 focus:border-primary-400 resize-none"
                    />
                  </div>

                  {status === 'error' && (
                    <p className="text-sm text-red-600">{error}</p>
                  )}

                  <button
                    type="submit"
                    disabled={status === 'sending'}
                    className="w-full bg-primary-500 hover:bg-primary-600 disabled:opacity-60 text-white font-semibold py-3 rounded-xl transition-colors shadow-md shadow-primary-200"
                  >
                    {status === 'sending' ? 'Enviando…' : 'Enviar mensaje'}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      </section>
    </ModuleLandingLayout>
  )
}
