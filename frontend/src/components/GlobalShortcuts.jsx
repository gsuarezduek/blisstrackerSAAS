import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { isWorkspaceSubdomain } from '../utils/domain'
import AddTaskModal from './AddTaskModal'

// Catálogo de atajos — también alimenta el overlay de ayuda (tecla "?").
// `chord: true` = teclas en secuencia (G luego D); por defecto se combinan (Ctrl/Cmd + B).
const SHORTCUTS = [
  { keys: ['N'],             desc: 'Nueva tarea (desde cualquier página)' },
  { keys: ['G', 'D'],        desc: 'Ir al Dashboard',     chord: true },
  { keys: ['G', 'P'],        desc: 'Ir a Mis Proyectos',  chord: true },
  { keys: ['G', 'R'],        desc: 'Ir a Tiempo real',    chord: true },
  { keys: ['Ctrl/Cmd', 'B'], desc: 'Abrir / cerrar la pizarra de notas' },
  { keys: ['?'],             desc: 'Mostrar / ocultar esta ayuda' },
  { keys: ['Esc'],           desc: 'Cerrar la ventana actual' },
]

// ¿El foco está en un campo editable? Entonces no disparamos atajos de una sola tecla.
function isTypingTarget(el) {
  if (!el) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable
}

function Kbd({ children }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[1.6rem] px-1.5 py-0.5 rounded-md border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-xs font-semibold text-gray-700 dark:text-gray-200 shadow-sm">
      {children}
    </kbd>
  )
}

export default function GlobalShortcuts() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [taskOpen, setTaskOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [toast, setToast] = useState('')

  // Solo activo para usuarios autenticados dentro de un workspace (no en landing/login).
  const enabled = !!user && isWorkspaceSubdomain()

  useEffect(() => {
    if (!enabled) return

    let gPending = false
    let gTimer = null
    const clearG = () => { gPending = false; if (gTimer) clearTimeout(gTimer) }

    function onKey(e) {
      // Escape cierra nuestras ventanas, incluso si el foco está dentro del modal.
      if (e.key === 'Escape') {
        if (helpOpen) { setHelpOpen(false); return }
        if (taskOpen) { setTaskOpen(false); return }
        return
      }

      // Dejamos las combinaciones con modificadores al navegador/SO.
      if (e.ctrlKey || e.metaKey || e.altKey) return
      // No interferir mientras se escribe.
      if (isTypingTarget(e.target)) return

      const key = e.key

      // Ayuda con "?"
      if (key === '?') { e.preventDefault(); setHelpOpen(v => !v); clearG(); return }

      // Si una de nuestras ventanas está abierta, no disparamos más atajos de tecla.
      if (taskOpen || helpOpen) return

      const lower = key.toLowerCase()

      // Acorde de navegación: "g" y luego d/p/r
      if (gPending) {
        const dest = { d: '/', h: '/', p: '/my-projects', r: '/realtime' }[lower]
        clearG()
        if (dest) { e.preventDefault(); navigate(dest) }
        return
      }
      if (lower === 'g') {
        gPending = true
        gTimer = setTimeout(() => { gPending = false }, 1200)
        return
      }

      // Nueva tarea
      if (lower === 'n') { e.preventDefault(); setTaskOpen(true) }
    }

    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey); clearG() }
  }, [enabled, navigate, taskOpen, helpOpen])

  function handleAdd(task) {
    // Avisamos a la página activa (ej. Dashboard) para que refresque su lista.
    window.dispatchEvent(new CustomEvent('bliss:task-created', { detail: task }))
    setToast('Tarea creada ✓')
    setTimeout(() => setToast(''), 2500)
  }

  if (!enabled) return null

  return (
    <>
      {taskOpen && (
        <AddTaskModal onAdd={handleAdd} onClose={() => setTaskOpen(false)} />
      )}

      {/* Overlay de ayuda de atajos */}
      {helpOpen && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60] p-4"
          onClick={() => setHelpOpen(false)}
        >
          <div
            className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md p-6"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">Atajos de teclado</h2>
              <button
                onClick={() => setHelpOpen(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                aria-label="Cerrar"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <ul className="space-y-2.5">
              {SHORTCUTS.map(s => (
                <li key={s.desc} className="flex items-center justify-between gap-4">
                  <span className="text-sm text-gray-600 dark:text-gray-300">{s.desc}</span>
                  <span className="flex items-center gap-1 flex-shrink-0">
                    {s.keys.map((k, i) => (
                      <span key={k} className="flex items-center gap-1">
                        {i > 0 && <span className="text-xs text-gray-400">{s.chord ? 'luego' : '+'}</span>}
                        <Kbd>{k}</Kbd>
                      </span>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-4">
              Los atajos no se activan mientras escribís en un campo de texto.
            </p>
          </div>
        </div>
      )}

      {/* Confirmación breve */}
      {toast && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[70] bg-gray-900 dark:bg-gray-700 text-white text-sm font-medium px-4 py-2 rounded-xl shadow-lg">
          {toast}
        </div>
      )}
    </>
  )
}
