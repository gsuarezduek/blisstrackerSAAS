import { useNavigate } from 'react-router-dom'
import useRoles from '../hooks/useRoles'
import useMembers from '../hooks/useMembers'
import { roleColor } from '../utils/roleColor'

// Badge de color con el rol de equipo (teamRole) de una persona.
// Uso:
//   <RoleBadge role={user.role} />        // si el objeto ya trae el teamRole
//   <RoleBadge userId={comment.user.id} /> // si solo hay el id (resuelve vía useMembers)
// No renderiza nada si la persona no tiene teamRole asignado.
// Clickeable por defecto: lleva a la ficha del rol en /docs?tab=roles. Se usa navigate()
// en vez de <Link> (mismo motivo que UserLink) para poder anidarse dentro de botones/cards
// que ya tienen su propio onClick.
export default function RoleBadge({ role, userId, className = '', linkToRole = true }) {
  const { labelFor } = useRoles()
  const { byId } = useMembers()
  const navigate = useNavigate()

  const resolved = role ?? (userId != null ? byId.get(userId)?.role : null)
  if (!resolved) return null

  function go(e) {
    e.stopPropagation()
    e.preventDefault()
    navigate(`/docs?tab=roles&role=${encodeURIComponent(resolved)}`)
  }

  const classes = `text-xs px-2 py-0.5 rounded-full font-medium ${roleColor(resolved)} ${linkToRole ? 'cursor-pointer hover:opacity-75 transition-opacity' : ''} ${className}`

  if (!linkToRole) {
    return <span className={classes}>{labelFor(resolved)}</span>
  }

  return (
    <span
      role="link"
      tabIndex={0}
      onClick={go}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') go(e) }}
      title="Ver ficha del rol"
      className={classes}
    >
      {labelFor(resolved)}
    </span>
  )
}
