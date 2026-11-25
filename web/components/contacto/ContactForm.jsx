'use client'

import { useState } from 'react'
import { API } from '@/lib/api'
import { trackEvent } from '@/lib/analytics'

/**
 * Formulario de contacto. Es la única parte interactiva de /contacto, así que el resto
 * de la página (motivos para escribir, encabezado) la arma el server.
 *
 * Postea a /api/landing/contact con fetch crudo: no hay JWT ni workspace que mandar,
 * igual que el resto de lo público. El honeypot `website` se mantiene tal cual.
 */
export default function ContactForm() {
  const [form, setForm] = useState({ name: '', email: '', company: '', message: '', website: '' })
  const [status, setStatus] = useState('idle') // idle | sending | sent | error
  const [error, setError] = useState('')

  const set = field => e => setForm(f => ({ ...f, [field]: e.target.value }))

  async function handleSubmit(e) {
    e.preventDefault()
    if (status === 'sending') return
    setStatus('sending')
    setError('')
    try {
      const res = await fetch(`${API}/api/landing/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || '')
      }
      trackEvent('landing_contact_submit')
      setStatus('sent')
    } catch (err) {
      setError(err.message || 'No pudimos enviar tu mensaje. Probá de nuevo en un momento.')
      setStatus('error')
    }
  }

  if (status === 'sent') {
    return (
      <div className="text-center py-10">
        <div className="text-4xl mb-4">✓</div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">¡Listo, lo recibimos!</h2>
        <p className="text-gray-500 text-sm">Te vamos a responder a la brevedad al email que nos dejaste.</p>
      </div>
    )
  }

  const inputCls = 'w-full border border-gray-300 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-200 focus:border-primary-400'

  return (
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
          <label htmlFor="contact-name" className="block text-sm font-medium text-gray-700 mb-1.5">Nombre</label>
          <input id="contact-name" type="text" required maxLength={160}
            value={form.name} onChange={set('name')} className={inputCls} />
        </div>
        <div>
          <label htmlFor="contact-email" className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
          <input id="contact-email" type="email" required maxLength={160}
            value={form.email} onChange={set('email')} className={inputCls} />
        </div>
      </div>

      <div>
        <label htmlFor="contact-company" className="block text-sm font-medium text-gray-700 mb-1.5">
          Empresa <span className="text-gray-400 font-normal">(opcional)</span>
        </label>
        <input id="contact-company" type="text" maxLength={160}
          value={form.company} onChange={set('company')} className={inputCls} />
      </div>

      <div>
        <label htmlFor="contact-message" className="block text-sm font-medium text-gray-700 mb-1.5">Mensaje</label>
        <textarea id="contact-message" required maxLength={5000} rows={5}
          value={form.message} onChange={set('message')} className={`${inputCls} resize-none`} />
      </div>

      {status === 'error' && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={status === 'sending'}
        className="w-full bg-primary-500 hover:bg-primary-600 disabled:opacity-60 text-white font-semibold py-3 rounded-xl transition-colors shadow-md shadow-primary-200"
      >
        {status === 'sending' ? 'Enviando…' : 'Enviar mensaje'}
      </button>
    </form>
  )
}
