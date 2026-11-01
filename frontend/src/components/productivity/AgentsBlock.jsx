import { Bot } from 'lucide-react'
import { Icon } from '../ui/Icon'
import { fmtHours, fmtMins } from '../../utils/format'

// "Sus agentes": lo que hicieron los agentes de IA de la persona en el período (tareas
// completadas y tiempo registrado, por agente y por proyecto). El tiempo de un agente ES
// tiempo trabajado — se le informa al cliente y consume las horas contratadas del
// proyecto —, pero NO entra en las métricas con las que se evalúa a la persona (sus
// horas, su tasa, su Δ horas, su asistencia): por eso se muestra en su propio bloque.
// Compartido entre la tabla de admin (ProductivityTab.jsx) y la vista personal
// (MyProductivity.jsx) — mismo shape de `agents` en ambos casos (computeAgentStats).
export default function AgentsBlock({ agents }) {
  if (!agents?.hasData) return null
  const { current, previous, delta, porAgente, porProyecto } = agents
  const pct = delta.tareasPct
  return (
    <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-2 inline-flex items-center gap-1">
        <Icon as={Bot} size={12} />Sus agentes de IA <span className="normal-case font-normal">· su tiempo suma a las horas del proyecto, no a las métricas de la persona</span>
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
                <span className="truncate">{a.name}</span>
                <span className="tabular-nums text-gray-500 shrink-0">{a.completed} · {fmtMins(a.minutes)}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-1">Por proyecto</p>
          <ul className="space-y-0.5">
            {porProyecto.slice(0, 6).map(p => (
              <li key={p.projectId} className="flex justify-between text-xs text-gray-700 dark:text-gray-300">
                <span className="truncate">{p.name}</span>
                <span className="tabular-nums text-gray-500 shrink-0">{p.completed} · {fmtMins(p.minutes)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
