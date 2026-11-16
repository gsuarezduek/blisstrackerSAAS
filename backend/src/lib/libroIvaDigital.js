/**
 * Libro IVA Digital (RG 4597, ARCA) — VENTAS. Arma los dos archivos de texto de
 * longitud fija que importa el sitio de ARCA y que leen Tango, Holistor, etc.:
 *
 *   CBTE (266 caracteres por línea, uno por comprobante) y
 *   ALICUOTAS (62 por línea, una por cada alícuota de cada comprobante).
 *
 * Funciones puras: reciben el IssuedVoucher del SDK `facturas` (lo que ARCA
 * AUTORIZÓ, cacheado en FinanceInvoice.arcaResponseRaw.voucher) y el nombre del
 * receptor. No se recalcula nada: el código de comprobante, el documento del
 * comprador, la moneda y el desglose por alícuota (`totals.vatRates`, cuyo `id`
 * es el mismo código de alícuota que pide el libro) son los que ARCA aprobó, en
 * centavos. Si el libro y el CAE no coinciden, ARCA rechaza la presentación.
 *
 * Archivos en Windows-1252 con fin de línea CRLF (lo que espera el importador).
 */

const CBTE_LINE_LENGTH = 266
const ALICUOTA_LINE_LENGTH = 62
const NAME_LENGTH = 30

function fail(message) {
  throw Object.assign(new Error(message), { status: 400, isOperational: true })
}

// Entero no negativo → N dígitos con ceros a la izquierda. Un valor que no entra
// es un error, nunca un recorte: un monto truncado presentado ante ARCA es peor
// que no poder generar el archivo.
function num(value, width, field) {
  const n = Number(value ?? 0)
  if (!Number.isInteger(n) || n < 0) fail(`${field}: valor inválido (${value}).`)
  const s = String(n)
  if (s.length > width) fail(`${field}: no entra en ${width} dígitos (${value}).`)
  return s.padStart(width, '0')
}

// Documento del comprador: solo dígitos (un CUIT puede venir con guiones).
function digits(value, width, field) {
  const s = String(value ?? '').replace(/\D/g, '') || '0'
  if (s.length > width) fail(`${field}: no entra en ${width} dígitos (${value}).`)
  return s.padStart(width, '0')
}

// "2026-10-01" → "20261001"; sin fecha → "00000000".
function ymd(value) {
  if (!value) return '00000000'
  const s = String(value).slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) fail(`Fecha inválida (${value}).`)
  return s.replace(/-/g, '')
}

// Tipo de cambio: 4 enteros + 6 decimales ("1" → "0001000000"). Se arma desde
// el string decimal exacto que guarda el SDK, sin pasar por float.
function exchangeRate(value) {
  const s = String(value ?? '1').trim()
  const m = /^(\d+)(?:\.(\d+))?$/.exec(s)
  if (!m) fail(`Tipo de cambio inválido (${value}).`)
  const int = m[1].replace(/^0+(?=\d)/, '')
  if (int.length > 4) fail(`Tipo de cambio fuera de rango (${value}).`)
  return int.padStart(4, '0') + (m[2] || '').slice(0, 6).padEnd(6, '0')
}

// Nombre del comprador: 30 caracteres, un byte por carácter en Windows-1252.
// Las letras del español (ñ, tildes, ü) existen en Windows-1252 y quedan tal
// cual; lo que no (comillas tipográficas, emoji, otros alfabetos) se reemplaza,
// porque un carácter de dos bytes corre todos los campos siguientes de la línea.
function name(value) {
  const cleaned = String(value || '')
    .normalize('NFC')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/[^ -~ -ÿ]/g, ch => ch.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^ -~]/g, '') || '?')
    .replace(/\s+/g, ' ')
    .trim()
  return cleaned.slice(0, NAME_LENGTH).padEnd(NAME_LENGTH, ' ')
}

/**
 * Código de operación (campo 20). Va en blanco salvo que el comprobante no
 * tenga IVA liquidado y sí importes exentos o no gravados — ahí ARCA pide
 * decir de qué se trata (E = exentas, N = no gravado).
 */
function operationCode(totals) {
  if (Number(totals.vat || 0) !== 0) return ' '
  if (Number(totals.exempt || 0) > 0) return 'E'
  if (Number(totals.untaxed || 0) > 0) return 'N'
  return ' '
}

