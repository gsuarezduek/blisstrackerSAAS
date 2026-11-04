// Lógica pura (sin I/O) de los conflictos de canibalización marcados como resueltos:
// identidad del conflicto, split abierto/resuelto para las lecturas, y la decisión de
// REABRIR un conflicto a partir de datos de Search Console posteriores al arreglo.
// Separado de cannibalization.service.js para testearlo sin mocks de Prisma/GSC
// (mismo criterio que cannibalAnalysis.js).
//
// ── Por qué hay una verificación y no un simple flag ─────────────────────────
// El análisis consulta una ventana de 30/90/180 días HACIA ATRÁS, así que un 301
// hecho hoy sigue produciendo el conflicto en los reportes de los próximos 90 días:
// los datos previos al arreglo están dentro de la ventana. "Sigue apareciendo en el
// reporte" no prueba nada; lo único que prueba que volvió son impresiones POSTERIORES
// a la fecha del arreglo, que es lo que se consulta aparte (una query por conflicto
// resuelto, filtrada por esa keyword).

const { detectLanguage, normalizeUrlForCompare } = require('./cannibalAnalysis')

const ACTIONS = ['301', 'canonical', 'noindex', 'diferenciado', 'otro']

// Search Console publica los datos con ~2-3 días de atraso: antes de esta cantidad de
// días posteriores al arreglo no hay con qué decidir, y un veredicto ahí sería "volvió"
// por falta de datos. Hasta entonces el conflicto queda resuelto, "en verificación".
const MIN_VERIFY_DAYS = 7

// Un 301 no borra la URL vieja de Search Console de un día para otro (Google tarda
// semanas en dejar de servirla), así que "quedó alguna impresión residual" no alcanza
// como señal de que el conflicto volvió: la URL tiene que seguir llevándose una parte
// real de la keyword.
const MIN_SHARE          = 0.10 // 10% de las impresiones de la keyword en la ventana
const MIN_URL_IMPRESSIONS = 5   // piso absoluto, para keywords de bajo volumen

// Mismo corte de volumen que groupConflicts (50 impresiones), prorrateado a la ventana
// posterior al arreglo: sin esto una ventana de 10 días contra un análisis de 90 nunca
// llegaría al corte y TODO parecería resuelto para siempre.
const BASE_MIN_IMPRESSIONS   = 50
const WINDOW_MIN_IMPRESSIONS = 10 // piso: una ventana muy corta igual necesita algo de volumen

const DAY_MS = 86400000

// Identidad de un conflicto: query + idioma, el mismo par con el que lo agrupa
// cannibalAnalysis.js. Normalizado para comparar (la fila guarda la query original).
function conflictKey(query, language) {
  const q = String(query ?? '').trim().toLowerCase()
  const l = String(language ?? 'default').trim().toLowerCase() || 'default'
  return `${q}\u0000${l}`
}

function toDateStr(value) {
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString().slice(0, 10)
}

/**
 * Ventana de datos POSTERIOR al arreglo: arranca el día siguiente a `resolvedAt`
 * (el día del arreglo está mezclado: tiene horas de antes y de después) y termina
 * donde termina la ventana del análisis.
 * Devuelve `null` si la fecha es inválida o si la ventana quedó vacía.
 */
function postFixWindow(resolvedAt, endDate) {
  const resolved = toDateStr(resolvedAt)
  const end      = toDateStr(endDate)
  if (!resolved || !end) return null

  const startMs = new Date(`${resolved}T00:00:00Z`).getTime() + DAY_MS
  const endMs   = new Date(`${end}T00:00:00Z`).getTime()
  if (startMs > endMs) return null

  return {
    startDate: new Date(startMs).toISOString().slice(0, 10),
    endDate:   end,
    days:      Math.round((endMs - startMs) / DAY_MS) + 1,
  }
}

// Corte de volumen de la ventana posterior, prorrateado contra la ventana del análisis.
function proratedMinImpressions(windowDays, rangeDays, base = BASE_MIN_IMPRESSIONS) {
  if (!rangeDays || rangeDays <= 0 || !windowDays || windowDays <= 0) return base
  const ratio = Math.min(windowDays / rangeDays, 1)
  return Math.max(WINDOW_MIN_IMPRESSIONS, Math.round(base * ratio))
}

// ¿Esta URL pertenece al idioma del conflicto resuelto? El idioma de algunas URLs se
// había resuelto en el run original con un fetch de `<html lang>`
// (resolveLanguageOverrides) y la verificación no repite esos fetches: las URLs que ya
// estaban en el conflicto cuentan igual. Una URL nueva de otro idioma es, por
// definición, otro conflicto.
function belongsToLanguage(url, language, knownUrls) {
  if (detectLanguage(url) === language) return true
  return knownUrls.has(normalizeUrlForCompare(url))
}

