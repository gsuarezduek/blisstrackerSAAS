const axios = require('axios')
const { sendPlatformNotification, platformCard } = require('../email.service')
const { getActiveApifyTokens, recordApifyTokenResult } = require('../../lib/apifyTokens')
const { logApifyUsage } = require('../../lib/logApifyUsage')

/**
 * Motor de scraping de redes sociales — abstraído por proveedor.
 *
 * Proveedor actual: Apify (https://apify.com). Requiere APIFY_API_TOKEN (+ hasta 3
 *   tokens de respaldo opcionales APIFY_API_TOKEN2/3/4 — ver `getApifyTokens`/
 *   `runApifyActor`: si un token falla — HTTP error o dataset con item `{error}`,
 *   ej. sin crédito — se reintenta automáticamente con el siguiente en orden).
 *
 * Todas las funciones de red devuelven datos en el MISMO shape que el fetch oficial
 * de cada red (fetchInstagramMetrics / fetchLinkedinMetrics) para reutilizar vistas,
 * snapshots e informes existentes. Lo que el scraping no puede ver (insights
 * privados) queda en null.
 */

const APIFY_BASE = 'https://api.apify.com/v2'

function scrapeError(message, code, status = 400) {
  const err = new Error(message)
  err.code = code
  err.status = status
  return err
}

/**
 * Tokens de Apify disponibles, en orden de prioridad: los configurados desde
 * SuperAdmin → Scraping (`ApifyToken`, cifrados en DB), o si no hay ninguno
 * activo, fallback a las env vars legacy (APIFY_API_TOKEN + hasta 3 de respaldo
 * APIFY_API_TOKEN2/3/4). Devuelve `[{ id, label, token }]` — `id` es `null` para
 * los de fallback por env var. Permite seguir scrapeando si una cuenta se queda
 * sin crédito o el token deja de ser válido, sin intervención manual.
 * Async — todo caller debe hacer `await`.
 */
async function getApifyTokens() {
  return getActiveApifyTokens()
}

/**
 * Corre un actor de Apify (run-sync-get-dataset-items) probando los `tokens` en
 * orden: si uno falla (error HTTP — token inválido, sin crédito, etc.) prueba el
 * siguiente antes de darse por vencido. Si se pasa `isDatasetError`, también se
 * usa para detectar fallas "silenciosas" (HTTP 200 pero el dataset trae un item
 * `{ error: "..." }`, como "sin crédito" en algunos actores) y reintentar con el
 * siguiente token — salvo que sea el último, en cuyo caso se devuelven los items
 * tal cual para que el caller decida (mismo comportamiento que antes de tener
 * fallback, para no romper el manejo de error existente).
 * Asume que ya se validó `tokens.length > 0`. `tokens` es `[{id,label,token}]`
 * (ver `getApifyTokens`). Tras cada intento (éxito, o fallo si es el último token)
 * registra el consumo en ApifyUsageLog vía `attribution` — fire-and-forget, nunca
 * bloquea ni retrasa el scrape real.
 */
async function runApifyActor(actorId, input, { tokens, timeout = 180000, isDatasetError, attribution = {} } = {}) {
  const url = `${APIFY_BASE}/acts/${actorId}/run-sync-get-dataset-items`
  let lastErr = null

  const logAttempt = (t, success, itemCount, errorMsg) => {
    logApifyUsage({ ...attribution, tokenId: t.id, tokenLabel: t.label, success, itemCount, errorMsg }).catch(() => {})
    recordApifyTokenResult(t.id, { success, errorMsg }).catch(() => {})
  }

  for (let i = 0; i < tokens.length; i++) {
    const isLast = i === tokens.length - 1
    try {
      const { data } = await axios.post(url, input, { params: { token: tokens[i].token }, timeout })
      const items = Array.isArray(data) ? data : []
      const datasetErrMsg = isDatasetError ? isDatasetError(items) : null
      if (datasetErrMsg && !isLast) {
        console.warn(`[Scrape] Apify token #${i + 1}/${tokens.length} sin datos usables (${datasetErrMsg}), reintentando con el siguiente token...`)
        lastErr = new Error(datasetErrMsg)
        logAttempt(tokens[i], false, null, datasetErrMsg)
        continue
      }
      logAttempt(tokens[i], !datasetErrMsg, items.length, datasetErrMsg)
      return items
    } catch (err) {
      lastErr = err
      const msg = err.response?.data?.error?.message || err.message
      logAttempt(tokens[i], false, null, msg)
      if (!isLast) {
        console.warn(`[Scrape] Apify token #${i + 1}/${tokens.length} falló (${msg}), reintentando con el siguiente token...`)
        continue
      }
    }
  }
  throw lastErr
}

/**
 * Algunos actores de Apify no devuelven HTTP error: meten un item `{ error: "..." }`
 * en el dataset (ej. "You have used up your credits"). Usado como `isDatasetError`
 * de `runApifyActor` para que ese caso también dispare el fallback al siguiente
 * token en vez de contarse como "0 datos".
 */
