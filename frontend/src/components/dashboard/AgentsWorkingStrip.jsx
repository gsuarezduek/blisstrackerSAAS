import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Bot } from 'lucide-react'
import { Icon } from '../ui/Icon'
import { activeSeconds, fmtDuration } from '../../utils/format'
import { agentName } from '../../hooks/useMyAgents'

// Franja "Tus agentes trabajando ahora", debajo de la tarjeta "Ahora": las tareas que
// tus agentes de IA tienen EN CURSO, con agente, tarea, proyecto y cronómetro en vivo.
// Mismo rol que NowCard pero compacta (una línea por tarea) y en azul, para que se lea
// como "lo que pasa en paralelo" y no compita con la tarea propia. Puede haber varias:
// un agente no tiene el límite de una tarea en curso.

function Timer({ task }) {
  const [, tick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => tick(n => n + 1), 1000)
    return () => clearInterval(t)
  }, [])
  return <span className="tabular-nums">{fmtDuration(activeSeconds(task))}</span>
}

export default function AgentsWorkingStrip({ tasks, onOpenComments, onSeeAll }) {
  const running = tasks.filter(t => t.status === 'IN_PROGRESS')
  if (running.length === 0) return null

  return (
    <section className="rounded-2xl border border-sky-200 dark:border-sky-900 bg-sky-50/70 dark:bg-sky-950/30 overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-4 pt-3 pb-1.5">
        <h2 className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-sky-700 dark:text-sky-300">
          <span className="relative flex w-2 h-2">
            <span className="absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75 animate-ping" />
            <span className="relative inline-flex rounded-full w-2 h-2 bg-sky-500" />
          </span>
          Tus agentes trabajando ahora · {running.length}
        </h2>
        {onSeeAll && (
          <button type="button" onClick={onSeeAll} className="text-xs font-medium text-sky-700 dark:text-sky-300 hover:underline">
            Ver todo →
          </button>
        )}
      </div>
      <ul className="divide-y divide-sky-100 dark:divide-sky-900/60">
        {running.map(t => (
          <li key={t.id} className="flex items-center gap-3 px-4 py-2">
            <Icon as={Bot} size={16} className="flex-shrink-0 text-sky-600 dark:text-sky-400" />
            <span className="hidden sm:inline text-xs font-semibold text-sky-800 dark:text-sky-200 flex-shrink-0 max-w-[8rem] truncate">
              {t.agent ? agentName(t.agent, t.agentName) : 'Agente'}
            </span>
            <button
              type="button"
              onClick={() => onOpenComments?.(t)}
              title={t.description}
              className="flex-1 min-w-0 text-left text-sm text-gray-800 dark:text-gray-100 truncate hover:text-sky-700 dark:hover:text-sky-300"
            >
              {t.description}
            </button>
            <Link to={`/my-projects/${t.project.id}`} className="hidden md:inline text-xs text-gray-500 dark:text-gray-400 hover:text-sky-700 dark:hover:text-sky-300 flex-shrink-0 max-w-[9rem] truncate">
              {t.project.name}
            </Link>
            <span className="text-xs font-medium text-sky-700 dark:text-sky-300 flex-shrink-0">
              <Timer task={t} />
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
