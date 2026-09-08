import api from './client'

export const registerDevice = (token, platform) =>
  api.post('/devices/register', { token, platform })

export const unregisterDevice = token =>
  api.delete('/devices/register', { data: { token } })
