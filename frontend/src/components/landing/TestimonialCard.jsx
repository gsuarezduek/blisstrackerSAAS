/**
 * Card individual de testimonio. Recibe la data y la renderiza con foto + quote + métrica.
 * Cuando el usuario envíe los testimonios reales, reemplazá el contenido del array TESTIMONIALS
 * en TestimonialsSection.jsx.
 */
export default function TestimonialCard({ name, role, company, photo, quote, metric }) {
  return (
    <figure className="bg-white border border-gray-200 rounded-2xl p-6 flex flex-col h-full shadow-sm">
      {metric && (
        <div className="mb-4 inline-block self-start bg-primary-50 text-primary-700 text-xs font-bold px-3 py-1.5 rounded-full">
          {metric}
        </div>
      )}
      <blockquote className="text-gray-800 leading-relaxed flex-1 text-[15px]">
        “{quote}”
      </blockquote>
      <figcaption className="flex items-center gap-3 mt-6 pt-5 border-t border-gray-100">
        {photo ? (
          <img src={photo} alt={name}
            className="w-11 h-11 rounded-full object-cover bg-gray-100"
            onError={(e) => { e.currentTarget.style.display = 'none' }}
          />
        ) : (
          <div className="w-11 h-11 rounded-full bg-gradient-to-br from-primary-300 to-primary-500 flex items-center justify-center text-white font-bold text-sm">
            {name.split(' ').map(p => p[0]).slice(0, 2).join('')}
          </div>
        )}
        <div>
          <p className="text-sm font-semibold text-gray-900">{name}</p>
          <p className="text-xs text-gray-500">{role}{company && ` · ${company}`}</p>
        </div>
      </figcaption>
    </figure>
  )
}
