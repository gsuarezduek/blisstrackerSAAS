import { Bot } from 'lucide-react'
import { Icon } from './Icon'
import { agentChipClass } from '../../utils/agentColor'

// La "cara" de un agente de IA: el glifo Bot sobre su color.
//
// A propósito NO es un avatar de persona. Un agente tiene que poder ponerse al lado de
// una persona en el equipo, en el equipo de un proyecto o en Actividad sin que haya que
// leer el nombre para saber cuál es cuál — el color distingue un agente de otro, el
// glifo lo distingue de una persona.
//
// Tamaños espejados de Avatar (pages/project-detail/ui.jsx): xs / sm / md, más lg para
// el encabezado de la ficha.
const SIZES = {
  xs: { box: 'w-6 h-6',   icon: 13 },
  sm: { box: 'w-7 h-7',   icon: 15 },
  md: { box: 'w-9 h-9',   icon: 19 },
  lg: { box: 'w-24 h-24', icon: 48 },
}

export default function AgentAvatar({ agent, size = 'sm', className = '', title }) {
  const s = SIZES[size] ?? SIZES.sm
  return (
    <span
      className={`${s.box} ${agentChipClass(agent)} rounded-full inline-flex items-center justify-center shrink-0 ${className}`}
      title={title ?? (agent?.label || 'Agente de IA')}
    >
      <Icon as={Bot} size={s.icon} />
    </span>
  )
}
