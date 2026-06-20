import useRoles from '../hooks/useRoles'
import useMembers from '../hooks/useMembers'
import { roleColor } from '../utils/roleColor'

// Badge de color con el rol de equipo (teamRole) de una persona.
// Uso:
//   <RoleBadge role={user.role} />        // si el objeto ya trae el teamRole
//   <RoleBadge userId={comment.user.id} /> // si solo hay el id (resuelve vía useMembers)
// No renderiza nada si la persona no tiene teamRole asignado.
export default function RoleBadge({ role, userId, className = '' }) {
  const { labelFor } = useRoles()
  const { byId } = useMembers()

  const resolved = role ?? (userId != null ? byId.get(userId)?.role : null)
  if (!resolved) return null

  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${roleColor(resolved)} ${className}`}>
      {labelFor(resolved)}
    </span>
  )
}
