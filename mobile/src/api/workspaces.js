import api from './client'

// GET /api/workspaces/mine — solo requiere auth (no X-Workspace), devuelve
// todos los workspaces activos del usuario actual, sin token (el token de
// cada uno se pide recién al elegir, vía AuthContext.switchWorkspace).
export const listMyWorkspaces = () => api.get('/workspaces/mine').then(r => r.data)
