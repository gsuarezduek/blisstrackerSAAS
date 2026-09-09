import api from './client'

export const finishWorkday = () => api.post('/workdays/finish').then(r => r.data)
