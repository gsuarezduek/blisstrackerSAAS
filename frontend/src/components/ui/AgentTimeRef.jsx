import { Bot } from 'lucide-react'
import { Icon } from './Icon'
import { fmtMins } from '../../utils/format'

// La referencia al tiempo de los agentes en las vistas donde la MÉTRICA es humana a
// propósito: ocupación y Δ horas del Scorecard de EOS, benchmark del equipo, insight
// diario, mail semanal, digest de Productividad. Ahí el tiempo de agente no se suma —
// si lo hiciera, "ocupación 120%" podría ser trabajo de un bot — pero el dato igual
// tiene que estar a la vista, al lado del número de la persona.
//
// Un solo lugar para este copy, así no vuelve a divergir entre vistas.
export default function AgentTimeRef({ minutes, tasks = null, owner = 'sus', className = '' }) {
  if (!minutes) return null
  return (
    <p className={`text-xs text-gray-500 dark:text-gray-400 inline-flex items-center gap-1 ${className}`}>
      <Icon as={Bot} size={11} />
      +{fmtMins(minutes)} de {owner} agentes
      {tasks != null && ` en ${tasks} tarea${tasks === 1 ? '' : 's'}`}
      <span className="text-gray-400 dark:text-gray-500">· no suma a esta métrica</span>
    </p>
  )
}
