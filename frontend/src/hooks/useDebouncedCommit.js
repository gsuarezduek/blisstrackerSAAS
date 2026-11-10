import { useState, useEffect, useRef } from 'react'

/**
 * Debounce genérico para inputs de texto libre: evita mandar un PATCH por tecla.
 * Lo usan la ficha de la pieza de Contenido y la ficha SEO de una nota del
 * blog (Marketing → GEO / SEO → Contenido SEO → Inventario del blog).
 */
export default function useDebouncedCommit(value, onCommit, delay = 600) {
  const [draft, setDraft] = useState(value)
  const first = useRef(true)

  useEffect(() => { setDraft(value) }, [value])

  useEffect(() => {
    if (first.current) { first.current = false; return }
    const t = setTimeout(() => { if (draft !== value) onCommit(draft) }, delay)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft])

  return [draft, setDraft]
}
