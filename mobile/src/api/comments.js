import api from './client'

export const listComments = taskId => api.get(`/tasks/${taskId}/comments`).then(r => r.data)

export const addComment = (taskId, text) =>
  api.post(`/tasks/${taskId}/comments`, { text }).then(r => r.data)
