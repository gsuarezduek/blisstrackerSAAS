import { briefByKey } from './briefs/briefCatalog'
import { linkify } from '../utils/linkify'

// Vista de solo lectura de los briefs de un proyecto, para el portal de cliente
// (sin auth). Espejo visual de BriefView en briefs/ProjectBriefs.jsx, sin edición.
export default function ClientBriefsView({ briefs }) {
  const items = (briefs || [])
    .map(b => ({ brief: briefByKey(b.type), answers: b.answers || {} }))
    .filter(x => x.brief)
    .map(({ brief, answers }) => ({
      brief,
      sections: brief.sections
        .map(section => ({
          title: section.title,
          fields: section.fields
            .map(f => ({ ...f, value: answers[f.k] }))
            .filter(f => f.value != null && String(f.value).trim() !== ''),
        }))
        .filter(section => section.fields.length > 0),
    }))
    // Un brief con fila en la DB pero sin ningún campo completado no tiene nada
    // que mostrar — se descarta acá para que el chequeo de "vacío" de abajo sea
    // certero (antes podía quedar la vista en blanco sin ningún mensaje).
    .filter(x => x.sections.length > 0)

  if (items.length === 0) {
    return <p className="text-sm text-gray-500 text-center py-8">Todavía no hay briefs cargados.</p>
  }

  return (
    <div className="space-y-6">
      {items.map(({ brief, sections }) => (
        <div key={brief.key} className="space-y-3">
          <h2 className="text-base font-bold text-gray-900">{brief.title}</h2>
          {sections.map(section => (
            <div key={section.title} className="bg-white rounded-2xl border border-gray-200 p-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">{section.title}</p>
              <div className="space-y-4">
                {section.fields.map(f => (
                  <div key={f.k}>
                    <p className="text-sm font-medium text-gray-700 mb-1">{f.q}</p>
                    <p className="text-sm text-gray-600 whitespace-pre-wrap break-words leading-relaxed">
                      {linkify(f.value)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
