import { statusMeta, STATUS_BADGE } from './salesCatalog'

// Badge de estado del lead. El estado es el único indicador visual del pipeline.
export default function StatusBadge({ status, className = '' }) {
  const meta = statusMeta(status)
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${STATUS_BADGE[meta.color] || STATUS_BADGE.gray} ${className}`}>
      {meta.label}
    </span>
  )
}

// Formatea un valor estimado con su moneda. Ej: fmtMoney(1500, 'USD') → "USD 1.500"
export function fmtMoney(value, currency = 'USD') {
  if (value == null || value === '') return '—'
  const n = Number(value)
  if (isNaN(n)) return '—'
  return `${currency} ${n.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`
}
