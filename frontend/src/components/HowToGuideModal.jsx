import { useState } from 'react'

// Metadata fija de cada tipo de sección (ícono + label + orden de aparición).
// Vive acá y no en cada entrada del catálogo para que ajustar un ícono/copy
// sea un cambio en un solo lugar, no en decenas de entradas de contenido.
const SECTION_META = {
  logica:  { icon: '⚙️', label: 'Cómo funciona' },
  uso:     { icon: '✅', label: 'Cómo usarlo bien' },
  conecta: { icon: '🔗', label: 'Se conecta con' },
  ejemplo: { icon: '🧩', label: 'Ejemplo' },
}

const TONE_ICON = { do: '✅', dont: '🚫' }

function Bullet({ item }) {
  if (typeof item === 'string') {
    return (
      <li className="flex gap-2">
        <span className="text-gray-300 dark:text-gray-600 mt-0.5 shrink-0">▸</span>
        <span>{item}</span>
      </li>
    )
  }
  const { text, tone } = item
  if (tone === 'warn') {
    return (
      <li className="list-none text-xs bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 rounded-lg px-3 py-2">
        ⚡ {text}
      </li>
    )
  }
  return (
    <li className="flex gap-2">
      <span className="mt-0.5 shrink-0">{TONE_ICON[tone] || '▸'}</span>
      <span>{text}</span>
    </li>
  )
}

function Section({ id, bullets, text }) {
  const meta = SECTION_META[id]
  if (!meta) return null
  return (
    <div>
      <h3 className="flex items-center gap-1.5 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2">
        <span>{meta.icon}</span> {meta.label}
      </h3>
      {bullets && (
        <ul className="space-y-1.5 text-sm text-gray-600 dark:text-gray-300 leading-relaxed list-none">
          {bullets.map((b, i) => <Bullet key={i} item={b} />)}
        </ul>
      )}
      {text && (
        <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed italic bg-gray-50 dark:bg-gray-900/40 rounded-lg px-3 py-2.5">
          {text}
        </p>
      )}
    </div>
  )
}

// Glosario término→definición, colapsado por default. Es la única parte del
// modal donde un disclosure tiene sentido: es contenido de consulta puntual
// (tipo diccionario), no la guía en sí — forzarlo siempre visible rompería el
// límite de "se lee entero en 30-90 segundos".
function Glossary({ items }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border-t border-gray-100 dark:border-gray-700 pt-3.5">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
      >
        <span>📖 Glosario de métricas</span>
        <span className={`transition-transform ${open ? 'rotate-180' : ''}`}>▾</span>
      </button>
      {open && (
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2.5 mt-3">
          {items.map(([term, desc]) => (
            <div key={term}>
              <dt className="text-xs font-semibold text-gray-800 dark:text-gray-200">{term}</dt>
              <dd className="text-xs text-gray-500 dark:text-gray-400 leading-snug">{desc}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  )
}

// Modal de la Guía Contextual — reemplaza al viejo modal chico de HowToButton.
// Header (título + hook) y footer (próximo paso) quedan fijos; solo el cuerpo
// de secciones scrollea. Sin tabs ni acordeón en el cuerpo principal a
// propósito: ambos obligan a "abrir" contenido, y el objetivo es que se
// entienda todo bajando la vista, no explorando.
export default function HowToGuideModal({ entry, onClose }) {
  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-[70] p-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-3xl max-h-[85vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-6 pt-6 pb-4 shrink-0 border-b border-gray-100 dark:border-gray-700">
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">💡 {entry.title}</h2>
            {entry.hook && (
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1.5 leading-relaxed">{entry.hook}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors shrink-0"
            aria-label="Cerrar"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="px-6 py-4 overflow-y-auto space-y-5">
          {(entry.sections || []).map((s, i) => <Section key={i} {...s} />)}
          {entry.glossary && <Glossary items={entry.glossary} />}
        </div>

        {entry.nextStep && (
          <div className="px-6 py-3.5 shrink-0 border-t border-gray-100 dark:border-gray-700 bg-primary-50/60 dark:bg-primary-900/10 rounded-b-2xl">
            <p className="text-sm text-primary-800 dark:text-primary-300 font-medium">
              👉 {entry.nextStep}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
