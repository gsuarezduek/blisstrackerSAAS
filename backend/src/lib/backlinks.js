// Lógica pura de backlinks: identidad de URL y dominio, lectura del rel, el
// veredicto de un chequeo y la histéresis de pérdida. Sin prisma y sin red, para
// que todo esto sea testeable con HTML fijo (tests/unit/backlinks.lib.test.js).
//
// La identidad de una URL se delega en `normalizeUrlForCompare` de
// cannibalAnalysis.js: es el mismo criterio que ya usan Canibalización y el
// inventario del blog, y dos criterios distintos de "la misma URL" en el mismo
// producto significan un enlace duplicado o un cruce que no matchea.
const { normalizeUrlForCompare } = require('./cannibalAnalysis')
const { extractDomain } = require('../services/serpApi.service')

// Parámetros de rastreo que no cambian el recurso: si no se van, el mismo enlace
// compartido con utm distinto entra dos veces y rompe la idempotencia del import.
const TRACKING_PARAMS = /^(utm_|gclid$|fbclid$|msclkid$|mc_cid$|mc_eid$|igshid$|ref$|ref_src$)/i

// Postgres rompe el insert cuando una entrada de índice btree pasa de ~2.7 kB, y
// `sourceUrl` es parte de un UNIQUE. Lo que se trunca queda en `notes`.
const MAX_URL_LENGTH = 1000

const LINK_TYPES = ['follow', 'nofollow', 'sponsored', 'ugc', 'unknown']
const LINK_STATUSES = ['sin_verificar', 'activo', 'perdido', 'roto', 'redirigido', 'no_verificable']
const CHECK_STATUSES = ['activo', 'sin_link', 'roto', 'redirigido', 'bloqueado', 'error']
const PLACEMENTS = ['editorial', 'directorio', 'guest_post', 'foro', 'prensa', 'perfil', 'otro']
const VERDICTS = ['sin_evaluar', 'conseguible', 'no_conseguible', 'no_vale_la_pena']
const PIPELINE_STATUSES = ['sin_empezar', 'contactado', 'negociando', 'conseguido', 'descartado']

// Cuántos chequeos fallidos CONSECUTIVOS hacen falta para dar un enlace por
// perdido. Dos y no uno porque `lostLinks` va al informe del cliente y un 503 de
// un martes no es un enlace perdido: el falso "se cayó el enlace" es el riesgo
// que quema la confianza en toda la feature.
const FAILURES_TO_LOSE = 2

/**
 * Identidad de un backlink: la URL de la página que nos enlaza, normalizada.
 * Devuelve `{ url, truncated }` — `url` es null si no se pudo parsear.
 */
