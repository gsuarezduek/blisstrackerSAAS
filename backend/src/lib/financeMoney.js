/**
 * Aritmética de dinero de Finanzas — SIEMPRE con `Prisma.Decimal` (nunca
 * `Number`/float) para honrar la precisión exacta que pide el spec (hasta 8
 * decimales para BTC). `Prisma.Decimal` es la misma clase (`decimal.js`) que
 * usa el Prisma Client para serializar los campos `Decimal` del schema — nos
 * la reexporta `@prisma/client`, no hace falta una lib aparte.
 */
const { Prisma } = require('@prisma/client')
const { Decimal } = Prisma

/** Escala (decimales) a redondear según la moneda de la cuenta del movimiento. */
function decimalsForCurrency(currency) {
  return currency === 'BTC' ? 8 : 2
}

function toDecimal(value) {
  if (value instanceof Decimal) return value
  return new Decimal(value ?? 0)
}

function roundForCurrency(value, currency) {
  return toDecimal(value).toDecimalPlaces(decimalsForCurrency(currency), Decimal.ROUND_HALF_UP)
}

/** baseAmount × percentage / 100, redondeado a la escala de `currency`. */
function computeTaxAmount(baseAmount, percentage, currency) {
  const raw = toDecimal(baseAmount).times(toDecimal(percentage)).dividedBy(100)
  return roundForCurrency(raw, currency)
}

module.exports = { Decimal, toDecimal, decimalsForCurrency, roundForCurrency, computeTaxAmount }
