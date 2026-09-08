// Resuelve, para cada mes pedido, las horas contratadas vigentes ESE mes a
// partir del historial de `ProjectMonthlyHoursLog` (carry-forward: el último
// log cuyo effectiveFrom <= month). Sin ningún log aplicable → null (sin dato).

function resolveMonthlyHoursByMonth(logs, monthKeys) {
  const sorted = [...logs].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom))
  const result = {}
  for (const month of monthKeys) {
    let value = null
    for (const log of sorted) {
      if (log.effectiveFrom <= month) value = log.monthlyHours
      else break
    }
    result[month] = value
  }
  return result
}

module.exports = { resolveMonthlyHoursByMonth }
