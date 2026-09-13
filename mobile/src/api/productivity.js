import api from './client'

export const getMyProductivity = () => api.get('/reports/mine/productivity').then(r => r.data)

export const getMyHoursHistory = back =>
  api.get('/reports/mine/hours-history', { params: { back } }).then(r => r.data)
