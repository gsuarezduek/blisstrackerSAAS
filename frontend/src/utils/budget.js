// Horas usadas vs contratadas — la política de "qué consume el presupuesto del
// proyecto", en un solo lugar. Reemplazó las copias que tenían Reportes, la pestaña
// Horas del proyecto y el Resumen, que podían (y llegaron a) divergir entre sí.
//
// Decisión de producto: **el tiempo de los agentes de IA consume presupuesto**. Es
// trabajo que se le informa al cliente como trabajo hecho (ver reportTaskLine en
// components/marketing/ReportViewerParts.jsx), así que también consume sus horas
// contratadas. El desglose persona/agentes se muestra siempre al lado del total
// (components/ui/WorkedTime.jsx) para que el número sea explicable.
//
// Las métricas con las que se evalúa a las PERSONAS (ocupación del Scorecard, benchmark
// del equipo, insight diario, mail semanal) son el caso opuesto y NO usan esto: siguen
// contando solo horas humanas, con el dato de agentes al lado como referencia.

// `totalMinutes`/`taskCount` son de personas y `agentMinutes`/`agentTasks` de agentes
// (convención del backend, ver lib/agentTasks.js). `months` > 1 multiplica el abono
// mensual para rangos de varios meses.
export function deriveBudget({ hoursEnabled, monthlyHours, totalMinutes = 0, agentMinutes = 0, months = 1 }) {
  const useBudget = !!hoursEnabled && monthlyHours != null
  const noBudget  = !!hoursEnabled && monthlyHours == null

  const personMinutes = totalMinutes || 0
  const agentMins     = agentMinutes || 0
  const usedMinutes   = personMinutes + agentMins

  const budgetMins = useBudget ? monthlyHours * 60 * (months || 1) : 0
  const pctRaw = useBudget ? (budgetMins > 0 ? (usedMinutes / budgetMins) * 100 : 0) : null

  let status = 'untracked' // hoursEnabled=false: proyecto fuera del seguimiento de presupuesto
  if (noBudget) status = 'noBudget'
  else if (useBudget) {
    if (usedMinutes === 0) status = 'noActivity'
    else if (pctRaw > 100) status = 'over'
    else if (pctRaw >= 80) status = 'near'
    else status = 'onTrack'
  }

  return {
    useBudget, noBudget, status, pctRaw,
    personMinutes, agentMinutes: agentMins, usedMinutes,
    budgetMins,
    remainingHours: useBudget ? (budgetMins - usedMinutes) / 60 : null,
    hasAgent: agentMins > 0,
  }
}

// Color de la barra/el número según el consumo. Mismos umbrales que `status`.
export function budgetColor(pctRaw) {
  if (pctRaw == null) return 'bg-primary-500'
  return pctRaw > 100 ? 'bg-red-500' : pctRaw >= 80 ? 'bg-amber-400' : 'bg-primary-500'
}
