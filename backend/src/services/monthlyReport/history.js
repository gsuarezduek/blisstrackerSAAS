const prisma = require('../../lib/prisma')
const { prevMonthsArr, prevMonthStr, monthBounds } = require('../../lib/monthUtils')

// ── Historial mes a mes por sección ("Comparar con meses anteriores") ─────────
// Serie de los últimos HISTORY_MONTHS meses (terminando en el mes ancla del informe)
// por sección, leída de los snapshots mensuales que ya persiste la cadena de crons.
// Igual que los objetivos, NO se cachea en `dataCache`: se recalcula en cada carga
// (queries livianas), así los informes ya generados/publicados también la muestran
// y nunca incluye meses posteriores al del informe.

const HISTORY_MONTHS = 6

// format: cómo se muestra el valor ('number' | 'percent' | 'money' | 'decimal').
// chart:  'bar' para volúmenes del mes; 'line' para tasas y posiciones (no se suman).
// invert: menor es mejor (posición media).
// `get(row, prevRow)` devuelve el valor del mes o null si no hay dato.
// "Seguidores nuevos" se deriva como diferencia contra el snapshot del mes anterior:
// el total acumulado crece casi plano y no deja ver la diferencia entre meses.
const field = (f, scale = 1) => (row) => (row?.[f] == null ? null : row[f] * scale)
const netNew = (f) => (row, prevRow) =>
  row?.[f] == null || prevRow?.[f] == null ? null : row[f] - prevRow[f]

// El orden importa: la primera métrica con datos es la que se muestra por defecto.
const SOURCES = {
  analytics: {
    model: 'analyticsSnapshot',
    select: { sessions: true, newUsers: true, pageviews: true, conversions: true },
    metrics: [
      { key: 'sessions',    label: 'Sesiones',        get: field('sessions') },
      { key: 'newUsers',    label: 'Usuarios nuevos', get: field('newUsers') },
      { key: 'conversions', label: 'Conversiones',    get: field('conversions') },
      { key: 'pageviews',   label: 'Páginas vistas',  get: field('pageviews') },
    ],
  },
  seo: {
    model: 'searchConsoleSnapshot',
    select: { clicks: true, impressions: true, ctr: true, avgPosition: true },
    metrics: [
      { key: 'clicks',      label: 'Clics orgánicos', get: field('clicks') },
      { key: 'impressions', label: 'Impresiones',     get: field('impressions') },
      { key: 'ctr',         label: 'CTR',             get: field('ctr', 100), format: 'percent', chart: 'line' },
      { key: 'avgPosition', label: 'Posición media',  get: (r) => (r?.avgPosition ? r.avgPosition : null), format: 'decimal', chart: 'line', invert: true },
    ],
  },
  instagram: {
    model: 'instagramSnapshot',
    select: { followersCount: true, reach: true, postsCount: true, engagementRate: true },
    metrics: [
      { key: 'newFollowers',   label: 'Seguidores nuevos', get: netNew('followersCount') },
      { key: 'reach',          label: 'Alcance',           get: field('reach') },
      { key: 'engagementRate', label: 'Engagement',        get: field('engagementRate'), format: 'percent', chart: 'line' },
      { key: 'posts',          label: 'Publicaciones',     get: field('postsCount') },
    ],
  },
  tiktok: {
    model: 'tikTokSnapshot',
    select: { followersCount: true, avgViews: true, postsThisMonth: true, engagementRate: true },
    metrics: [
      { key: 'newFollowers',   label: 'Seguidores nuevos', get: netNew('followersCount') },
      { key: 'avgViews',       label: 'Vistas promedio',   get: field('avgViews') },
      { key: 'engagementRate', label: 'Engagement',        get: field('engagementRate'), format: 'percent', chart: 'line' },
      { key: 'posts',          label: 'Publicaciones',     get: field('postsThisMonth') },
    ],
  },
  youtube: {
    model: 'youTubeSnapshot',
    select: { subscriberCount: true, monthViews: true, videosThisMonth: true, engagementRate: true },
    metrics: [
      { key: 'newSubscribers', label: 'Suscriptores nuevos', get: netNew('subscriberCount') },
      { key: 'monthViews',     label: 'Vistas del mes',      get: field('monthViews') },
      { key: 'engagementRate', label: 'Engagement',          get: field('engagementRate'), format: 'percent', chart: 'line' },
      { key: 'videos',         label: 'Videos publicados',   get: field('videosThisMonth') },
    ],
  },
  linkedin: {
    model: 'linkedinSnapshot',
    select: { followersCount: true, impressions: true, clicks: true, engagementRate: true },
    metrics: [
      { key: 'newFollowers',   label: 'Seguidores nuevos', get: netNew('followersCount') },
      { key: 'impressions',    label: 'Impresiones',       get: field('impressions') },
      { key: 'clicks',         label: 'Clics',             get: field('clicks') },
      { key: 'engagementRate', label: 'Engagement',        get: field('engagementRate'), format: 'percent', chart: 'line' },
    ],
  },
  facebook: {
    model: 'facebookSnapshot',
    select: { followersCount: true, reach: true, impressions: true, engagementRate: true },
    metrics: [
      { key: 'newFollowers',   label: 'Seguidores nuevos', get: netNew('followersCount') },
      { key: 'reach',          label: 'Alcance',           get: field('reach') },
      { key: 'impressions',    label: 'Impresiones',       get: field('impressions') },
      { key: 'engagementRate', label: 'Engagement',        get: field('engagementRate'), format: 'percent', chart: 'line' },
    ],
  },
  metaAds: {
    model: 'adsSnapshot', adsType: 'meta_ads',
    select: { spend: true, clicks: true, reach: true, ctr: true },
    metrics: [
      { key: 'clicks', label: 'Clics',     get: field('clicks') },
      { key: 'reach',  label: 'Alcance',   get: field('reach') },
      { key: 'spend',  label: 'Inversión', get: field('spend'), format: 'money' },
      { key: 'ctr',    label: 'CTR',       get: field('ctr'), format: 'percent', chart: 'line' },
    ],
  },
  googleAds: {
    model: 'adsSnapshot', adsType: 'google_ads',
    select: { spend: true, clicks: true, conversions: true, ctr: true },
    metrics: [
      { key: 'conversions', label: 'Conversiones', get: field('conversions') },
      { key: 'clicks',      label: 'Clics',        get: field('clicks') },
      { key: 'spend',       label: 'Inversión',    get: field('spend'), format: 'money' },
      { key: 'ctr',         label: 'CTR',          get: field('ctr'), format: 'percent', chart: 'line' },
    ],
  },
}