/**
 * ¿El conflicto volvió? Decide sobre filas de Search Console de la ventana POSTERIOR
 * al arreglo (una fila por página, ya filtradas por la keyword).
 *
 * @param {{rows?: Array<{url,impressions,clicks}>, language?: string, knownUrls?: string[],
 *          windowDays: number, rangeDays: number}} params
 * @returns {{decision: 'reopen'|'holds', totalImpressions, minImpressions, threshold, urls}}
 */
function verifyResolution({ rows = [], language = 'default', knownUrls = [], windowDays, rangeDays }) {
  const known = new Set((knownUrls || []).map(normalizeUrlForCompare))

  // Agregar por URL: con dimensions:['page'] ya viene una fila por página, pero el
  // agregado deja la función a salvo de que la llamen con una dimensión extra.
  const byUrl = new Map()
  for (const row of rows) {
    const url = row?.url
    if (!url || !belongsToLanguage(url, language, known)) continue
    const e = byUrl.get(url) || { url, impressions: 0, clicks: 0 }
    e.impressions += row.impressions || 0
    e.clicks      += row.clicks || 0
    byUrl.set(url, e)
  }

  const urls = [...byUrl.values()]
  const totalImpressions = urls.reduce((s, u) => s + u.impressions, 0)
  const minImpressions   = proratedMinImpressions(windowDays, rangeDays)
  const threshold        = Math.max(MIN_URL_IMPRESSIONS, Math.ceil(totalImpressions * MIN_SHARE))

  const competing = urls
    .filter(u => u.impressions >= threshold)
    .sort((a, b) => b.impressions - a.impressions)
    .map(u => ({
      url: u.url,
      impressions: u.impressions,
      clicks: u.clicks,
      share: totalImpressions > 0 ? Math.round((u.impressions / totalImpressions) * 100) / 100 : 0,
    }))

  const back = totalImpressions >= minImpressions && competing.length >= 2
  return {
    decision: back ? 'reopen' : 'holds',
    totalImpressions,
    minImpressions,
    threshold,
    urls: competing,
  }
}

function parseJsonArray(value) {
  try {
    const parsed = JSON.parse(value || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch { return [] }
}

function parseJsonObject(value) {
  if (!value) return null
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch { return null }
}

/**
 * Forma pública de una fila de CannibalResolution: los JSON ya parseados y el autor
 * resuelto a un nombre (persona, o "persona vía agente"). Acepta la fila con o sin
 * las relaciones incluidas.
 */
function publicResolution(row) {
  if (!row) return null
  return {
    id:         row.id,
    query:      row.query,
    language:   row.language,
    action:     row.action,
    note:       row.note ?? null,
    status:     row.status,
    resolvedAt: row.resolvedAt,
    mainUrl:    row.mainUrl ?? null,
    urls:       parseJsonArray(row.urls),
    resolvedBy: row.resolvedBy?.name ?? null,
    agent:      row.resolvedByAgentName || row.resolvedByAgent?.label || null,
    lastCheckedAt:  row.lastCheckedAt ?? null,
    reopenedAt:     row.reopenedAt ?? null,
    reopenCount:    row.reopenCount ?? 0,
    reopenEvidence: parseJsonObject(row.reopenEvidence),
  }
}

/**
 * Aplica las resoluciones vigentes sobre los conflictos detectados por un reporte.
 * Se usa EN LECTURA (detalle del reporte, plan de acción) para que marcar un conflicto
 * como resuelto tenga efecto al instante, sin re-correr el análisis.
 *
 * Un conflicto `reopened` NO se oculta — volvió a estar abierto — pero se lleva el
 * historial del arreglo anterior para mostrarlo ("resuelto el X con 301 · volvió el Y").
 */
function splitByResolution(conflicts = [], resolutions = []) {
  const byKey = new Map((resolutions || []).map(r => [conflictKey(r.query, r.language), r]))
  const open = []
  const resolved = []

  for (const c of conflicts) {
    const row = byKey.get(conflictKey(c.query, c.language))
    if (!row) { open.push(c); continue }
    const resolution = publicResolution(row)
    if (row.status === 'resolved') resolved.push({ ...c, resolution })
    else open.push({ ...c, resolution })
  }

  return { open, resolved }
}

module.exports = {
  ACTIONS,
  MIN_VERIFY_DAYS,
  MIN_SHARE,
  MIN_URL_IMPRESSIONS,
  BASE_MIN_IMPRESSIONS,
  WINDOW_MIN_IMPRESSIONS,
  conflictKey,
  postFixWindow,
  proratedMinImpressions,
  verifyResolution,
  publicResolution,
  splitByResolution,
}
