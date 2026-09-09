import api from './client'

// Todos los proyectos activos del workspace (cualquier miembro puede crear
// tareas en cualquiera — ver "Project access model" en el CLAUDE.md raíz).
// Cada proyecto trae members[] (para separar "míos" de "otros" en el
// cliente) y starred (preferencia personal del usuario actual).
export const listProjects = () => api.get('/projects').then(r => r.data)

export const toggleProjectStar = id => api.patch(`/projects/${id}/star`).then(r => r.data)

// Endpoint "todo en uno" del detalle: info del proyecto (situación, links,
// miembros, chatChannel) + tareas activas agrupadas por persona. Un solo
// request cubre casi toda la pantalla de detalle.
export const getProjectDetail = id => api.get(`/projects/${id}/tasks`).then(r => r.data)

export const getProjectCompleted = (id, skip = 0) =>
  api.get(`/projects/${id}/completed?skip=${skip}`).then(r => r.data)
