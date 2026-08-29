/**
 * Testimonios reales, editables desde SuperAdmin → Landing → Testimonios
 * (GET /api/landing/testimonials). Sin ninguno activo, la sección se oculta
 * por completo — mejor eso que mostrar testimonios de relleno.
 */
import { useState, useEffect } from 'react'
import api from '../../api/client'
import TestimonialCard from './TestimonialCard'

const API_URL = import.meta.env.VITE_API_URL || ''

export default function TestimonialsSection() {
  const [testimonials, setTestimonials] = useState([])

  useEffect(() => {
    api.get('/landing/testimonials')
      .then(({ data }) => setTestimonials(data))
      .catch(() => {})
  }, [])

  if (testimonials.length === 0) return null

  return (
    <section id="testimonios" className="py-24 px-4 sm:px-6 bg-gray-50">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-14">
          <p className="text-primary-500 font-semibold text-xs uppercase tracking-widest mb-4">
            Testimonios
          </p>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-3">
            Lo que dicen las agencias que ya migraron.
          </h2>
          <p className="text-gray-500 text-lg max-w-xl mx-auto">
            Casos reales, métricas reales.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {testimonials.map(t => (
            <TestimonialCard
              key={t.id}
              name={t.name}
              role={t.role}
              company={t.company}
              quote={t.quote}
              metric={t.metric}
              photo={t.photoUrl ? `${API_URL}${t.photoUrl}` : null}
            />
          ))}
        </div>
      </div>
    </section>
  )
}