function detectApifyDatasetError(items) {
  const errItem   = items.find(i => i && typeof i === 'object' && typeof i.error === 'string')
  const hasUsable = items.some(i => i && typeof i === 'object' && !i.error)
  return (errItem && !hasUsable) ? errItem.error : null
}

// Aviso de error de scraping al equipo BlissTracker (casilla platformAdminEmail).
// Throttle in-memory: a lo sumo un aviso por código cada 6h, para no saturar la
// casilla cuando el cron mensual itera muchas cuentas con el mismo problema
// (ej. la cuenta de Apify sin crédito falla en todas). Se resetea al reiniciar.
// El Map es una única instancia compartida por las 3 redes (no una copia por
// archivo) — mismo cooldown para IG/LinkedIn/Facebook por diseño, no un bug.
const SCRAPE_ALERT_COOLDOWN_MS = 6 * 60 * 60 * 1000
const lastScrapeAlertAt = new Map() // code → timestamp ms

function alertScrapeFailure({ code, detail, username, workspaceId = null, actionLabel = null }) {
  const now  = Date.now()
  const last = lastScrapeAlertAt.get(code) || 0
  if (now - last < SCRAPE_ALERT_COOLDOWN_MS) return
  lastScrapeAlertAt.set(code, now)

  const subject = '⚠️ Error de scraping de RRSS (Apify) — BlissTracker'
  const bodyHtml = `
    <p style="color:#475569;margin:0 0 8px;">El scraping de redes sociales falló. Mientras no se resuelva, las métricas de Instagram y de competidores no se van a actualizar.</p>
    ${platformCard('Detalle del error', [
      ['Proveedor', 'Apify'],
      ['Tipo', code],
      ['Cuenta', username ? `@${username}` : '—'],
      ['Contexto', actionLabel],
      ['Mensaje', detail],
    ], '#dc2626')}
    <p style="color:#94a3b8;font-size:13px;margin:12px 0 0;">Ya se probaron todos los tokens de Apify configurados (<code>APIFY_API_TOKEN</code> + respaldo) sin éxito — revisá el saldo de esas cuentas. Para no saturar, este aviso se manda como máximo una vez cada 6 horas por tipo de error.</p>
  `
  // Fire-and-forget: sendPlatformNotification ya es no-op si la casilla está vacía
  // o el toggle está apagado, y nunca lanza.
  sendPlatformNotification('scrapeError', { subject, bodyHtml, workspaceId })
    .catch(err => console.error('[Scrape] No se pudo enviar el aviso de error:', err.message))
}

/**
 * Extrae y valida un handle/slug de una URL o input crudo: matchea urlRegex contra
 * el input (si matchea, usa el grupo capturado), quita "@" y query/hash residual,
 * valida el resultado contra charsetRegex. Devuelve null si no matchea. Compartido
 * por los 3 parsers de red social (Instagram/LinkedIn/Facebook), que solo difieren
 * en su regex de URL y el charset válido de su handle/slug.
 */
function parseSocialHandle(input, { urlRegex, charsetRegex }) {
  if (!input) return null
  let s = String(input).trim()
  if (!s) return null
  const urlMatch = s.match(urlRegex)
  if (urlMatch) s = urlMatch[1]
  s = s.replace(/^@/, '').replace(/[/?#].*$/, '').trim()
  if (!charsetRegex.test(s)) return null
  return s.toLowerCase()
}

// Devuelve el primer valor no nulo/no vacío entre varios nombres de campo posibles
// (los actores de LinkedIn/Facebook de Apify no comparten un esquema único).
function pick(obj, keys) {
  if (!obj) return null
  for (const k of keys) {
    if (obj[k] != null && obj[k] !== '') return obj[k]
  }
  return null
}

// Convierte un conteo a número, tolerando strings como "1,234", "12K" o "1.2M".
function toCount(v) {
  if (v == null) return 0
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0
  const s = String(v).trim().replace(/,/g, '')
  const m = s.match(/^([\d.]+)\s*([KkMm])?/)
  if (!m) return 0
  let n = parseFloat(m[1])
  if (!Number.isFinite(n)) return 0
  const suffix = m[2]?.toLowerCase()
  if (suffix === 'k') n *= 1e3
  if (suffix === 'm') n *= 1e6
  return Math.round(n)
}

/**
 * Normaliza un post crudo de un actor de Apify a un shape fijo de campos, resolviendo
 * cada campo contra una lista de alias posibles (los actores de LinkedIn/Facebook no
 * comparten un esquema único). `fields`: { outKey: { aliases, count?, default? } }.
 * `count: true` pasa el valor por toCount(); si no hay match, usa `default` (o null).
 */
function normalizeGenericPost(p, fields) {
  const out = {}
  for (const [key, cfg] of Object.entries(fields)) {
    const raw = pick(p, cfg.aliases)
    out[key] = cfg.count ? toCount(raw) : (raw ?? (cfg.default !== undefined ? cfg.default : null))
  }
  return out
}

module.exports = {
  APIFY_BASE,
  scrapeError,
  getApifyTokens,
  runApifyActor,
  detectApifyDatasetError,
  alertScrapeFailure,
  parseSocialHandle,
  pick,
  toCount,
  normalizeGenericPost,
}
