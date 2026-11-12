// Formato y reglas de presentación de un juego de Gamification. Puros, los comparten
// el panel flotante (GamificationFab.jsx) y la página /juegos (pages/Juegos.jsx).

const API_URL = import.meta.env.VITE_API_URL || ''

// La descripción del juego puede ser HTML (RichTextEditor) o texto plano (legacy).
export const looksLikeHtml = (s) => /<[a-z][\s\S]*>/i.test(s || '')

export function gameImageUrl(game) {
  return `${API_URL}/api/gamification/games/${game.id}/image?v=${encodeURIComponent(game.updatedAt || '')}`
}


export function formatScore(n, isVote, metricMeta) {
  if (n == null) return ''
  if (isVote) return `${n} ${n === 1 ? 'voto' : 'votos'}`
  if (metricMeta) {
    if (metricMeta.growth) return n > 0 ? `+${n}` : String(n) // delta (seguidores)
    if (metricMeta.unit === '%') return `${n}%`
    if (metricMeta.unit === '$') return `$${n}`
  }
  return String(n)
}

// ¿El juego tiene una acción pendiente del usuario? (votar / responder el quiz)
export function actionPending(g, userId) {
  if (g.finished) return false
  if (g.scoring === 'vote') return !g.myVote
  if (g.scoring === 'quiz') return !g.mySubmission && (g.questionCount || 0) > 0
  return false
}

// startDate/endDate se guardan como fecha-solo (medianoche UTC representando un día
// calendario). Se formatea en UTC para mostrar ese mismo día — sin timeZone: 'UTC' el
// navegador lo convierte a su huso local (ART, UTC-3) y muestra el día anterior.
export function fmtDate(d) {
  if (!d) return ''
  try { return new Date(d).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', timeZone: 'UTC' }) } catch { return '' }
}

// Cuenta regresiva hasta el cierre. endDate es fecha (medianoche UTC) y se considera
// inclusive hasta el final de ese día — igual que el motor de visibilidad del backend.
export function countdown(endDate) {
  const closeMs = new Date(endDate).getTime() + 24 * 60 * 60 * 1000
  const ms = closeMs - Date.now()
  if (ms <= 0) return 'Cierra hoy'
  const days = Math.floor(ms / 86400000)
  if (days >= 1) return `Quedan ${days} día${days === 1 ? '' : 's'}`
  const hours = Math.floor(ms / 3600000)
  if (hours >= 1) return `Quedan ${hours} h`
  const mins = Math.max(1, Math.floor(ms / 60000))
  return `Quedan ${mins} min`
}
