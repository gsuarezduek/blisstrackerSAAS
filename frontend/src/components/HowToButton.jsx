import { useState } from 'react'
import { HOW_TO_CATALOG } from '../lib/howToCatalog'

// Ícono de ayuda contextual — mismo ícono (💡) en toda la app, distinto solo en
// el `topic` que le pasás. Abre un modal chico con la lógica de esa pantalla:
// pensado para el usuario que no va a leer el Wiki pero sí una explicación
// corta ahí mismo donde tiene la duda. Si el topic no existe en el catálogo,
// no renderiza nada (evita íconos rotos si alguien borra una entrada).
export default function HowToButton({ topic, className = '' }) {
  const [open, setOpen] = useState(false)
  const entry = HOW_TO_CATALOG[topic]
  if (!entry) return null

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="¿Cómo funciona esto?"
        aria-label="¿Cómo funciona esto?"
        className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors text-sm shrink-0 ${className}`}
      >
        💡
      </button>

      {open && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-[70] p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md p-6 max-h-[85vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 mb-3">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">💡 {entry.title}</h2>
              <button
                onClick={() => setOpen(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors shrink-0"
                aria-label="Cerrar"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="space-y-2.5 text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
              {entry.body.map((p, i) => <p key={i}>{p}</p>)}
            </div>

            {entry.steps && (
              <ol className="list-decimal list-outside ml-4 mt-3 space-y-1.5 text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                {entry.steps.map((s, i) => <li key={i}>{s}</li>)}
              </ol>
            )}

            {entry.requires && (
              <p className="text-xs bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 rounded-lg px-3 py-2 mt-3">
                ⚡ {entry.requires}
              </p>
            )}
          </div>
        </div>
      )}
    </>
  )
}
