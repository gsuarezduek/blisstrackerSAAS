import { Bot } from 'lucide-react'
import { Icon } from './Icon'
import { agentName } from '../../hooks/useMyAgents'

// Rótulo de una tarea que ejecuta (o ejecutó) un agente de IA de la persona — las
// listas internas agrupan por persona, así que sin esto parecerían hechas por ella.
// Devuelve null para una tarea humana, así se puede poner sin condicionar.
export default function AgentTag({ task, size = 13 }) {
  if (!task?.isAgentTask) return null
  return (
    <span className="inline-flex items-center gap-1 text-sky-700 dark:text-sky-300" title="La ejecuta un agente de IA de esta persona">
      <Icon as={Bot} size={size} />{task.agent ? agentName(task.agent, task.agentName) : 'Agente'}
    </span>
  )
}
