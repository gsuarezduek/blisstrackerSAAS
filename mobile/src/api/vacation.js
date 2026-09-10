import api from './client'

export const getMyVacation = () => api.get('/vacation/my').then(r => r.data)

export const createVacationRequest = ({ startDate, endDate, type, observation }) =>
  api.post('/vacation/my/request', { startDate, endDate, type, observation }).then(r => r.data)
