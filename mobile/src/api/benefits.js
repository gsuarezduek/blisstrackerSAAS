import api from './client'

export const getMyBenefits = () => api.get('/benefits/my').then(r => r.data)

export const createBenefitRequest = ({ bank, amount, date, reason }) =>
  api.post('/benefits/my/request', { bank, amount, date, reason }).then(r => r.data)
