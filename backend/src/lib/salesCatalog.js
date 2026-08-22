// Catálogo único del módulo Ventas (CRM).
// Fuente de verdad de estados del lead, orígenes y tipos de evento del timeline.
// Espejo en el frontend: frontend/src/components/ventas/salesCatalog.js
// (mantener ambos en sync — el frontend usa labels/colores para el render).
//
// Para agregar un estado/origen nuevo: sumarlo acá y en el espejo. Nada más
// del sistema depende de valores hardcodeados (los controllers validan contra
// estas listas), por eso el CRM puede crecer sin tocar el resto del código.

// Estados del Lead. `order` define la posición en el pipeline (Kanban).
// isWon/isLost marcan los estados terminales (Ganado habilita "Crear Proyecto").
// `prob` = probabilidad de cierre (%) usada para el forecast ponderado del pipeline.
const LEAD_STATUSES = [
  { key: 'prospecto',  label: 'Prospecto',  color: 'gray',   order: 1, prob: 10 },
  { key: 'contactado', label: 'Contactado', color: 'blue',   order: 2, prob: 25 },
  { key: 'reunion',    label: 'Reunión',    color: 'indigo', order: 3, prob: 45 },
  { key: 'propuesta',  label: 'Propuesta',  color: 'amber',  order: 4, prob: 65 },
  { key: 'ganado',     label: 'Ganado',     color: 'green',  order: 5, prob: 100, isWon: true },
  { key: 'perdido',    label: 'Perdido',    color: 'red',    order: 6, prob: 0,   isLost: true },
]

// Orígenes del Lead (para estadísticas de canal a futuro).
const LEAD_ORIGINS = [
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

const LEAD_STATUS_KEYS = LEAD_STATUSES.map(s => s.key)
const LEAD_ORIGIN_KEYS = LEAD_ORIGINS.map(o => o.key)

// Estados no terminales (todavía "en juego"). Usado para la regla de negocio
// "un Contact no puede ser primaryContact de más de un Lead activo a la vez"
// (ver assertContactAvailable en controllers/ventas/_shared.js) y para
// resolver el lead vigente de un contacto que escribe por WhatsApp (Fase 2).
const ACTIVE_LEAD_STATUS_KEYS = LEAD_STATUSES.filter(s => !s.isWon && !s.isLost).map(s => s.key)

function isValidStatus(key) { return LEAD_STATUS_KEYS.includes(key) }
function isValidOrigin(key) { return key == null || LEAD_ORIGIN_KEYS.includes(key) }
function statusMeta(key)    { return LEAD_STATUSES.find(s => s.key === key) || null }

module.exports = {
  LEAD_STATUSES,
  LEAD_ORIGINS,
  LEAD_STATUS_KEYS,
  LEAD_ORIGIN_KEYS,
  ACTIVE_LEAD_STATUS_KEYS,
  isValidStatus,
  isValidOrigin,
  statusMeta,
}