const round = (v) => (v == null ? null : Math.round(v * 100) / 100)

/**
 * Arma la serie de UNA sección a partir de sus filas de snapshot (puro, testeable).
 * @param {object} source  — entrada de SOURCES
 * @param {object[]} rows  — snapshots con `month` (incluye el mes previo a la ventana, para los "nuevos")
 * @param {string[]} months — ventana a mostrar, ascendente
 * @returns {{ metrics: object[] } | null} null si hay menos de 2 meses con dato (no hay nada que comparar)
 */
function buildSourceHistory(source, rows, months) {
  const byMonth = new Map(rows.map(r => [r.month, r]))
  const metrics = source.metrics.map(m => {
    const values = months.map(mo => round(m.get(byMonth.get(mo), byMonth.get(prevMonthStr(mo)))))
    return {
      key:    m.key,
      label:  m.label,
      format: m.format || 'number',
      chart:  m.chart  || 'bar',
      invert: !!m.invert,
      values,
    }
  }).filter(m => m.values.filter(v => v != null).length >= 2)
  return metrics.length ? { metrics } : null
}

// Ads: el KPI del informe sale de la API en vivo con el rango real, el snapshot lo
// escribe el cron recién el 1° del mes siguiente. Para que la barra del mes del
// informe coincida con el número de la tarjeta, se pisa con los valores de la sección.
function adsRowFromSection(type, section, month) {
  if (!section) return null
  return {
    month,
    spend:       type === 'googleAds' ? section.cost : section.spend,
    clicks:      section.clicks,
    ctr:         section.ctr,
    reach:       section.reach ?? null,
    conversions: section.conversions ?? null,
  }
}

/**
 * Historial de todas las secciones presentes en el informe.
 * Solo se arma para las secciones que existen en `sections` (respeta las deshabilitadas
 * y las borradas a mano: no viaja al cliente nada que no esté en el informe).
 */
async function loadReportHistory({ projectId, workspaceId, dataMonth, period, multiMonth, monthsCovered, sections }) {
  const keys = Object.keys(SOURCES).filter(k => sections?.[k])
  if (!keys.length) return null

  const months     = prevMonthsArr(dataMonth, HISTORY_MONTHS)
  const fetchMonths = [prevMonthStr(months[0]), ...months]   // +1 para los "nuevos" del primer mes

  const rowsByKey = await Promise.all(keys.map(k => {
    const src = SOURCES[k]
    // Promise.resolve().then: también un error sincrónico cae en el catch — el historial
    // es un extra, nunca debe romper la carga del informe.
    return Promise.resolve().then(() => prisma[src.model].findMany({
      where:  { projectId, workspaceId, month: { in: fetchMonths }, ...(src.adsType ? { type: src.adsType } : {}) },
      select: { month: true, ...src.select },
    })).catch(err => {
      console.warn(`[MonthlyReport] historial de ${k} no disponible:`, err.message)
      return []
    })
  }))

  const out = {}
  keys.forEach((k, i) => {
    let rows = rowsByKey[i]
    if (SOURCES[k].adsType && !multiMonth) {
      const live = adsRowFromSection(k, sections[k], dataMonth)
      if (live) rows = [...rows.filter(r => r.month !== dataMonth), live]
    }
    const built = buildSourceHistory(SOURCES[k], rows, months)
    if (built) out[k] = built
  })
  if (!Object.keys(out).length) return null

  return {
    months,
    // Meses que abarca el informe (se resaltan en el gráfico; varios si es multi-mes)
    highlight: monthsCovered.filter(m => months.includes(m)),
    // El último mes está incompleto (informe "este mes hasta hoy" o datos en vivo del portal)
    partialMonth: period.end < monthBounds(dataMonth).endDate ? dataMonth : null,
    sections: out,
  }
}

module.exports = { loadReportHistory, buildSourceHistory, SOURCES, HISTORY_MONTHS }
