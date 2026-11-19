// Lógica pura de la importación de resúmenes de tarjeta (Finanzas → "+ Cargar"
// → Tarjeta). Sin DB ni red: la usan el controller (cardStatements.controller.js)
// y el servicio que lee el PDF (services/finance/cardStatementParser.service.js).
const crypto = require('crypto')
const { toDecimal } = require('./financeMoney')

// Qué es cada renglón del resumen. `payment` (el pago del resumen anterior) se
// muestra pero nunca se importa: esa plata ya salió del banco con su propio
// movimiento.
const LINE_KINDS = ['purchase', 'charge', 'credit', 'payment']
const IMPORTABLE_KINDS = ['purchase', 'charge', 'credit']
const CURRENCIES = ['ARS', 'USD']

/** Un consumo o cargo es un egreso; una bonificación/devolución, un ingreso. */
function movementTypeForKind(kind) {
  return kind === 'credit' ? 'income' : 'expense'
}

// Palabras que no identifican al comercio.
const NOISE_TOKENS = new Set(['USD', 'U$S', 'US$', 'ARS'])

/**
 * Clave estable de un comercio a partir del detalle del renglón: es la llave de
 * la memoria de categorías y de la agrupación. Saca lo que cambia de un mes al
 * otro para el mismo comercio — códigos de transacción (`FACEBK *N7RA77W5V4`),
 * referencias de factura (`in1UQSeoBUSD`), números de cuota, montos, porcentajes —
 * con una regla simple: se descarta todo token que tenga algún dígito.
 *
 *   "FACEBK *N7RA77W5V4"                  → "FACEBK"
 *   "CURSOR, AI POWER in1UQSeoBUSD"       → "CURSOR AI POWER"
 *   "LA SEGUNDA COO0452380-01/06-000-014" → "LA SEGUNDA"
 *   "IVA RG 4240 21%( 719254,28)"         → "IVA RG"
 */
function normalizeMerchantKey(description) {
  const upper = String(description || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/\*/g, ' ')
  const tokens = upper.split(/[\s,;]+/)
    .map(t => t.replace(/^[^A-Z0-9]+|[^A-Z0-9]+$/g, ''))
    .filter(t => t && !/\d/.test(t) && !NOISE_TOKENS.has(t))
  const key = tokens.join(' ').trim()
  return key || upper.replace(/\s+/g, ' ').trim().slice(0, 60)
}

// Por debajo de este largo, una clave no alcanza para matchear por prefijo
// ("LA" no puede decidir entre "LA SEGUNDA" y "LA NACION").
const MIN_PREFIX_KEY_LENGTH = 5

/**
 * Busca la regla de memoria que corresponde a una clave: primero exacta, si no
 * por prefijo (el mismo comercio aparece como "CURSOR AI POWERED IDE" y como
 * "CURSOR AI POWER" según cómo lo corte el banco). Entre varias, gana la más
 * larga — la más específica. `rules` = [{ merchantKey, ... }].
 */
function findRuleForKey(rules, key) {
  const exact = rules.find(r => r.merchantKey === key)
  if (exact) return exact
  let best = null
  for (const r of rules) {
    const shorter = r.merchantKey.length <= key.length ? r.merchantKey : key
    if (shorter.length < MIN_PREFIX_KEY_LENGTH) continue
    if (key.startsWith(r.merchantKey) || r.merchantKey.startsWith(key)) {
      if (!best || r.merchantKey.length > best.merchantKey.length) best = r
    }
  }
  return best
}

/** "1.234,56" / "1234.56" / 1234.56 → Decimal positivo con 2 decimales, o null. */
function parseAmount(value) {
  if (value == null) return null
  let s = String(value).trim().replace(/[^\d.,-]/g, '')
  if (!s) return null
  // Formato argentino: el último separador que aparezca es el decimal.
  const lastComma = s.lastIndexOf(',')
  const lastDot = s.lastIndexOf('.')
  if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.')
  else s = s.replace(/,/g, '')
  try {
    const d = toDecimal(s).abs()
    return d.isFinite() ? d.toDecimalPlaces(2) : null
  } catch { return null }
}

/** "YYYY-MM-DD" válida → el mismo string; cualquier otra cosa → null. */
function normalizeDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const d = new Date(`${value}T12:00:00Z`)
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value ? null : value
}

/**
 * Limpia los renglones que devolvió el lector del PDF: descarta los que no
 * tienen fecha, monto o moneda válidos (y lo cuenta), y les pone una huella.
 *
 * La huella identifica el renglón entre resúmenes: fecha + comprobante +
 * moneda + monto + detalle + tipo. Si un mismo resumen trae dos renglones
 * idénticos (dos cargos iguales el mismo día sin comprobante), el segundo
 * lleva "#2" — así no se toma como duplicado del primero, y al volver a subir
 * el mismo PDF los dos se reconocen.
 */
