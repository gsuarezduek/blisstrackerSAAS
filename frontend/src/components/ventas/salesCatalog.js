// Espejo del catálogo de ventas del backend (backend/src/lib/salesCatalog.js).
// El frontend usa labels + colores para el render de badges, filtros y pipeline.
// Mantener en sync con el backend al agregar estados/orígenes.

export const LEAD_STATUSES = [
  { key: 'prospecto',  label: 'Prospecto',  color: 'gray',   order: 1, prob: 10 },
  { key: 'contactado', label: 'Contactado', color: 'blue',   order: 2, prob: 25 },
  { key: 'reunion',    label: 'Reunión',    color: 'indigo', order: 3, prob: 45 },
  { key: 'propuesta',  label: 'Propuesta',  color: 'amber',  order: 4, prob: 65 },
  { key: 'ganado',     label: 'Ganado',     color: 'green',  order: 5, prob: 100, isWon: true },
  { key: 'perdido',    label: 'Perdido',    color: 'red',    order: 6, prob: 0,   isLost: true },
]

// Estados abiertos (no terminales), ordenados — columnas del pipeline Kanban.
export const OPEN_STATUSES = LEAD_STATUSES.filter(s => !s.isWon && !s.isLost)

export const LEAD_ORIGINS = [
  { key: 'sitio_web',  label: 'Sitio Web' },
  { key: 'google_ads', label: 'Google Ads' },
  { key: 'meta_ads',   label: 'Meta Ads' },
  { key: 'linkedin',   label: 'LinkedIn' },
  { key: 'referido',   label: 'Referido' },
  { key: 'cliente',    label: 'Cliente' },
  { key: 'whatsapp',   label: 'WhatsApp' },
  { key: 'evento',     label: 'Evento' },
  { key: 'llamada',    label: 'Llamada' },
  { key: 'otro',       label: 'Otro' },
]

export function statusMeta(key) {
  return LEAD_STATUSES.find(s => s.key === key) || { key, label: key, color: 'gray' }
}

export function originLabel(key) {
  return LEAD_ORIGINS.find(o => o.key === key)?.label || key || '—'
}

// Clases Tailwind por color de estado (badges). Alineado a la paleta del resto del sistema.
export const STATUS_BADGE = {
  gray:   'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200',
  blue:   'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  indigo: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300',
  amber:  'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  green:  'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  red:    'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
}
