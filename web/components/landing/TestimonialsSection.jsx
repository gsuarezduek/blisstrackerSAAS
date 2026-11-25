import { apiAsset } from '@/lib/api'
import TestimonialCard from './TestimonialCard'
import Carousel from './Carousel'

/**
 * Testimonios reales (SuperAdmin → Landing → Testimonios). Sin ninguno activo la
 * sección no se muestra: mejor eso que testimonios de relleno.
 *
 * Es server component: las tarjetas se arman acá y se le pasan al carrusel como
 * children, así el único JavaScript que se manda es el del deslizamiento.
 */
export default function TestimonialsSection({ testimonials = [] }) {
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

        <Carousel perView={{ base: 1, md: 3 }}>
          {testimonials.map(t => (
            <TestimonialCard
              key={t.id}
              name={t.name}
              role={t.role}
              company={t.company}
              quote={t.quote}
              metric={t.metric}
              photo={t.photoUrl ? apiAsset(t.photoUrl) : null}
            />
          ))}
        </Carousel>
      </div>
    </section>
  )
}
