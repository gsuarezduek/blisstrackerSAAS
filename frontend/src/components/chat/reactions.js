// Agrupa las reacciones planas de un mensaje (una fila por persona+emoji) en pills por
// emoji con el conteo y si el usuario actual ya reaccionó con ese emoji — el backend
// manda la lista sin agrupar (MESSAGE_INCLUDE en chat.controller.js).
export function groupReactions(reactions, currentUserId) {
  if (!reactions || reactions.length === 0) return []
  const order = []
  const map = new Map()
  for (const r of reactions) {
    if (!map.has(r.emoji)) {
      map.set(r.emoji, { emoji: r.emoji, count: 0, reacted: false, names: [] })
      order.push(r.emoji)
    }
    const g = map.get(r.emoji)
    g.count++
    g.names.push(r.user?.name || '')
    if (r.userId === currentUserId) g.reacted = true
  }
  return order.map(e => map.get(e))
}
