// Color determinístico por usuario para cursores/avatares de presencia en el
// editor colaborativo (CollaborativeRichTextEditor). No existe hoy en el repo
// ninguna convención de "color por usuario" (se buscó explícitamente), así que
// se arma una paleta fija + un hash simple sobre el userId — mismo color siempre,
// en cualquier pestaña/sesión de esa persona.
const PALETTE = [
  '#ef4444', '#f97316', '#eab308', '#22c55e', '#10b981',
  '#3b82f6', '#6366f1', '#8b5cf6', '#ec4899', '#f43f5e',
]

export function colorForUser(userId) {
  const str = String(userId ?? '0')
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0
  }
  return PALETTE[hash % PALETTE.length]
}
