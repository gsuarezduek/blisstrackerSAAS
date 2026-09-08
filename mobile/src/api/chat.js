import api from './client'

export const listChannels = () => api.get('/chat/channels').then(r => r.data)

export const listMessages = channelId =>
  api.get(`/chat/channels/${channelId}/messages`).then(r => r.data)

export const sendMessage = (channelId, content) =>
  api.post(`/chat/channels/${channelId}/messages`, { content }).then(r => r.data)

export const markChannelRead = channelId =>
  api.post(`/chat/channels/${channelId}/read`)
