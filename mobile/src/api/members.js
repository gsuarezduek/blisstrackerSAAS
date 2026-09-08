import api from './client'

// Miembros del workspace (para el autocomplete de @menciones en comentarios —
// cualquiera puede ser mencionado, sea o no del equipo del proyecto, mismo
// criterio que la web). El endpoint no filtra inactivos, se filtra acá.
export const listMembers = () =>
  api.get('/workspaces/current/members').then(r => r.data.filter(m => m.active))
