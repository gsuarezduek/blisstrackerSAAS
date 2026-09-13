// Recordatorio de la sala de voz en la que estaba el usuario, para poder ofrecerle
// reconectar tras un F5 completo (que mata todo el estado de React). `sessionStorage`
// a propósito: por pestaña, no por navegador — cada pestaña puede estar en una llamada
// distinta, y no tiene sentido que una recargada arrastre la sesión de otra.
const key = (userId) => `bliss_voice_call_session_${userId}`
const TTL_MS = 15 * 60 * 1000 // descarta el prompt si la pestaña quedó olvidada horas

export function saveVoiceCallSession(userId, { channelId, channelSlug, channelName }) {
  if (!userId) return
  try {
    sessionStorage.setItem(key(userId), JSON.stringify({ channelId, channelSlug, channelName, savedAt: Date.now() }))
  } catch {
    // ignorar (private browsing / storage lleno)
  }
}

export function getVoiceCallSession(userId) {
  if (!userId) return null
  try {
    const raw = sessionStorage.getItem(key(userId))
    if (!raw) return null
    const data = JSON.parse(raw)
    if (Date.now() - data.savedAt > TTL_MS) return null
    return data
  } catch {
    return null
  }
}

export function clearVoiceCallSession(userId) {
  if (!userId) return
  try {
    sessionStorage.removeItem(key(userId))
  } catch {
    // ignorar
  }
}