/**
 * Una línea del archivo de comprobantes.
 * @param {object} voucher  IssuedVoucher del SDK (montos en centavos)
 * @param {string} receiverName
 */
function cbteLine(voucher, receiverName) {
  const t = voucher.totals || {}
  const h = voucher.header || {}
  const vatRates = t.vatRates || []
  if (vatRates.length > 9) fail(`El comprobante ${voucher.salesPoint}-${voucher.number} tiene más de 9 alícuotas.`)
  const line = [
    ymd(voucher.date),
    num(voucher.voucherType, 3, 'Tipo de comprobante'),
    num(voucher.salesPoint, 5, 'Punto de venta'),
    num(voucher.number, 20, 'Número de comprobante'),
    num(voucher.number, 20, 'Número de comprobante hasta'),
    num(h.documentType, 2, 'Código de documento del comprador'),
    digits(h.documentNumber, 20, 'Documento del comprador'),
    name(receiverName),
    num(t.total, 15, 'Importe total'),
    num(t.untaxed, 15, 'No gravado'),
    num(0, 15, 'Percepción a no categorizados'),
    num(t.exempt, 15, 'Exento'),
    num(0, 15, 'Percepciones nacionales'),
    num(0, 15, 'Percepciones de Ingresos Brutos'),
    num(0, 15, 'Percepciones municipales'),
    num(0, 15, 'Impuestos internos'),
    String(h.currencyId || 'PES').padEnd(3, ' ').slice(0, 3),
    exchangeRate(h.exchangeRate),
    String(vatRates.length),
    operationCode(t),
    num(t.otherTaxes, 15, 'Otros tributos'),
    ymd(h.paymentDueDate),
  ].join('')
  if (line.length !== CBTE_LINE_LENGTH) fail(`Línea de comprobante de ${line.length} caracteres (se esperaban ${CBTE_LINE_LENGTH}).`)
  return line
}

// Una línea del archivo de alícuotas por cada alícuota del comprobante.
function alicuotaLines(voucher) {
  return ((voucher.totals || {}).vatRates || []).map(r => {
    const line = [
      num(voucher.voucherType, 3, 'Tipo de comprobante'),
      num(voucher.salesPoint, 5, 'Punto de venta'),
      num(voucher.number, 20, 'Número de comprobante'),
      num(r.base, 15, 'Neto gravado'),
      num(r.id, 4, 'Código de alícuota'),
      num(r.amount, 15, 'Impuesto liquidado'),
    ].join('')
    if (line.length !== ALICUOTA_LINE_LENGTH) fail(`Línea de alícuota de ${line.length} caracteres (se esperaban ${ALICUOTA_LINE_LENGTH}).`)
    return line
  })
}

// Orden del libro: fecha, tipo, punto de venta, número.
function compareVouchers(a, b) {
  return String(a.voucher.date).localeCompare(String(b.voucher.date))
    || a.voucher.voucherType - b.voucher.voucherType
    || a.voucher.salesPoint - b.voucher.salesPoint
    || a.voucher.number - b.voucher.number
}

/**
 * @param {{ voucher: object, receiverName: string }[]} entries
 * @returns {{ cbte: string, alicuotas: string }} texto con CRLF, listo para
 *   codificar con `toWindows1252`.
 */
function buildVentasFiles(entries) {
  const sorted = [...entries].sort(compareVouchers)
  const cbte = sorted.map(e => cbteLine(e.voucher, e.receiverName))
  const alicuotas = sorted.flatMap(e => alicuotaLines(e.voucher))
  const join = lines => lines.map(l => `${l}\r\n`).join('')
  return { cbte: join(cbte), alicuotas: join(alicuotas) }
}

// Windows-1252 y Latin-1 coinciden en todo lo que `name()` deja pasar (el resto
// de los campos es ASCII), así que alcanza con la codificación nativa de Node.
function toWindows1252(text) {
  return Buffer.from(text, 'latin1')
}

module.exports = {
  buildVentasFiles, cbteLine, alicuotaLines, toWindows1252,
  CBTE_LINE_LENGTH, ALICUOTA_LINE_LENGTH,
}
