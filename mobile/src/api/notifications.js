import api from './client'

export const listNotifications = () => api.get('/notifications').then(r => r.data)

export const markAllRead = () => api.post('/notifications/read-all')
