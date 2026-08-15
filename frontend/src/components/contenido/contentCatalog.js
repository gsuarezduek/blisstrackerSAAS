// Espejo del catálogo de contenido del backend (backend/src/lib/contentCatalog.js).
// El frontend usa labels + colores para el render de badges, filtros, calendario
// y Kanban. Mantener en sync con el backend al agregar estados/tipos/redes.

export const CONTENT_STATUSES = [
  { key: 'idea',       label: 'Idea',                 color: 'gray',    order: 1 },
  { key: 'produccion', label: 'En producción',        color: 'blue',    order: 2 },
  { key: 'revision',   label: 'Revisión interna',     color: 'indigo',  order: 3 },
  { key: 'aprobacion', label: 'Esperando aprobación', color: 'amber',   order: 4, portalVisible: true, awaitingClient: true },
  { key: 'cambios',    label: 'Cambios pedidos',      color: 'red',     order: 5, portalVisible: true, isRework: true },
  { key: 'aprobado',   label: 'Aprobado',             color: 'green',   order: 6, portalVisible: true, isApproved: true },
  { key: 'programado', label: 'Programado',           color: 'teal',    order: 7, portalVisible: true, isApproved: true },
  { key: 'publicado',  label: 'Publicado',            color: 'emerald', order: 8, portalVisible: true, isApproved: true, isTerminal: true },
  { key: 'archivado',  label: 'Archivado',            color: 'gray',    order: 9, isTerminal: true },
]

// Estados abiertos (no terminales) — columnas del Kanban por defecto.
export const OPEN_STATUSES = CONTENT_STATUSES.filter(s => !s.isTerminal)

export const CONTENT_TYPES = [
  { key: 'post',       label: 'Post',       media: 'image' },
  { key: 'carrusel',   label: 'Carrusel',   media: 'image', multi: true },
  { key: 'reel',       label: 'Reel',       media: 'video' },
  { key: 'story',      label: 'Story',      media: 'any' },
  { key: 'video',      label: 'Video',      media: 'video' },
  { key: 'articulo',   label: 'Artículo',   media: 'image' },
  { key: 'newsletter', label: 'Newsletter', media: 'image' },
  { key: 'otro',       label: 'Otro',       media: 'any' },
]

// `hasIcon` = tiene logo en marketing/SocialIcon.jsx; el resto se rinde con texto.
export const CONTENT_NETWORKS = [
  { key: 'instagram', label: 'Instagram', hasIcon: true },
  { key: 'facebook',  label: 'Facebook',  hasIcon: true },
  { key: 'tiktok',    label: 'TikTok',    hasIcon: true },
  { key: 'linkedin',  label: 'LinkedIn',  hasIcon: true },
  { key: 'youtube',   label: 'YouTube',   hasIcon: true },
  { key: 'x',         label: 'X' },
  { key: 'threads',   label: 'Threads' },
  { key: 'pinterest', label: 'Pinterest' },
  { key: 'blog',      label: 'Blog' },
  { key: 'email',     label: 'Email' },
]

export function statusMeta(key) {
  return CONTENT_STATUSES.find(s => s.key === key) || { key, label: key, color: 'gray' }
}

export function typeLabel(key) {
  return CONTENT_TYPES.find(t => t.key === key)?.label || key || '—'
}

export function networkMeta(key) {
  return CONTENT_NETWORKS.find(n => n.key === key) || { key, label: key }
}

export function networkLabel(key) {
  return networkMeta(key).label
}

// Clases Tailwind por color de estado (badges). Literales y completas a propósito:
// Tailwind purga las clases construidas por interpolación (`bg-${color}-100`).
export const STATUS_BADGE = {
  gray:    'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200',
  blue:    'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  indigo:  'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300',
  amber:   'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  red:     'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  green:   'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  teal:    'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300',
  emerald: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
}

// Punto de color sólido (chips del calendario, borde de card en el Kanban).
export const STATUS_DOT = {
  gray:    'bg-gray-400',
  blue:    'bg-blue-500',
  indigo:  'bg-indigo-500',
  amber:   'bg-amber-500',
  red:     'bg-red-500',
  green:   'bg-green-500',
  teal:    'bg-teal-500',
  emerald: 'bg-emerald-500',
}

export function statusBadgeClass(key) {
  return STATUS_BADGE[statusMeta(key).color] || STATUS_BADGE.gray
}

export function statusDotClass(key) {
  return STATUS_DOT[statusMeta(key).color] || STATUS_DOT.gray
}
