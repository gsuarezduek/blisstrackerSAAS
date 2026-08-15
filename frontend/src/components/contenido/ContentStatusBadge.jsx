import { statusMeta, statusBadgeClass } from './contentCatalog'

/** Chip de estado de una pieza. Color y label salen del catálogo. */
export default function ContentStatusBadge({ status, className = '' }) {
  const meta = statusMeta(status)
  return (
    <span className={`inline-block text-[11px] px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${statusBadgeClass(status)} ${className}`}>
      {meta.label}
    </span>
  )
}
