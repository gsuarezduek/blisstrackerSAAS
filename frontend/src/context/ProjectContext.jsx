import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import { useWorkspace } from './WorkspaceContext'

// El proyecto en el que venís trabajando, para no tener que volver a elegirlo en cada
// sección. Entrar a la ficha de un proyecto lo fija; Marketing y Contenido lo adoptan
// cuando la URL no trae un `?projectId=` propio.
//
// POR QUÉ `sessionStorage` Y NO `localStorage`: el riesgo de esta feature es abrir
// Marketing la semana que viene y ver datos filtrados por un proyecto que elegiste hace
// días sin acordarte. Con `sessionStorage` eso es imposible: el estado muere con la
// pestaña y una pestaña nueva arranca limpia. El TTL cubre el otro caso, la pestaña que
// queda abierta tres días. `localStorage` sería exactamente el bug que queremos evitar.
//
// La clave lleva el slug del workspace como cinturón: `switchWorkspace` hace un
// `location.assign` a otro subdominio, o sea otro origen, así que entre workspaces no
// podría filtrarse igual.
//
// NO reemplaza al evento `bliss:project-context` que emite ProjectDetail: ese significa
// "estoy mirando este proyecto AHORA" y lo usa GlobalShortcuts para precargar el modal
// de nueva tarea. Este contexto significa "este es el proyecto en el que vengo
// trabajando" y sobrevive a salir de la ficha. Si se unificaran, crear una tarea desde
// el Dashboard la asociaría a un proyecto del que ya te fuiste.

const TTL_MS = 8 * 60 * 60 * 1000
const keyFor = slug => `bliss_active_project_${slug || 'none'}`

const ProjectContext = createContext({
  activeProject: null,
  setActiveProject: () => {},
  clearActiveProject: () => {},
})

function read(slug) {
  try {
    const raw = sessionStorage.getItem(keyFor(slug))
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed?.project?.id || Date.now() - (parsed.at ?? 0) > TTL_MS) return null
    return parsed.project
  } catch { return null }
}

function write(slug, project) {
  try {
    if (project) sessionStorage.setItem(keyFor(slug), JSON.stringify({ at: Date.now(), project }))
    else sessionStorage.removeItem(keyFor(slug))
  } catch { /* modo privado */ }
}

/** Solo lo que hace falta para decidir si este proyecto aplica a una sección. */
function shape(p) {
  if (!p?.id) return null
  return {
    id: p.id,
    name: p.name,
    // Un proyecto puede tener Marketing o Contenido apagado (ver "Secciones por
    // proyecto" en CLAUDE.md): el proyecto fijado no debe propagarse a una sección
    // donde esa cuenta no existe.
    marketingEnabled: p.marketingEnabled !== false,
    contenidoEnabled: p.contenidoEnabled !== false,
  }
}

export function ProjectProvider({ children }) {
  const { slug } = useWorkspace()
  const [activeProject, setActive] = useState(() => read(slug))

  // Al resolverse el workspace (o al cambiar), se lee lo guardado para ese slug.
  useEffect(() => { setActive(read(slug)) }, [slug])

  const setActiveProject = useCallback(project => {
    const next = shape(project)
    if (!next) return
    setActive(prev => (prev?.id === next.id ? prev : next))
    write(slug, next)
  }, [slug])

  const clearActiveProject = useCallback(() => {
    setActive(null)
    write(slug, null)
  }, [slug])

  return (
    <ProjectContext.Provider value={{ activeProject, setActiveProject, clearActiveProject }}>
      {children}
    </ProjectContext.Provider>
  )
}

export function useActiveProject() {
  return useContext(ProjectContext)
}

/** Borra el proyecto fijado de TODOS los workspaces — para el logout. */
export function clearAllActiveProjects() {
  try {
    const keys = []
    for (let i = 0; i < sessionStorage.length; i += 1) {
      const k = sessionStorage.key(i)
      if (k?.startsWith('bliss_active_project_')) keys.push(k)
    }
    keys.forEach(k => sessionStorage.removeItem(k))
  } catch { /* modo privado */ }
}
