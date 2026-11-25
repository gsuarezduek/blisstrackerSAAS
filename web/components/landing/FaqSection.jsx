/**
 * FAQ con <details>/<summary> nativos en vez del acordeón con useState de la SPA.
 *
 * El cambio es deliberado y es de SEO, no de estilo: en la SPA la respuesta de un item
 * cerrado NO se renderizaba (`{open && …}`), así que el texto de las 15 respuestas no
 * existía en el HTML — justo el contenido que hace que la página valga para una
 * búsqueda. Con <details> las respuestas están siempre en el HTML, el navegador se
 * ocupa de abrir y cerrar (cero JavaScript) y se gana el teclado y el "buscar en la
 * página" gratis. El `group-open:rotate-45` reemplaza al estado de React para el +.
 */
export default function FaqSection({ groups }) {
  return (
    <section id="faq" className="py-24 px-4 sm:px-6 bg-gray-50">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-14">
          <p className="text-primary-500 font-semibold text-xs uppercase tracking-widest mb-4">
            Preguntas frecuentes
          </p>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900">
            Lo que más nos preguntan.
          </h2>
        </div>

        {groups.map(g => (
          <div key={g.group} className="mb-8">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3 px-1">{g.group}</h3>
            <div className="space-y-3">
              {g.items.map((faq, i) => (
                <details
                  key={`${g.group}-${i}`}
                  className="group bg-white rounded-xl border border-gray-200 overflow-hidden [&_summary::-webkit-details-marker]:hidden"
                >
                  <summary className="w-full cursor-pointer list-none px-6 py-5 flex items-center justify-between gap-4 hover:bg-gray-50 transition-colors">
                    <span className="font-semibold text-gray-900 text-sm sm:text-base">{faq.q}</span>
                    <span className="text-primary-500 text-2xl font-light flex-shrink-0 transition-transform duration-200 group-open:rotate-45">
                      +
                    </span>
                  </summary>
                  <div className="px-6 pb-5 pt-3 text-gray-500 text-sm leading-relaxed border-t border-gray-100">
                    {faq.a}
                  </div>
                </details>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
