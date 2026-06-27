import { useNavigate } from 'react-router-dom'

/**
 * Envuelve contenido (avatar y/o nombre de una persona) y navega a su perfil
 * público (/users/:id) al hacer click. Usa navigate() en vez de <Link> para
 * poder anidarse dentro de cards/modals que ya tienen su propio onClick o que
 * son <button> (donde un <a> sería HTML inválido). Frena la propagación para no
 * disparar el handler del contenedor.
 *
 * Uso: <UserLink userId={u.id}>...</UserLink>
 */
export default function UserLink({ userId, children, className = '', title = 'Ver perfil', as = 'span', ...rest }) {
  const navigate = useNavigate()
  if (!userId) return <>{children}</>

  const Tag = as
  function go(e) {
    e.stopPropagation()
    e.preventDefault()
    navigate(`/users/${userId}`)
  }

  return (
    <Tag
      role="link"
      tabIndex={0}
      onClick={go}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') go(e) }}
      title={title}
      className={`cursor-pointer ${className}`}
      {...rest}
    >
      {children}
    </Tag>
  )
}