function normalizeLinkUrl(raw) {
  const text = String(raw || '').trim()
  if (!text) return { url: null, truncated: false }

  let url
  try {
    url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`)
  } catch {
    return { url: null, truncated: false }
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return { url: null, truncated: false }

  url.hash = ''
  for (const key of [...url.searchParams.keys()]) {
    if (TRACKING_PARAMS.test(key)) url.searchParams.delete(key)
  }
  url.host = url.host.toLowerCase().replace(/^www\./, '')
  url.pathname = url.pathname.replace(/\/{2,}/g, '/').replace(/\/+$/, '') || '/'

  const full = url.toString()
  return full.length > MAX_URL_LENGTH
    ? { url: full.slice(0, MAX_URL_LENGTH), truncated: true }
    : { url: full, truncated: false }
}

/** Host sin www ni protocolo — la unidad de agrupación y de cruce. */
function linkDomain(url) {
  return extractDomain(url)
}

/**
 * ¿Este host es nuestro? Acepta subdominios (`blog.cliente.com` cuenta para
 * `cliente.com`) pero NO un dominio que apenas termine parecido: `nocliente.com`
 * no es `cliente.com`, y sin el punto el `endsWith` los confundiría.
 */
function isOwnDomain(host, ownDomain) {
  if (!host || !ownDomain) return false
  const a = String(host).toLowerCase().replace(/^www\./, '')
  const b = String(ownDomain).toLowerCase().replace(/^www\./, '')
  return a === b || a.endsWith(`.${b}`)
}

/**
 * Qué tipo de enlace declara el atributo `rel`. Prioridad sponsored > ugc >
 * nofollow: un enlace pago marcado "sponsored nofollow" es pago, y eso es lo que
 * importa para saber si transmite autoridad. Sin `rel` es `follow`.
 */
function linkTypeFromRel(rel) {
  const value = String(rel || '').toLowerCase()
  if (!value.trim()) return 'follow'
  if (/\bsponsored\b/.test(value)) return 'sponsored'
  if (/\bugc\b/.test(value)) return 'ugc'
  if (/\bnofollow\b/.test(value)) return 'nofollow'
  return 'follow'
}

/**
 * Veredicto CRUDO de un chequeo, antes de la histéresis.
 *
 * `bloqueado` existe porque muchos medios devuelven 403/429 a un UA desconocido:
 * el enlace puede seguir ahí y lo que falló es nuestro acceso. Es el motivo de que
 * el vocabulario del chequeo tenga un valor más que el del enlace.
 */
function checkVerdict({ found, httpStatus, redirectedToHost, ownDomain, error }) {
  if (error) return 'error'
  if (httpStatus === 403 || httpStatus === 429) return 'bloqueado'
  if (typeof httpStatus === 'number' && httpStatus >= 400) return 'roto'
  if (found) return 'activo'
  // Redirigido solo cuenta si el destino es OTRO sitio: un http→https o un
  // trailing slash no son una mudanza, y marcarlos movería enlaces que están bien.
  if (redirectedToHost && !isOwnDomain(redirectedToHost, ownDomain)) return 'redirigido'
  return 'sin_link'
}

/**
 * El estado que queda en la fila después de un chequeo, aplicando la histéresis.
 *
 * - `bloqueado` y `error` NO mueven el estado ni cuentan como fallo: no son
 *   evidencia de que el enlace se haya caído.
 * - Un fallo aislado solo incrementa el contador. Recién el segundo consecutivo
 *   sella `lostAt`, que es lo que el informe del cliente cuenta como perdido.
 * - Un chequeo exitoso resetea el contador y limpia `lostAt`: el enlace volvió.
 */
function nextLinkState(current, check) {
  const failures = current?.checkFailures ?? 0

  if (check.status === 'bloqueado' || check.status === 'error') {
    return { status: current?.status ?? 'sin_verificar', checkFailures: failures, lostAt: current?.lostAt ?? null }
  }
  if (check.status === 'activo') {
    return { status: 'activo', checkFailures: 0, lostAt: null }
  }

  const next = failures + 1
  if (next < FAILURES_TO_LOSE) {
    // Todavía no es una pérdida: se conserva el estado anterior para no mostrar
    // "perdido" en la UI por un fallo que puede ser nuestro.
    return { status: current?.status ?? 'sin_verificar', checkFailures: next, lostAt: current?.lostAt ?? null }
  }
  const status = check.status === 'roto' ? 'roto' : check.status === 'redirigido' ? 'redirigido' : 'perdido'
  return { status, checkFailures: next, lostAt: current?.lostAt ?? new Date() }
}

/** Los contadores vivos del perfil, derivados del inventario de enlaces. */
function profileFromLinks(links) {
  const list = Array.isArray(links) ? links : []
  const active = list.filter(l => l.status === 'activo')
  const rated = active.filter(l => typeof l.domainRating === 'number')
  return {
    activeLinks:      active.length,
    referringDomains: new Set(active.map(l => l.sourceDomain).filter(Boolean)).size,
    followLinks:      active.filter(l => l.linkType === 'follow').length,
    lostLinks:        list.filter(l => l.status === 'perdido').length,
    avgDomainRating:  rated.length
      ? Math.round((rated.reduce((acc, l) => acc + l.domainRating, 0) / rated.length) * 10) / 10
      : null,
  }
}

/**
 * Enlaces ganados y perdidos DENTRO de un mes ("YYYY-MM"), para el snapshot.
 * Un enlace sin `firstSeenAt` no cuenta como nuevo: no sabemos desde cuándo existe,
 * y asumir que nació el día que se cargó inflaría el mes de la importación.
 */
function monthCounts(links, month) {
  const inMonth = date => !!date && toMonth(date) === month
  const list = Array.isArray(links) ? links : []
  return {
    newLinks:  list.filter(l => inMonth(l.firstSeenAt)).length,
    lostLinks: list.filter(l => inMonth(l.lostAt)).length,
  }
}

function toMonth(date) {
  const d = date instanceof Date ? date : new Date(date)
  if (Number.isNaN(d.getTime())) return null
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

/**
 * El estado único que ve el usuario en un prospecto: "ya lo tenemos" es un HECHO
 * del cruce automático y gana sobre el veredicto, que es una opinión. Se resuelve
 * en la lectura y no en la escritura justamente para que el cruce pueda correr
 * cuantas veces quiera sin destruir la opinión (ver el modelo en schema.prisma).
 */
function effectiveVerdict(prospect) {
  if (prospect?.alreadyLinked) return 'ya_lo_tenemos'
  return prospect?.verdict || 'sin_evaluar'
}

/**
 * El dominio de un prospecto, que es su IDENTIDAD (`@@unique [projectId, domain]`).
 * Acepta lo que una persona escribe de verdad: "diario.com", "www.Diario.com/notas"
 * o la URL completa pegada del navegador. Devuelve null si no se puede leer un host.
 */
function prospectDomain(raw) {
  const { url } = normalizeLinkUrl(raw)
  return url ? linkDomain(url) : null
}

/**
 * Agrupa las filas de un export de competencia POR DOMINIO.
 *
 * Es la razón de que el prospecto sea un dominio y no una página: la decisión
 * ("¿podemos conseguir un enlace de este sitio?") se toma una vez por sitio, y un
 * export de Ahrefs de un competidor son miles de filas de página para esa única
 * decisión.
 *
 * `links` es la cantidad de páginas de ese dominio que enlazan al competidor, que
 * es la señal de prioridad. El DR y el tráfico se toman como el MÁXIMO visto y no
 * como el de la primera fila: son atributos del dominio y no de la página, y
 * distintas filas del mismo export pueden traerlos incompletos.
 */
function aggregateProspects(rows) {
  const byDomain = new Map()

  for (const row of rows || []) {
    const domain = row?.sourceDomain
    if (!domain) continue

    let item = byDomain.get(domain)
    if (!item) {
      item = {
        domain, links: 0,
        exampleUrl: null, exampleAnchor: null,
        domainRating: null, traffic: null, language: null,
      }
      byDomain.set(domain, item)
    }

    item.links += 1
    // Como ejemplo sirve más una página concreta que la home: una fila de Search
    // Console trae `https://dominio` sintético y no dice nada que no diga el dominio.
    if (row.sourceUrl && (!item.exampleUrl || (isBareUrl(item.exampleUrl) && !isBareUrl(row.sourceUrl)))) {
      item.exampleUrl = row.sourceUrl
    }
    if (!item.exampleAnchor && row.anchor) item.exampleAnchor = row.anchor
    if (row.domainRating != null) item.domainRating = Math.max(item.domainRating ?? 0, row.domainRating)
    if (row.traffic != null)      item.traffic      = Math.max(item.traffic ?? 0, row.traffic)
    if (!item.language && row.language) item.language = row.language
  }

  // Más páginas enlazando = mejor señal, así el preview y la tabla muestran
  // primero lo que vale la pena mirar.
  return [...byDomain.values()].sort((a, b) => b.links - a.links || a.domain.localeCompare(b.domain))
}

