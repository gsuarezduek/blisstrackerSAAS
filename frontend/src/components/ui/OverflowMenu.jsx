import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'

// Menú "⋯" de acciones secundarias — `items` es `[{ label, onClick, danger? }]`.
//
// Vivía en TaskCard.jsx, donde nació para el Dashboard; se movió acá cuando la
// vista de lista de la Nube necesitó el mismo menú y pasó a ser un tercer
// consumidor. Importar desde TaskCard habría hecho que la Nube dependa de un
// componente del Dashboard.
//
export function OverflowMenu({ items }) {
  const [pos, setPos] = useState(null) // null = cerrado; { top, right } en coordenadas del viewport
  const btnRef = useRef(null)
  const menuRef = useRef(null)
  const open = pos != null

  // El menú se dibuja en un portal con position:fixed para que ningún contenedor con
  // overflow-hidden (ej. los grupos por proyecto del Backlog) lo recorte. Si no hay
  // lugar debajo del botón, se abre hacia arriba.
  function toggle() {
    if (open) { setPos(null); return }
    const r = btnRef.current.getBoundingClientRect()
    const menuH = items.length * 40 + 8
    const below = window.innerHeight - r.bottom
    const top = below < menuH + 8 && r.top > menuH + 8 ? r.top - menuH - 4 : r.bottom + 4
    setPos({ top, right: window.innerWidth - r.right })
  }

  useEffect(() => {
    if (!open) return
    const close = () => setPos(null)
    const onDoc = e => {
      if (!btnRef.current?.contains(e.target) && !menuRef.current?.contains(e.target)) close()
    }
    const onKey = e => { if (e.key === 'Escape') close() }
    document.addEventListener('mousedown', onDoc)
    window.addEventListener('keydown', onKey)
    window.addEventListener('resize', close)
    window.addEventListener('scroll', close, true)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', close)
      window.removeEventListener('scroll', close, true)
    }
  }, [open])

  if (items.length === 0) return <div className="w-8 flex-shrink-0" />
  return (
    <div className="relative flex-shrink-0">
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        aria-label="Más acciones"
        aria-expanded={open}
        className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 dark:hover:text-gray-200 transition-colors"
      >
        <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path d="M10 6a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Zm0 5.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Zm0 5.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Z" /></svg>
      </button>
      {open && createPortal(
        <div ref={menuRef} role="menu" style={{ position: 'fixed', top: pos.top, right: pos.right }}
          className="z-50 w-48 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-lg p-1">
          {items.map(it => (
            <button
              key={it.label}
              type="button"
              role="menuitem"
              onClick={() => { setPos(null); it.onClick() }}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                it.danger ? 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20' : 'text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
            >
              {it.label}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </div>
  )
}
