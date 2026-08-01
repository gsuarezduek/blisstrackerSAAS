/**
 * Lectura cacheada de PlatformSetting con fallback a defaults del catálogo.
 *
 * Caché in-memory con TTL 60s + invalidación explícita on write. Los defaults
 * vienen de src/config/platformSettings.js y se aplican si la key no existe en
 * DB o si el valor persistido está fuera de bounds (defensa en profundidad).
 *
 * Valores siempre se guardan en DB con shape `{ value: ... }` para soportar
 * escalares y compuestos con un único shape consistente.
 */
const prisma = require('./prisma')
const { SETTINGS_BY_KEY, PLATFORM_SETTINGS } = require('../config/platformSettings')

const TTL_MS = 60 * 1000
const cache = new Map() // key → { value, expiresAt }

function clampToBounds(meta, value) {
  if (meta.type === 'integer' || meta.type === 'float') {
    if (typeof value !== 'number' || Number.isNaN(value)) return null
    if (meta.min != null && value < meta.min) return null
    if (meta.max != null && value > meta.max) return null
  }
  if (meta.type === 'boolean' && typeof value !== 'boolean') return null
  if (meta.type === 'string'  && typeof value !== 'string')  return null
  if (meta.type === 'pricingTiers') {
    if (!Array.isArray(value) || value.length === 0) return null
    for (const t of value) {
      if (!t || typeof t !== 'object') return null
      if (t.upTo !== null && (!Number.isInteger(t.upTo) || t.upTo <= 0)) return null
      if (typeof t.pricePerSeat !== 'number' || t.pricePerSeat < 0) return null
    }
  }
  return value
}

function unwrap(row, meta) {
  if (!row?.value) return meta.default
  const raw = row.value.value
  const clamped = clampToBounds(meta, raw)
  if (clamped == null && raw != null) {
    console.warn(`[platformSettings] Valor fuera de bounds para "${meta.key}": ${JSON.stringify(raw)} — usando default`)
    return meta.default
  }
  return raw ?? meta.default
}

async function getSetting(key) {
  const meta = SETTINGS_BY_KEY[key]
  if (!meta) throw new Error(`platformSettings: key desconocida "${key}"`)

  const cached = cache.get(key)
  if (cached && cached.expiresAt > Date.now()) return cached.value

  const row = await prisma.platformSetting.findUnique({ where: { key } })
  const value = unwrap(row, meta)
  cache.set(key, { value, expiresAt: Date.now() + TTL_MS })
  return value
}

async function getSettings(keys) {
  const now = Date.now()
  const result = {}
  const missing = []

  for (const key of keys) {
    if (!SETTINGS_BY_KEY[key]) throw new Error(`platformSettings: key desconocida "${key}"`)
    const cached = cache.get(key)
    if (cached && cached.expiresAt > now) result[key] = cached.value
    else missing.push(key)
  }

  if (missing.length > 0) {
    const rows = await prisma.platformSetting.findMany({ where: { key: { in: missing } } })
    const rowMap = Object.fromEntries(rows.map(r => [r.key, r]))
    for (const key of missing) {
      const meta = SETTINGS_BY_KEY[key]
      const value = unwrap(rowMap[key], meta)
      cache.set(key, { value, expiresAt: now + TTL_MS })
      result[key] = value
    }
  }

  return result
}

function invalidateCache() {
  cache.clear()
}

/**
 * Devuelve un snapshot completo de todos los settings (para la UI SuperAdmin).
 * No usa caché — siempre lee fresco para mostrar valores recién guardados.
 */
async function getAllSettings() {
  const rows = await prisma.platformSetting.findMany()
  const rowMap = Object.fromEntries(rows.map(r => [r.key, r]))

  return PLATFORM_SETTINGS.map(meta => ({
    key:         meta.key,
    label:       meta.label,
    help:        meta.help,
    type:        meta.type,
    group:       meta.group,
    default:     meta.default,
    min:         meta.min ?? null,
    max:         meta.max ?? null,
    value:       unwrap(rowMap[meta.key], meta),
    updatedAt:   rowMap[meta.key]?.updatedAt ?? null,
  }))
}

module.exports = {
  getSetting,
  getSettings,
  getAllSettings,
  invalidateCache,
  clampToBounds, // exportado para usar en validación del controller
}
