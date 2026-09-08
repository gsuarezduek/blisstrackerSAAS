import api from './client'

// Todos los proyectos activos del workspace (cualquier miembro puede crear
// tareas en cualquiera — ver "Project access model" en el CLAUDE.md raíz).
export const listProjects = () => api.get('/projects').then(r => r.data)
