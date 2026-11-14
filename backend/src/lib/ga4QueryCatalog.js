// Catálogo ÚNICO de lo que se le puede preguntar a GA4 desde la app.
//
// Lo usa "Preguntale a tus datos" (services/analyticsAsk.service.js): la IA no
// arma una request de GA4, elige dimensiones/métricas/filtros DE ACÁ y el
// backend las valida antes de salir a Google. Por eso esto es una lista blanca
// y no una validación de forma: la pregunta la escribe una persona, pasa por un
// modelo y termina en una API externa — lo único que garantiza que no se pueda
// pedir cualquier cosa (ni a otra propiedad) es que la query se reconstruya acá
// desde cero, con el `property` sacado de la integración y nunca del modelo.
//
// Agregar una dimensión/métrica es sumarla al mapa; el prompt se arma solo
// (buildCatalogPrompt), así no hay dos listas que mantener sincronizadas.

// Dimensión → cómo se la nombra en castellano (va al prompt tal cual)
const DIMENSIONS = {
  country:                      'País del visitante',
  city:                         'Ciudad del visitante',
  region:                       'Provincia / región del visitante',
  language:                     'Idioma del navegador',
  deviceCategory:               'Tipo de dispositivo (desktop / mobile / tablet)',
  browser:                      'Navegador',
  operatingSystem:              'Sistema operativo',
  sessionDefaultChannelGroup:   'Canal de la sesión (Organic Search, Direct, Paid Social…)',
  firstUserDefaultChannelGroup: 'Canal por el que el usuario llegó la primera vez',
  sessionSource:                'Fuente de la sesión (google, instagram, (direct)…)',
  sessionMedium:                'Medio de la sesión (organic, cpc, referral…)',
  sessionSourceMedium:          'Fuente / medio combinados',
  sessionCampaignName:          'Nombre de la campaña',
  pagePath:                     'Ruta de la página (/precios)',
  pageTitle:                    'Título de la página',
  landingPage:                  'Página de entrada (landing)',
  eventName:                    'Nombre del evento',
  newVsReturning:               'Usuario nuevo o recurrente',
  date:                         'Día (YYYYMMDD)',
  yearMonth:                    'Mes (YYYYMM)',
  dayOfWeekName:                'Día de la semana',
  hour:                         'Hora del día',
}

// Métrica → etiqueta + cómo se formatea el número al mostrarlo
const METRICS = {
  sessions:                  { label: 'Sesiones (visitas)',             format: 'int' },
  activeUsers:               { label: 'Usuarios activos',               format: 'int' },
  newUsers:                  { label: 'Usuarios nuevos',                format: 'int' },
  totalUsers:                { label: 'Usuarios totales',               format: 'int' },
  screenPageViews:           { label: 'Páginas vistas',                 format: 'int' },
  eventCount:                { label: 'Cantidad de eventos',            format: 'int' },
  conversions:               { label: 'Eventos clave (conversiones)',   format: 'int' },
  bounceRate:                { label: 'Tasa de rebote',                 format: 'rate' },
  engagementRate:            { label: 'Tasa de interacción',            format: 'rate' },
  averageSessionDuration:    { label: 'Duración media de sesión',       format: 'seconds' },
  userEngagementDuration:    { label: 'Tiempo de interacción total',    format: 'seconds' },
  sessionsPerUser:           { label: 'Sesiones por usuario',           format: 'decimal' },
  screenPageViewsPerSession: { label: 'Páginas por sesión',             format: 'decimal' },
}

// Operadores de filtro expuestos → matchType de la Data API
const FILTER_OPERATORS = {
  exact:      'EXACT',
  contains:   'CONTAINS',
  beginsWith: 'BEGINS_WITH',
  endsWith:   'ENDS_WITH',
}

// Mismo formato que acepta el endpoint de analytics: fecha absoluta o relativa.
const VALID_DATE = /^(\d{4}-\d{2}-\d{2}|\d+daysAgo|today|yesterday)$/

const MAX_DIMENSIONS = 3
const MAX_METRICS    = 4
const MAX_FILTERS    = 3
const MAX_LIMIT      = 100
const DEFAULT_LIMIT  = 10

const isPlainArray = v => Array.isArray(v) && v.length > 0

/**
 * Valida la query que propuso la IA contra la lista blanca y la devuelve
 * normalizada. NUNCA lanza: devuelve `{ ok: false, error }` para que el error
 * vuelva al modelo como tool_result y pueda corregir la consulta sin cortar
 * la conversación.
 *
 * @param {object} raw  — lo que vino en el tool_use
 * @returns {{ ok: true, query: object } | { ok: false, error: string }}
 */
