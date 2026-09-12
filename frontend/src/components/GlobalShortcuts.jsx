import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { isWorkspaceSubdomain } from '../utils/domain'
import AddTaskModal from './AddTaskModal'
import CommandPalette from './CommandPalette'

// Catálogo de atajos — alimenta el overlay de ayuda (tecla "?"). Se sacaron los
// atajos de navegación (Shift + D/Y/A/M/R) y las acciones de tarea con Shift
// (I/C/P/B, que vivían en Dashboard.jsx): en la práctica no se usaban. Se
// mantiene únicamente el de crear tarea.
const SHORTCUT_GROUPS = [
  { title: 'Tareas', items: [
    { keys: ['N'], desc: 'Nueva tarea (desde cualquier página; si estás en un proyecto, queda asociada a ese proyecto)' },
  ]},
  { title: 'General', items: [
    { keys: ['Ctrl/Cmd', 'K'], desc: 'Buscador global — ir a cualquier pantalla o buscar un lead' },
    { keys: ['Ctrl/Cmd', 'B'], desc: 'Abrir / cerrar la pizarra de notas' },
    { keys: ['?'],             desc: 'Mostrar / ocultar esta ayuda' },
    { keys: ['Esc'],           desc: 'Cerrar la ventana actual' },
  ]},
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
  const [taskOpen, setTaskOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [toast, setToast] = useState('')
  // Proyecto actual, publicado por ProjectDetail vía evento (null fuera de un proyecto).
  // Si hay uno, la tarea creada desde el atajo/botón flotante queda asociada a él.
  const [projectContext, setProjectContext] = useState(null)

  // Solo activo para usuarios autenticados dentro de un workspace (no en landing/login).
  const enabled = !!user && isWorkspaceSubdomain()

  useEffect(() => {
    if (!enabled) return
    function onProjectContext(e) { setProjectContext(e.detail || null) }
    window.addEventListener('bliss:project-context', onProjectContext)
    return () => window.removeEventListener('bliss:project-context', onProjectContext)
  }, [enabled])

  // Disparado por FloatingDock (frontend/src/components/FloatingDock.jsx) — mismo
  // mecanismo que ya usan Chat/Gamification (`bliss:open-chat`/`bliss:open-game`)
  // para que el dock abra el modal de tarea sin necesitar su propio botón.
  useEffect(() => {
    if (!enabled) return
    function onOpenAddTask() { setTaskOpen(true) }
    window.addEventListener('bliss:open-add-task', onOpenAddTask)
    return () => window.removeEventListener('bliss:open-add-task', onOpenAddTask)
  }, [enabled])

  useEffect(() => {
    if (!enabled) return

    function onKey(e) {
      // Cmd/Ctrl+K abre el buscador global — a diferencia del resto de los atajos,
      // debe andar incluso con el foco en un input (estándar de estos paletteS).
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen(v => !v)
        return
      }

      // Escape cierra nuestras ventanas, incluso si el foco está dentro del modal.
      if (e.key === 'Escape') {
        if (paletteOpen) { setPaletteOpen(false); return }
        if (helpOpen) { setHelpOpen(false); return }
        if (taskOpen) { setTaskOpen(false); return }
        return
      }

      // Dejamos Ctrl/Cmd/Alt al navegador/SO.
      if (e.ctrlKey || e.metaKey || e.altKey) return
      // No interferir mientras se escribe.
      if (isTypingTarget(e.target)) return

      // Ayuda con "?" (Shift + /)
      if (e.key === '?') { e.preventDefault(); setHelpOpen(v => !v); return }

      const lower = e.key.toLowerCase()

      // Shift + tecla ya no dispara nada acá (ver comentario en SHORTCUT_GROUPS).
      if (e.shiftKey) return

      // Atajos de una sola tecla (sin Shift).
      if (taskOpen || helpOpen || paletteOpen) return
      if (lower === 'n') { e.preventDefault(); setTaskOpen(true) }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [enabled, taskOpen, helpOpen, paletteOpen])

  function handleAdd(task) {
    // Avisamos a la página activa (ej. Dashboard) para que refresque su lista.
    window.dispatchEvent(new CustomEvent('bliss:task-created', { detail: task }))
    setToast('Tarea creada ✓')
    setTimeout(() => setToast(''), 2500)
  }

  if (!enabled) return null

  return (
    <>
      {/* Botón "Nueva tarea" propio removido — ahora se abre desde FloatingDock
          (frontend/src/components/FloatingDock.jsx) vía el evento `bliss:open-add-task`,
          o con la tecla N. Si estamos dentro de un proyecto, la tarea queda asociada a él. */}
      {taskOpen && (
        <AddTaskModal defaultProject={projectContext} onAdd={handleAdd} onClose={() => setTaskOpen(false)} />
      )}

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />

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
            <div className="space-y-4">
              {SHORTCUT_GROUPS.map(group => (
                <div key={group.title}>
                  <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2">{group.title}</p>
                  <ul className="space-y-2.5">
                    {group.items.map(s => (
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
                </div>
              ))}
            </div>
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
