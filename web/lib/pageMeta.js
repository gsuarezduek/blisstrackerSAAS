// Title y description de cada página pública, en un solo lugar.
//
// Dos razones para centralizarlo: (1) que sea evidente de un vistazo que no hay dos
// rutas con el mismo title ni la misma description — era justamente el problema del
// index.html de la SPA, que servía los mismos para todo; (2) que un test pueda
// verificar el largo de cada description (150–160 caracteres) sin recorrer páginas.
//
// El largo importa: abajo de ~150 se desperdicia el espacio del resultado de Google y
// arriba de ~160 se corta con puntos suspensivos. `tests/metadata.test.js` lo valida.
export const DESCRIPTION_MIN = 150
export const DESCRIPTION_MAX = 160

export const PAGE_META = {
  '/': {
    title: 'BlissTracker — El sistema operativo de tu agencia',
    description: 'Gestión de equipo, marketing y reportes de clientes en un solo sistema. Tareas con foco real, EOS y CRM para agencias. Gratis hasta 3 usuarios, sin tarjeta.',
  },
  '/pricing': {
    title: 'Precios y planes — BlissTracker',
    description: 'Precios simples para agencias que crecen: gratis hasta 3 usuarios y USD 3 por usuario al mes en el plan Pro. Catorce días de prueba, sin tarjeta de crédito.',
  },
  '/contacto': {
    title: 'Contacto — BlissTracker',
    description: 'Escribinos y te contamos cómo ordenar la operación de tu agencia con BlissTracker. Respondemos consultas de planes, migración de datos y puesta en marcha.',
  },
  '/soluciones/marketing': {
    title: 'Marketing para agencias (GEO, SEO y Ads) — BlissTracker',
    description: 'GEO Audit para buscadores con IA, SEO con Search Console, Google y Meta Ads, redes sociales e informes mensuales con URL pública para entregarle al cliente.',
  },
  '/soluciones/eos': {
    title: 'EOS / Traction para empresas — BlissTracker',
    description: 'Los componentes de Traction —Visión, Personas, Scorecard, Asuntos, Procesos y Tracción— integrados al mismo sistema donde tu equipo ejecuta sus tareas.',
  },
  '/soluciones/ventas': {
    title: 'CRM de ventas para agencias — BlissTracker',
    description: 'Pipeline de leads, próximas acciones con recordatorio automático, investigación de empresas con IA y generador de propuestas, conectado a tus proyectos.',
  },
  '/blog': {
    title: 'Blog — BlissTracker',
    description: 'Ideas y aprendizajes sobre gestión de agencias, marketing digital y productividad de equipos, escritos por el equipo que construye BlissTracker todos los días.',
  },
  '/condiciones': {
    title: 'Condiciones de uso — BlissTracker',
    description: 'Condiciones de uso de BlissTracker: qué incluye el servicio, cómo se contrata y se cancela, qué responsabilidad asume cada parte y cómo tratamos tu contenido.',
  },
  '/privacidad': {
    title: 'Política de privacidad — BlissTracker',
    description: 'Qué datos personales recopila BlissTracker, con qué finalidad, cuánto tiempo los conserva, con quién los comparte y cómo podés pedir que se eliminen del todo.',
  },
  '/eliminar-datos': {
    title: 'Eliminar mis datos — BlissTracker',
    description: 'Cómo pedir la eliminación de tus datos personales y los de tu equipo en BlissTracker: qué se borra, en qué plazo se hace y cómo te confirmamos que terminó.',
  },
}

/**
 * Recorta una description que viene de la DB (excerpt de un post, texto de un legal)
 * al máximo, cortando en el último espacio para no partir una palabra al medio.
 */
export function clampDescription(text, max = DESCRIPTION_MAX) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim()
  if (clean.length <= max) return clean
  const cut = clean.slice(0, max - 1)
  const lastSpace = cut.lastIndexOf(' ')
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[,;:.\s]+$/, '')}…`
}

/** Meta de una ruta estática. Falla temprano si la ruta no está en el catálogo. */
export function metaFor(path) {
  const meta = PAGE_META[path]
  if (!meta) throw new Error(`[pageMeta] No hay title/description para "${path}"`)
  return meta
}