function validateGa4Query(raw) {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'Consulta vacía.' }

  const metrics = isPlainArray(raw.metrics) ? raw.metrics.map(String) : []
  if (!metrics.length) return { ok: false, error: 'Falta al menos una métrica.' }
  if (metrics.length > MAX_METRICS) return { ok: false, error: `Máximo ${MAX_METRICS} métricas por consulta.` }
  const badMetric = metrics.find(m => !METRICS[m])
  if (badMetric) return { ok: false, error: `Métrica no disponible: "${badMetric}". Elegí una de: ${Object.keys(METRICS).join(', ')}.` }

  const dimensions = Array.isArray(raw.dimensions) ? raw.dimensions.map(String) : []
  if (dimensions.length > MAX_DIMENSIONS) return { ok: false, error: `Máximo ${MAX_DIMENSIONS} dimensiones por consulta.` }
  const badDim = dimensions.find(d => !DIMENSIONS[d])
  if (badDim) return { ok: false, error: `Dimensión no disponible: "${badDim}". Elegí una de: ${Object.keys(DIMENSIONS).join(', ')}.` }

  const startDate = String(raw.startDate ?? '').trim()
  const endDate   = String(raw.endDate   ?? '').trim()
  if (!VALID_DATE.test(startDate)) return { ok: false, error: 'startDate inválido. Usá "YYYY-MM-DD", "NdaysAgo", "yesterday" o "today".' }
  if (!VALID_DATE.test(endDate))   return { ok: false, error: 'endDate inválido. Usá "YYYY-MM-DD", "NdaysAgo", "yesterday" o "today".' }
  if (/^\d{4}-/.test(startDate) && /^\d{4}-/.test(endDate) && startDate > endDate) {
    return { ok: false, error: 'startDate es posterior a endDate.' }
  }

  const filters = []
  const rawFilters = Array.isArray(raw.filters) ? raw.filters : []
  if (rawFilters.length > MAX_FILTERS) return { ok: false, error: `Máximo ${MAX_FILTERS} filtros por consulta.` }
  for (const f of rawFilters) {
    if (!f || typeof f !== 'object') continue
    const dimension = String(f.dimension ?? '')
    if (!DIMENSIONS[dimension]) return { ok: false, error: `No se puede filtrar por "${dimension}".` }
    const operator = String(f.operator ?? 'exact')
    if (!FILTER_OPERATORS[operator]) return { ok: false, error: `Operador de filtro inválido: "${operator}". Usá: ${Object.keys(FILTER_OPERATORS).join(', ')}.` }
    const values = isPlainArray(f.values) ? f.values.map(String).filter(Boolean) : []
    if (!values.length) return { ok: false, error: `El filtro sobre "${dimension}" no tiene valores.` }
    filters.push({ dimension, operator, values: values.slice(0, 20) })
  }

  let orderBy = null
  if (raw.orderBy && typeof raw.orderBy === 'object') {
    const { metric, dimension } = raw.orderBy
    const desc = raw.orderBy.desc !== false
    if (metric) {
      if (!metrics.includes(String(metric))) return { ok: false, error: `No se puede ordenar por "${metric}": no está entre las métricas pedidas.` }
      orderBy = { metric: String(metric), desc }
    } else if (dimension) {
      if (!dimensions.includes(String(dimension))) return { ok: false, error: `No se puede ordenar por "${dimension}": no está entre las dimensiones pedidas.` }
      orderBy = { dimension: String(dimension), desc }
    }
  }
  // Sin orden explícito: por la primera métrica desc (lo que se espera de un "top N"),
  // salvo que haya una dimensión temporal, donde el orden natural es cronológico.
  if (!orderBy) {
    const timeDim = dimensions.find(d => d === 'date' || d === 'yearMonth')
    orderBy = timeDim ? { dimension: timeDim, desc: false } : { metric: metrics[0], desc: true }
  }

  const limitNum = Number(raw.limit)
  const limit = Number.isFinite(limitNum) && limitNum > 0 ? Math.min(Math.round(limitNum), MAX_LIMIT) : DEFAULT_LIMIT

  return { ok: true, query: { metrics, dimensions, startDate, endDate, filters, orderBy, limit } }
}

/**
 * Traduce la query ya validada al cuerpo de `runReport`. Separado de la
 * validación para que el mapeo a la forma de Google viva en un solo lugar.
 */
function toRunReportBody(query) {
  const body = {
    dateRanges: [{ startDate: query.startDate, endDate: query.endDate }],
    metrics:    query.metrics.map(name => ({ name })),
    limit:      query.limit,
    metricAggregations: ['TOTAL'],
  }
  if (query.dimensions.length) body.dimensions = query.dimensions.map(name => ({ name }))

  if (query.filters.length) {
    const expressions = query.filters.map(f => (
      f.values.length > 1 && f.operator === 'exact'
        ? { filter: { fieldName: f.dimension, inListFilter: { values: f.values, caseSensitive: false } } }
        : {
            filter: {
              fieldName: f.dimension,
              stringFilter: { matchType: FILTER_OPERATORS[f.operator], value: f.values[0], caseSensitive: false },
            },
          }
    ))
    body.dimensionFilter = expressions.length === 1 ? expressions[0] : { andGroup: { expressions } }
  }

  if (query.orderBy?.metric) {
    body.orderBys = [{ metric: { metricName: query.orderBy.metric }, desc: query.orderBy.desc }]
  } else if (query.orderBy?.dimension) {
    body.orderBys = [{ dimension: { dimensionName: query.orderBy.dimension }, desc: query.orderBy.desc }]
  }
  return body
}

/** Bloque del prompt con el catálogo disponible (se arma del mapa, no se escribe a mano). */
function buildCatalogPrompt() {
  const dims = Object.entries(DIMENSIONS).map(([k, v]) => `- ${k}: ${v}`).join('\n')
  const mets = Object.entries(METRICS).map(([k, v]) => `- ${k}: ${v.label}`).join('\n')
  return `DIMENSIONES disponibles:\n${dims}\n\nMÉTRICAS disponibles:\n${mets}`
}

module.exports = {
  DIMENSIONS, METRICS, FILTER_OPERATORS,
  MAX_DIMENSIONS, MAX_METRICS, MAX_FILTERS, MAX_LIMIT, DEFAULT_LIMIT,
  validateGa4Query, toRunReportBody, buildCatalogPrompt,
}
