import TestimonialCard from './TestimonialCard'

// TODO: reemplazar por testimonios reales cuando el usuario los envíe.
// Estructura sugerida: 3 testimonios — ideal con métrica cuantitativa al menos en uno.
const TESTIMONIALS = [
  {
    name:    'Nombre Cliente 1',
    role:    'Founder',
    company: 'Agencia X',
    photo:   '/testimonials/cliente-1.jpg',
    quote:   'Reemplazamos Asana, SEMrush y 4 spreadsheets. El equipo recuperó al menos 6 horas semanales de admin y los informes a clientes se generan solos.',
    metric:  '−60% reuniones de status',
  },
  {
    name:    'Nombre Cliente 2',
    role:    'Head of Performance',
    company: 'Agencia Y',
    photo:   '/testimonials/cliente-2.jpg',
    quote:   'Las URL públicas para clientes cambiaron la conversación. Antes mandábamos PDFs, ahora ellos ven el dashboard en tiempo real y firman renewals más rápido.',
    metric:  '+38% renewal rate',
  },
  {
    name:    'Nombre Cliente 3',
    role:    'PM',
    company: 'Agencia Z',
    photo:   '/testimonials/cliente-3.jpg',
    quote:   'El coach IA es el detalle que no sabía que necesitaba. A las 9 de la mañana ya sé qué priorizar — sin reunión, sin pestaña abierta.',
    metric:  null,
  },
]

export default function TestimonialsSection() {
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
          {TESTIMONIALS.map((t, i) => (
            <TestimonialCard key={i} {...t} />
          ))}
        </div>
      </div>
    </section>
  )
}
