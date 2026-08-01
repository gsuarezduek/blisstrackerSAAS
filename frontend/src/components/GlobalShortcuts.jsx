import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useFeatureFlag } from '../hooks/useFeatureFlag'
import { isWorkspaceSubdomain } from '../utils/domain'
import AddTaskModal from './AddTaskModal'

// Catálogo de atajos — alimenta el overlay de ayuda (tecla "?").
// Todas las teclas son combinaciones (Shift + X); por eso `chord` no se usa acá.
const SHORTCUT_GROUPS = [
  { title: 'Navegación', items: [
    { keys: ['Shift', 'D'], desc: 'Ir al Dashboard' },
    { keys: ['Shift', 'Y'], desc: 'Ir a Mis Proyectos' },
    { keys: ['Shift', 'A'], desc: 'Ir a Actividad (tiempo real)' },
    { keys: ['Shift', 'M'], desc: 'Ir a Marketing' },
    { keys: ['Shift', 'R'], desc: 'Ir a Reportes' },
  ]},
  { title: 'Tareas', items: [
    { keys: ['N'],          desc: 'Nueva tarea (desde cualquier página; si estás en un proyecto, queda asociada a ese proyecto)' },
    { keys: ['Shift', 'I'], desc: 'Iniciar la primera tarea (si no hay ninguna en curso)' },
    { keys: ['Shift', 'C'], desc: 'Completar la tarea en curso' },
    { keys: ['Shift', 'P'], desc: 'Pausar la tarea en curso' },
    { keys: ['Shift', 'B'], desc: 'Bloquear la tarea en curso' },
  ]},
  { title: 'General', items: [
    { keys: ['Ctrl/Cmd', 'B'], desc: 'Abrir / cerrar la pizarra de notas' },
    { keys: ['?'],             desc: 'Mostrar / ocultar esta ayuda' },
    { keys: ['Esc'],           desc: 'Cerrar la ventana actual' },
  ]},
]

// Destino de navegación para "Shift + X". Reportes depende del rol; Marketing
// depende del feature flag (igual que el link del Navbar, que no aparece si está
// deshabilitado — el atajo no debería mandar a una página bloqueada).
function navDest(key, isAdmin, marketingEnabled) {
  switch (key) {
    case 'd': return '/'
    case 'y': return '/my-projects'
    case 'a': return '/realtime'
    case 'm': return marketingEnabled ? '/marketing' : null
    case 'r': return isAdmin ? '/reports' : '/my-reports'
    default:  return null
  }
}

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
  // Proyecto actual, publicado por ProjectDetail vía evento (null fuera de un proyecto).
  // Si hay uno, la tarea creada desde el atajo/botón flotante queda asociada a él.
  const [projectContext, setProjectContext] = useState(null)

  // Solo activo para usuarios autenticados dentro de un workspace (no en landing/login).
  const enabled = !!user && isWorkspaceSubdomain()
  const { enabled: marketingEnabled } = useFeatureFlag('marketing')

  useEffect(() => {
    if (!enabled) return
    function onProjectContext(e) { setProjectContext(e.detail || null) }
    window.addEventListener('bliss:project-context', onProjectContext)
    return () => window.removeEventListener('bliss:project-context', onProjectContext)
  }, [enabled])

  useEffect(() => {
    if (!enabled) return

    function onKey(e) {
      // Escape cierra nuestras ventanas, incluso si el foco está dentro del modal.
      if (e.key === 'Escape') {
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

      // Navegación con Shift + tecla. Las teclas de tarea (C/P/B/I) no están en el
      // mapa de navegación, así que acá se ignoran y las maneja el Dashboard.
      if (e.shiftKey) {
        const dest = navDest(lower, !!user?.isAdmin, marketingEnabled)
        if (dest) { e.preventDefault(); navigate(dest) }
        return
      }

      // Atajos de una sola tecla (sin Shift).
      if (taskOpen || helpOpen) return
      if (lower === 'n') { e.preventDefault(); setTaskOpen(true) }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [enabled, navigate, taskOpen, helpOpen, user, marketingEnabled])

  function handleAdd(task) {
    // Avisamos a la página activa (ej. Dashboard) para que refresque su lista.
    window.dispatchEvent(new CustomEvent('bliss:task-created', { detail: task }))
    setToast('Tarea creada ✓')
    setTimeout(() => setToast(''), 2500)
  }

  if (!enabled) return null

  return (
    <>
      {/* Botón flotante para crear tareas desde cualquier página — primero en la pila
          (abajo), luego Feedback y Gamification. Si estamos dentro de un proyecto, la
          tarea queda asociada a él. */}
      <button
        onClick={() => setTaskOpen(true)}
        title={projectContext ? `Nueva tarea en ${projectContext.name}` : 'Nueva tarea'}
        className="fixed bottom-6 right-6 z-40 bg-primary-600 hover:bg-primary-700 text-white rounded-full w-12 h-12 flex items-center justify-center shadow-lg transition-all hover:scale-110"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-6 h-6">
          <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" />
        </svg>
      </button>

      {taskOpen && (
        <AddTaskModal lockedProject={projectContext} onAdd={handleAdd} onClose={() => setTaskOpen(false)} />
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
