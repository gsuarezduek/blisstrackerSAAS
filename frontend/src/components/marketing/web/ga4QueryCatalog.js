// Espejo del catálogo de `backend/src/lib/ga4QueryCatalog.js` — SOLO rótulos y
// formato para mostrar la tabla que respalda la respuesta de la IA.
//
// El backend es el dueño de qué se puede consultar (es el que valida); acá sólo
// vive cómo se lee. Mismo patrón que objectiveCatalog.js / briefCatalog.js. Una
// clave que no esté en estos mapas se muestra con su nombre de la API: la tabla
// nunca se rompe por quedar desincronizada.
import { fmt, fmtDuration } from './webTabHelpers'

export const GA4_DIMENSIONS = {
  country:                      'País',
  city:                         'Ciudad',
  region:                       'Región',
  language:                     'Idioma',
  deviceCategory:               'Dispositivo',
  browser:                      'Navegador',
  operatingSystem:              'Sistema operativo',
  sessionDefaultChannelGroup:   'Canal',
  firstUserDefaultChannelGroup: 'Canal de origen',
  sessionSource:                'Fuente',
  sessionMedium:                'Medio',
  sessionSourceMedium:          'Fuente / medio',
  sessionCampaignName:          'Campaña',
  pagePath:                     'Página',
  pageTitle:                    'Título',
  landingPage:                  'Página de entrada',
  eventName:                    'Evento',
  newVsReturning:               'Nuevo / recurrente',
  date:                         'Día',
  yearMonth:                    'Mes',
  dayOfWeekName:                'Día de la semana',
  hour:                         'Hora',
}

export const GA4_METRICS = {
  sessions:                  { label: 'Visitas',              format: 'int' },
  activeUsers:               { label: 'Usuarios activos',     format: 'int' },
  newUsers:                  { label: 'Usuarios nuevos',      format: 'int' },
  totalUsers:                { label: 'Usuarios totales',     format: 'int' },
  screenPageViews:           { label: 'Páginas vistas',       format: 'int' },
  eventCount:                { label: 'Eventos',              format: 'int' },
  conversions:               { label: 'Eventos clave',        format: 'int' },
  bounceRate:                { label: 'Tasa de rebote',       format: 'rate' },
  engagementRate:            { label: 'Tasa de interacción',  format: 'rate' },
  averageSessionDuration:    { label: 'Duración media',       format: 'seconds' },
  userEngagementDuration:    { label: 'Tiempo de interacción', format: 'seconds' },
  sessionsPerUser:           { label: 'Sesiones por usuario', format: 'decimal' },
  screenPageViewsPerSession: { label: 'Páginas por sesión',   format: 'decimal' },
}

const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

export const dimensionLabel = key => GA4_DIMENSIONS[key] ?? key
export const metricLabel    = key => GA4_METRICS[key]?.label ?? key

export function formatMetricValue(key, value) {
  if (value == null) return '—'
  switch (GA4_METRICS[key]?.format) {
    case 'rate':    return `${fmt(value * 100, 1)}%`
    case 'seconds': return fmtDuration(value)
    case 'decimal': return fmt(value, 1)
    default:        return fmt(value)
  }
}

/** Los valores crudos de GA4 para fecha/mes/hora no se leen: "202611" → "nov 2026". */
export function formatDimensionValue(key, value) {
  if (value == null || value === '') return '—'
  if (key === 'date' && /^\d{8}$/.test(value)) return `${value.slice(6)}/${value.slice(4, 6)}/${value.slice(0, 4)}`
  if (key === 'yearMonth' && /^\d{6}$/.test(value)) return `${MONTHS_SHORT[Number(value.slice(4)) - 1]} ${value.slice(0, 4)}`
  if (key === 'hour' && /^\d{1,2}$/.test(value)) return `${String(value).padStart(2, '0')} h`
  if (value === '(not set)') return 'sin definir'
  return value
}

/** "1 al 13 de noviembre de 2026" / "últimos 365 días" — el período de la consulta. */
export function queryPeriodLabel(startDate, endDate) {
  const rel = d => {
    const m = /^(\d+)daysAgo$/.exec(d)
    if (m) return `hace ${m[1]} días`
    if (d === 'today') return 'hoy'
    if (d === 'yesterday') return 'ayer'
    return null
  }
  const abs = d => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null
    const [y, m, dd] = d.split('-')
    return `${Number(dd)} ${MONTHS_SHORT[Number(m) - 1]} ${y}`
  }
  const from = abs(startDate) ?? rel(startDate) ?? startDate
  const to   = abs(endDate)   ?? rel(endDate)   ?? endDate
  return `${from} → ${to}`
}
