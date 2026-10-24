import { Bot } from 'lucide-react'
import { Icon } from '../ui/Icon'

const fmtHours = h => (h >= 1 ? `${h}h` : h > 0 ? `${Math.round(h * 60)}m` : '—')

// "Sus agentes": lo que hicieron los agentes de IA de la persona en el período (tareas
// completadas y tiempo registrado, por agente y por proyecto). Va aparte a propósito:
// nada de esto suma a sus horas, tareas, tasa ni asistencia. El tiempo de un agente no
// se compara con el de una persona — la métrica principal son las tareas completadas.
// Compartido entre la tabla de admin (ProductivityTab.jsx) y la vista personal
// (MyProductivity.jsx) — mismo shape de `agents` en ambos casos (computeAgentStats).
export default function AgentsBlock({ agents }) {
  if (!agents?.hasData) return null
  const { current, previous, delta, porAgente, porProyecto } = agents
  const pct = delta.tareasPct
  return (
    <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-2 inline-flex items-center gap-1">
        <Icon as={Bot} size={12} />Sus agentes de IA <span className="normal-case font-normal">· aparte: no suma a sus horas ni a sus tareas</span>
      </p>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="space-y-1">
          <p className="text-2xl font-semibold text-gray-900 dark:text-white tabular-nums">
            {current.completed} <span className="text-sm font-normal text-gray-500 dark:text-gray-400">tarea{current.completed === 1 ? '' : 's'} completada{current.completed === 1 ? '' : 's'}</span>
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {fmtHours(Math.round(current.minutes / 60 * 10) / 10)} registradas
            {' · '}período anterior: {previous.completed}
            {pct != null && pct !== 0 && (
              <span className={pct > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}> ({pct > 0 ? '+' : ''}{Math.round(pct * 100)}%)</span>
            )}
          </p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-1">Por agente</p>
          <ul className="space-y-0.5">
            {porAgente.map(a => (
              <li key={a.agentId ?? 'deleted'} className="flex justify-between text-xs text-gray-700 dark:text-gray-300">
                <span className="truncate">{a.name}</span><span className="tabular-nums text-gray-500">{a.completed}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-1">Por proyecto</p>
          <ul className="space-y-0.5">
            {porProyecto.slice(0, 6).map(p => (
              <li key={p.projectId} className="flex justify-between text-xs text-gray-700 dark:text-gray-300">
                <span className="truncate">{p.name}</span><span className="tabular-nums text-gray-500">{p.completed}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
