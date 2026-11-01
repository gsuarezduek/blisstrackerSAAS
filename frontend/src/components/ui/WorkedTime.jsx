import { Bot } from 'lucide-react'
import { Icon } from './Icon'
import { fmtMins, workedSplit } from '../../utils/format'

// Tiempo trabajado en las vistas INTERNAS: el total protagonista y, debajo o al lado, el
// desglose persona / agentes de IA. El tiempo de un agente es tiempo trabajado (se le
// informa al cliente y consume horas contratadas, ver utils/budget.js), pero el equipo
// siempre tiene que poder ver cuánto puso cada uno.
//
// Sin tiempo de agentes (el caso de cualquier workspace que no los usa) renderiza solo el
// número de la persona, igual que antes de que esto existiera.
//
//   variant="hero"   → número grande (tarjetas, encabezados)
//   variant="row"    → tamaño de texto normal, desglose en línea (filas de tabla/lista)
//   variant="inline" → todo en una línea, para meterlo en un párrafo
export default function WorkedTime({
  person, agent, label = null, variant = 'row', className = '', fmt = fmtMins,
}) {
  const { total, agent: agentMins, hasAgent } = workedSplit(person, agent)

  const totalEl = (
    <>
      <span className="tabular-nums">{fmt(total)}</span>
      {label && <span className="font-normal text-gray-500 dark:text-gray-400"> {label}</span>}
    </>
  )

  if (!hasAgent) {
    return variant === 'hero'
      ? <p className={`text-2xl font-bold text-gray-900 dark:text-white ${className}`}>{totalEl}</p>
      : <span className={className}>{totalEl}</span>
  }

  // Cada pieza en su propia línea a propósito: JSX colapsa el salto de línea, así el
  // texto sale con un solo espacio ("personas 6h 10m · agentes 3h 30m").
  const breakdown = (
    <>
      personas <span className="tabular-nums">{fmt(person || 0)}</span>
      {' · '}
      <Icon as={Bot} size={11} className="inline-block align-[-1px]" />
      agentes <span className="tabular-nums">{fmt(agentMins)}</span>
    </>
  )

  if (variant === 'inline') {
    return (
      <span className={className}>
        {totalEl}
        <span className="text-gray-500 dark:text-gray-400"> ({breakdown})</span>
      </span>
    )
  }

  return (
    <span className={className}>
      <span className={variant === 'hero' ? 'block text-2xl font-bold text-gray-900 dark:text-white' : 'block'}>
        {totalEl}
      </span>
      <span
        className="block text-xs text-gray-500 dark:text-gray-400"
        title="El tiempo de los agentes de IA cuenta como trabajo del proyecto y consume las horas contratadas. Las métricas de la persona siguen midiendo solo sus horas."
      >
        {breakdown}
      </span>
    </span>
  )
}
