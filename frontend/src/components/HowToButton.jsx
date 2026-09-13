import { useState } from 'react'
import { HOW_TO_CATALOG } from '../lib/howToCatalog'
import HowToGuideModal from './HowToGuideModal'

// Ícono de Guía Contextual — mismo ícono (💡) en toda la app, distinto solo en
// el `topic` que le pasás. Abre una guía del modelo mental de esa sección
// (qué problema resuelve, cómo pensarla, con qué se conecta, qué evitar), no
// un tooltip de qué hace cada botón. Si el topic no existe en el catálogo,
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
        title="Ver guía de esta sección"
        aria-label="Ver guía de esta sección"
        className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors text-sm shrink-0 ${className}`}
      >
        💡
      </button>

      {open && <HowToGuideModal entry={entry} onClose={() => setOpen(false)} />}
    </>
  )
}
