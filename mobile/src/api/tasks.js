import api from './client'

export const getToday = () => api.get('/workdays/today').then(r => r.data)

export const createTask = ({ description, projectId }) =>
  api.post('/tasks', { description, projectId }).then(r => r.data)

export const startTask    = id => api.patch(`/tasks/${id}/start`).then(r => r.data)
export const pauseTask    = id => api.patch(`/tasks/${id}/pause`).then(r => r.data)
export const resumeTask   = id => api.patch(`/tasks/${id}/resume`).then(r => r.data)
export const completeTask = id => api.patch(`/tasks/${id}/complete`).then(r => r.data)
export const unblockTask  = id => api.patch(`/tasks/${id}/unblock`).then(r => r.data)
export const starTask     = id => api.patch(`/tasks/${id}/star`).then(r => r.data)

// Backlog + tareas futuras (ver mobile/CLAUDE.md → "Backlog y tareas futuras")
export const addToToday   = id => api.patch(`/tasks/${id}/add-to-today`).then(r => r.data)
export const bringToToday = id => api.patch(`/tasks/${id}/bring-to-today`).then(r => r.data)
export const moveToBacklog = id => api.patch(`/tasks/${id}/move-to-backlog`).then(r => r.data)

export const blockTask = (id, reason) =>
  api.patch(`/tasks/${id}/block`, { reason }).then(r => r.data)
