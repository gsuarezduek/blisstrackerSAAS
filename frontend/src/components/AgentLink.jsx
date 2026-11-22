import { useNavigate } from 'react-router-dom'

/**
 * Espejo de UserLink para un agente de IA: envuelve su avatar y/o su nombre y navega a
 * su ficha (/agentes/:id). Misma mecánica y por el mismo motivo — navigate() en vez de
 * <Link> para poder anidarse dentro de cards, modales o <button>, donde un <a> sería
 * HTML inválido, y stopPropagation para no disparar el handler del contenedor.
 *
 * Uso: <AgentLink agentId={a.id}>...</AgentLink>
 */
export default function AgentLink({ agentId, children, className = '', title = 'Ver el agente', as = 'span', ...rest }) {
  const navigate = useNavigate()
  if (!agentId) return <>{children}</>

  const Tag = as
  function go(e) {
    e.stopPropagation()
    e.preventDefault()
    navigate(`/agentes/${agentId}`)
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