function sanitizeLines(rawLines) {
  const lines = []
  let dropped = 0
  const seen = new Map()
  for (const raw of Array.isArray(rawLines) ? rawLines : []) {
    const date = normalizeDate(raw?.date)
    const amount = parseAmount(raw?.amount)
    const currency = CURRENCIES.includes(raw?.currency) ? raw.currency : null
    const kind = LINE_KINDS.includes(raw?.kind) ? raw.kind : null
    const description = String(raw?.description || '').replace(/\s+/g, ' ').trim()
    if (!date || !amount || amount.isZero() || !currency || !kind || !description) { dropped++; continue }
    const voucher = raw?.voucher ? String(raw.voucher).trim() || null : null
    const installment = raw?.installment ? String(raw.installment).trim() || null : null
    const base = [date, voucher || '', currency, amount.toFixed(2), description.toUpperCase(), kind].join('|')
    const n = (seen.get(base) || 0) + 1
    seen.set(base, n)
    const fingerprint = crypto.createHash('sha1').update(n > 1 ? `${base}#${n}` : base).digest('hex')
    lines.push({
      date, description, voucher, installment, currency, kind,
      amount: amount.toFixed(2),
      merchantKey: normalizeMerchantKey(description),
      fingerprint,
    })
  }
  return { lines, dropped }
}

/**
 * Control de que el lector no se salteó ni inventó renglones: por moneda,
 * saldo anterior + consumos + cargos − créditos − pagos tiene que dar el saldo
 * actual que imprime el banco. Usa TODOS los renglones leídos (incluidos los
 * pagos y los ya importados), no solo los que se van a importar.
 *
 * Devuelve [{ currency, previous, current, computed, diff, ok }] — `ok: null`
 * cuando el resumen no traía alguno de los dos saldos (no se puede controlar).
 */
function checkTotals(lines, balances) {
  const out = []
  for (const currency of CURRENCIES) {
    const bal = (Array.isArray(balances) ? balances : []).find(b => b?.currency === currency) || {}
    const currencyLines = lines.filter(l => l.currency === currency)
    const previous = parseSignedAmount(bal.previousBalance)
    const current = parseSignedAmount(bal.currentBalance)
    if (currencyLines.length === 0 && (current == null || current.isZero())) continue
    let movement = toDecimal(0)
    for (const l of currencyLines) {
      const a = toDecimal(l.amount)
      movement = (l.kind === 'purchase' || l.kind === 'charge') ? movement.plus(a) : movement.minus(a)
    }
    if (previous == null || current == null) {
      out.push({ currency, previous: previous?.toFixed(2) ?? null, current: current?.toFixed(2) ?? null, computed: null, diff: null, ok: null })
      continue
    }
    const computed = previous.plus(movement)
    const diff = current.minus(computed)
    out.push({
      currency, previous: previous.toFixed(2), current: current.toFixed(2),
      computed: computed.toFixed(2), diff: diff.toFixed(2),
      // Un centavo de tolerancia por redondeos del propio banco.
      ok: diff.abs().lessThanOrEqualTo(0.01),
    })
  }
  return out
}

// Los saldos sí pueden ser negativos (saldo a favor).
function parseSignedAmount(value) {
  if (value == null || value === '') return null
  const negative = /^\s*-|-\s*$/.test(String(value))
  const abs = parseAmount(value)
  if (abs == null) return null
  return negative ? abs.negated() : abs
}

/**
 * Agrupa los renglones importables por comercio + moneda + tipo de
 * movimiento: los 35 consumos de FACEBK del mes son un solo egreso. Los grupos
 * salen ordenados por monto total descendente (lo que más pesa, primero).
 */
function groupLines(lines) {
  const groups = new Map()
  for (const l of lines) {
    if (!IMPORTABLE_KINDS.includes(l.kind)) continue
    const type = movementTypeForKind(l.kind)
    const id = `${l.merchantKey}|${l.currency}|${type}`
    if (!groups.has(id)) groups.set(id, { id, merchantKey: l.merchantKey, currency: l.currency, type, lines: [], total: toDecimal(0) })
    const g = groups.get(id)
    g.lines.push(l)
    g.total = g.total.plus(toDecimal(l.amount))
  }
  return [...groups.values()]
    .map(g => ({ ...g, total: g.total.toFixed(2) }))
    .sort((a, b) => toDecimal(b.total).comparedTo(toDecimal(a.total)))
}

/** Nota del movimiento: qué renglones del resumen lo forman. */
function movementNote(cardName, lines) {
  if (lines.length === 1) {
    const l = lines[0]
    return `${cardName} · ${l.description}${l.installment ? ` (cuota ${l.installment})` : ''}`
  }
  const dates = lines.map(l => l.date).sort()
  const fmt = d => `${d.slice(8, 10)}/${d.slice(5, 7)}`
  return `${cardName} · ${lines.length} renglones de ${normalizeMerchantKey(lines[0].description)} del ${fmt(dates[0])} al ${fmt(dates[dates.length - 1])}`
}

module.exports = {
  LINE_KINDS, IMPORTABLE_KINDS, CURRENCIES, MIN_PREFIX_KEY_LENGTH,
  movementTypeForKind, normalizeMerchantKey, findRuleForKey, parseAmount, normalizeDate,
  sanitizeLines, checkTotals, groupLines, movementNote,
}
