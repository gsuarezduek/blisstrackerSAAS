import { Bot } from 'lucide-react'
import { Icon } from './Icon'
import { agentName } from '../../hooks/useMyAgents'
import { agentTextClass } from '../../utils/agentColor'

// Rótulo de una tarea que ejecuta (o ejecutó) un agente de IA — las listas internas
// agrupan por persona, así que sin esto parecerían hechas por ella.
//
// Es el ÚNICO rótulo de agente de la app. Antes había cinco copias a mano (acá, en el
// TaskLine del Resumen del proyecto, en el panel de Agentes del Dashboard, en la franja
// "trabajando ahora" y en el modal de desbloqueo), cada una con su tamaño, su color y su
// fallback: la misma tarea se llamaba "Agente", "su agente" o "Cualquiera de mis
// agentes" según dónde la miraras.
//
// Lo que sí cambia según el contexto es el `fallback` — el texto cuando la tarea está
// delegada a "cualquiera de mis agentes" y todavía no la tomó ninguno. Esa diferencia es
// intencional y por eso es un prop, no otra copia del componente.
//
// El color sale del agente (utils/agentColor.js), así que dos agentes del mismo dueño se
// distinguen de un vistazo. Sin agente identificado cae al sky de siempre.
export default function AgentTag({ task, size = 13, fallback = 'Agente', withIcon = true, className = '' }) {
  if (!task?.isAgentTask) return null
  const agent = task.agent
  const color = agent ? agentTextClass(agent) : 'text-sky-700 dark:text-sky-300'
  return (
    <span
      className={`inline-flex items-center gap-1 ${color} ${className}`}
      title="La ejecuta un agente de IA de esta persona"
    >
      {withIcon && <Icon as={Bot} size={size} />}
      {agent ? agentName(agent, task.agentName) : fallback}
    </span>
  )
}
