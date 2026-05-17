/**
 * Sección "Hecho por" con foto + bio del founder. Aporta autoridad y trust en SaaS de solo founder.
 * Cuando el usuario envíe foto + bio + LinkedIn, reemplazar los placeholders.
 */
export default function FounderBio() {
  return (
    <section id="hecho-por" className="py-24 px-4 sm:px-6 bg-white">
      <div className="max-w-4xl mx-auto">
        <div className="rounded-3xl border border-gray-200 bg-gradient-to-br from-gray-50 to-white p-8 sm:p-12 shadow-sm">
          <div className="flex flex-col sm:flex-row items-start gap-8">
            {/* Foto del founder. TODO: reemplazar /founder.jpg por la foto real. */}
            <div className="flex-shrink-0">
              <img
                src="/founder.jpg"
                alt="Gastón Suárez Duek"
                className="w-32 h-32 sm:w-40 sm:h-40 rounded-2xl object-cover border-4 border-white shadow-md bg-gray-100"
                onError={(e) => {
                  e.currentTarget.style.display = 'none'
                  e.currentTarget.nextElementSibling.style.display = 'flex'
                }}
              />
              <div
                style={{ display: 'none' }}
                className="w-32 h-32 sm:w-40 sm:h-40 rounded-2xl bg-gradient-to-br from-primary-400 to-primary-600 items-center justify-center text-white font-bold text-4xl shadow-md"
              >
                GS
              </div>
            </div>

            <div className="flex-1">
              <p className="text-primary-500 font-semibold text-xs uppercase tracking-widest mb-3">
                Hecho por
              </p>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-900 mb-3">
                Gastón Suárez Duek
              </h2>
              <p className="text-gray-700 leading-relaxed mb-5">
                {/* TODO: reemplazar por bio real del usuario. Sugerencia: 50-100 palabras. */}
                Construí BlissTracker después de años manejando una agencia de marketing y
                sufrir el caos de tener Asana, SEMrush, GA4, Meta Ads y 6 spreadsheets abiertos
                para reportar un mes a un cliente. La hipótesis: una agencia no necesita
                10 herramientas, necesita un sistema operativo. Soy founder + único dev,
                tomo decisiones rápido y respondo emails personalmente.
              </p>
              <div className="flex flex-wrap items-center gap-4 text-sm">
                <a
                  href="https://www.linkedin.com/in/gaston-suarez-duek/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-primary-600 hover:text-primary-700 font-medium"
                >
                  LinkedIn ↗
                </a>
                <a
                  href="mailto:gaston@blissmkt.ar"
                  className="inline-flex items-center gap-1.5 text-primary-600 hover:text-primary-700 font-medium"
                >
                  gaston@blissmkt.ar
                </a>
                <a
                  href="https://blissmkt.ar"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-gray-500 hover:text-gray-700"
                >
                  blissmkt.ar ↗
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