function isBareUrl(url) {
  return /^https?:\/\/[^/]+\/?$/i.test(String(url || ''))
}

/**
 * La evidencia de un prospecto: a qué competidores enlaza y con cuántas páginas.
 *
 * Se guarda el desglose POR competidor y no un total suelto para que re-importar
 * el mismo export sea idempotente: la entrada de ese competidor se REEMPLAZA en
 * vez de sumarse. Con un contador plano, importar dos veces el archivo de un
 * competidor duplicaba la señal de prioridad del dominio.
 *
 * `links: 0` o un dominio vacío borran la entrada — así se puede deshacer la
 * atribución a un competidor sin tocar el resto.
 */
function mergeCompetitorEvidence(existing, entry) {
  const list = parseCompetitors(existing)
  if (!entry?.domain) return list

  const domain = String(entry.domain).toLowerCase().replace(/^www\./, '')
  const links = Number(entry.links) || 0
  const rest = list.filter(c => c.domain !== domain)
  if (links <= 0) return rest
  return [...rest, { domain, links }].sort((a, b) => b.links - a.links || a.domain.localeCompare(b.domain))
}

/** Lee la columna `competitors`, que es JSON en texto. Nunca lanza. */
function parseCompetitors(value) {
  if (Array.isArray(value)) return value.filter(c => c?.domain).map(c => ({ domain: c.domain, links: Number(c.links) || 0 }))
  try {
    const parsed = JSON.parse(value || '[]')
    if (!Array.isArray(parsed)) return []
    return parsed
      .map(c => (typeof c === 'string' ? { domain: c, links: 0 } : c))
      .filter(c => c?.domain)
      .map(c => ({ domain: String(c.domain), links: Number(c.links) || 0 }))
  } catch { return [] }
}

/** El total derivado de la evidencia: nunca se escribe a mano en dos lugares. */
function competitorLinkTotal(list) {
  return parseCompetitors(list).reduce((sum, c) => sum + c.links, 0)
}

module.exports = {
  normalizeLinkUrl,
  linkDomain,
  isOwnDomain,
  linkTypeFromRel,
  checkVerdict,
  nextLinkState,
  profileFromLinks,
  monthCounts,
  effectiveVerdict,
  prospectDomain,
  aggregateProspects,
  mergeCompetitorEvidence,
  parseCompetitors,
  competitorLinkTotal,
  LINK_TYPES,
  LINK_STATUSES,
  CHECK_STATUSES,
  PLACEMENTS,
  VERDICTS,
  PIPELINE_STATUSES,
  FAILURES_TO_LOSE,
  MAX_URL_LENGTH,
}
