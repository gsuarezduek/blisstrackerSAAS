// Color estable por nombre de rol de equipo (teamRole).
// Unifica las copias que vivían en RealTime.jsx, TeamTab.jsx y ProjectDetail.jsx.

export const ROLE_COLORS = [
  'bg-purple-100 text-purple-700',
  'bg-pink-100 text-pink-700',
  'bg-yellow-100 text-yellow-700',
  'bg-blue-100 text-blue-700',
  'bg-cyan-100 text-cyan-700',
  'bg-green-100 text-green-700',
  'bg-orange-100 text-orange-700',
  'bg-rose-100 text-rose-700',
]

// Hash determinístico → mismo rol siempre obtiene el mismo color en toda la app.
export function roleColor(name) {
  let hash = 0
  for (const c of (name || '')) hash = (hash * 31 + c.charCodeAt(0)) & 0xffff
  return ROLE_COLORS[hash % ROLE_COLORS.length]
}
