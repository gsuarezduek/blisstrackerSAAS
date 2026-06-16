// Label del período analizado en Productividad (compartido entre vistas por persona y por proyecto).
const fmtD  = iso => new Date(iso + 'T12:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
const fmtDY = iso => new Date(iso + 'T12:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })

export default function ProductivityPeriodLabel({ period }) {
  if (!period) return null
  return (
    <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
      Período: <strong className="text-gray-700 dark:text-gray-200">{fmtD(period.curStart)} – {fmtDY(period.curEnd)}</strong>
      {period.businessDays != null && <span className="text-gray-400 dark:text-gray-500"> ({period.businessDays} días hábiles)</span>}
      <span className="text-gray-400 dark:text-gray-500"> · comparado con {fmtD(period.prevStart)} – {fmtDY(period.prevEnd)}</span>
      {period.lengthMatched && <span className="text-gray-400 dark:text-gray-500"> (mismas fechas del mes anterior)</span>}
    </p>
  )
}
