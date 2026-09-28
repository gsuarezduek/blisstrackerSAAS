// Estados de una pieza de Contenido, traducidos al lenguaje del CLIENTE.
//
// El catálogo interno (components/contenido/contentCatalog.js) tiene 9 estados
// pensados para el equipo ("Idea", "Revisión interna", "En producción"…). Al
// cliente esa granularidad no le sirve y, peor, le hace preguntarse si tiene
// que hacer algo. Acá se colapsan en 5 grupos orientados a "¿qué me toca?":
//   - review    → te toca a vos (única acción posible)
//   - working   → lo estamos preparando / ajustando (no hacés nada)
//   - approved  → ya está aprobado, falta publicar
//   - published → salió
//   - archived  → no se usa (no se muestra por defecto)
// La clave interna sigue viajando intacta; esto es solo presentación.

const GROUPS = {
  review:    { key: 'review',    label: 'Para revisar',     tone: 'bg-amber-50 text-amber-800 ring-amber-200',       dot: 'bg-amber-500',   order: 0 },
  changes:   { key: 'changes',   label: 'Ajustando cambios', tone: 'bg-violet-50 text-violet-700 ring-violet-200',   dot: 'bg-violet-500',  order: 1 },
  working:   { key: 'working',   label: 'En preparación',   tone: 'bg-gray-100 text-gray-600 ring-gray-200',         dot: 'bg-gray-400',    order: 2 },
  approved:  { key: 'approved',  label: 'Aprobado',         tone: 'bg-emerald-50 text-emerald-700 ring-emerald-200', dot: 'bg-emerald-500', order: 3 },
  scheduled: { key: 'scheduled', label: 'Programado',       tone: 'bg-sky-50 text-sky-700 ring-sky-200',             dot: 'bg-sky-500',     order: 4 },
  published: { key: 'published', label: 'Publicado',        tone: 'bg-emerald-600 text-white ring-emerald-600',      dot: 'bg-emerald-600', order: 5 },
  archived:  { key: 'archived',  label: 'Archivado',        tone: 'bg-gray-100 text-gray-500 ring-gray-200',         dot: 'bg-gray-300',    order: 6 },
}

const BY_STATUS = {
  idea:       'working',
  produccion: 'working',
  revision:   'working',
  aprobacion: 'review',
  cambios:    'changes',
  aprobado:   'approved',
  programado: 'scheduled',
  publicado:  'published',
  archivado:  'archived',
}

export function clientStatus(status) {
  return GROUPS[BY_STATUS[status] || 'working']
}

export function ClientStatusBadge({ status, className = '' }) {
  const g = clientStatus(status)
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full ring-1 ring-inset ${g.tone} ${className}`}>
      {g.key !== 'published' && <span className={`w-1.5 h-1.5 rounded-full ${g.dot}`} />}
      {g.label}
    </span>
  )
}
