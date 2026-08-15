// Catálogo único del módulo Contenido (calendario de piezas de RRSS).
// Fuente de verdad del workflow de estados, tipos de pieza y redes soportadas.
// Espejo en el frontend: frontend/src/components/contenido/contentCatalog.js
// (mantener ambos en sync — el frontend usa labels/colores para el render).
//
// El workflow es FIJO y vive acá, por eso ContentPiece.status es String y no un
// enum de Prisma: agregar o renombrar un estado es un cambio de catálogo, no una
// migración de tipo (mismo criterio que Lead.status / salesCatalog.js).

// Estados de una pieza. `order` define la posición de la columna en el Kanban.
// Flags:
//   portalVisible  — la pieza se muestra en el portal del cliente en este estado
//   awaitingClient — el cliente puede aprobar / pedir cambios desde acá
//   isApproved     — cuenta como "aprobada por el cliente"
//   isRework       — el cliente pidió cambios (vuelve a producción)
//   isTerminal     — no avanza más (queda fuera del Kanban por defecto)
const CONTENT_STATUSES = [
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

// Tipos de pieza. `media` sugiere qué asset espera (no lo fuerza: una story puede
// ser imagen o video, y el uploader acepta ambos en 'any').
const CONTENT_TYPES = [
  { key: 'post',       label: 'Post',       media: 'image' },
  { key: 'carrusel',   label: 'Carrusel',   media: 'image', multi: true },
  { key: 'reel',       label: 'Reel',       media: 'video' },
  { key: 'story',      label: 'Story',      media: 'any' },
  { key: 'video',      label: 'Video',      media: 'video' },
  { key: 'articulo',   label: 'Artículo',   media: 'image' },
  { key: 'newsletter', label: 'Newsletter', media: 'image' },
  { key: 'otro',       label: 'Otro',       media: 'any' },
]

// Redes de destino. Una pieza puede salir a varias a la vez (ContentPiece.networks
// es un JSON array). `hasIcon` marca las que ya tienen logo en el frontend
// (frontend/src/components/marketing/SocialIcon.jsx); el resto se rinde con texto.
const CONTENT_NETWORKS = [
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

// Al completar la Task vinculada ("enviar al dashboard"), la pieza avanza a este
// estado. Un estado fuera de este mapa no se mueve (completar la tarea de una
// pieza ya aprobada no la retrocede ni la adelanta).
const ADVANCE_ON_TASK_DONE = {
  produccion: 'revision',
  revision:   'aprobacion',
}

// Transiciones que dispara el CLIENTE desde el portal — las únicas que no pasan
// por canWrite(). Cualquier otro cambio de estado es del equipo.
const CLIENT_APPROVE_FROM = ['aprobacion']
const CLIENT_APPROVE_TO   = 'aprobado'
const CLIENT_CHANGES_TO   = 'cambios'

const CONTENT_STATUS_KEYS  = CONTENT_STATUSES.map(s => s.key)
const CONTENT_TYPE_KEYS    = CONTENT_TYPES.map(t => t.key)
const CONTENT_NETWORK_KEYS = CONTENT_NETWORKS.map(n => n.key)

// Estados visibles en el portal del cliente. ACTIVO CRÍTICO: el query público
// filtra `status: { in: PORTAL_VISIBLE_STATUSES }` en el WHERE de SQL.
// Nunca filtrar la visibilidad del portal en JS.
const PORTAL_VISIBLE_STATUSES = CONTENT_STATUSES.filter(s => s.portalVisible).map(s => s.key)
const OPEN_STATUSES           = CONTENT_STATUSES.filter(s => !s.isTerminal)

function isValidStatus(key)  { return CONTENT_STATUS_KEYS.includes(key) }
function isValidType(key)    { return CONTENT_TYPE_KEYS.includes(key) }
function isValidNetwork(key) { return CONTENT_NETWORK_KEYS.includes(key) }
function statusMeta(key)     { return CONTENT_STATUSES.find(s => s.key === key) || null }
function isPortalVisible(key){ return PORTAL_VISIBLE_STATUSES.includes(key) }
function awaitsClient(key)   { return Boolean(statusMeta(key)?.awaitingClient) }
function nextOnTaskDone(key) { return ADVANCE_ON_TASK_DONE[key] || null }

/** Filtra un array de redes dejando solo las válidas, sin duplicados. */
function sanitizeNetworks(input) {
  if (!Array.isArray(input)) return []
  return [...new Set(input.filter(isValidNetwork))]
}

module.exports = {
  CONTENT_STATUSES,
  CONTENT_TYPES,
  CONTENT_NETWORKS,
  CONTENT_STATUS_KEYS,
  CONTENT_TYPE_KEYS,
  CONTENT_NETWORK_KEYS,
  PORTAL_VISIBLE_STATUSES,
  OPEN_STATUSES,
  ADVANCE_ON_TASK_DONE,
  CLIENT_APPROVE_FROM,
  CLIENT_APPROVE_TO,
  CLIENT_CHANGES_TO,
  isValidStatus,
  isValidType,
  isValidNetwork,
  statusMeta,
  isPortalVisible,
  awaitsClient,
  nextOnTaskDone,
  sanitizeNetworks,
}
