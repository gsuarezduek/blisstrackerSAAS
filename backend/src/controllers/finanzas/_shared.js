// Helpers compartidos por los controllers del módulo Finanzas.
const { MAX_TAX_CHAIN_DEPTH } = require('../../lib/financeCatalog')

/** Error de negocio con status HTTP — mismo patrón que assertNoActiveTask (tasks/_shared.js). */
function businessError(status, message) {
  return Object.assign(new Error(message), { status, isOperational: true })
}

/**
 * Normaliza un valor de monto/porcentaje a string para pasarle a un campo
 * Decimal de Prisma (acepta number o string, nunca aritmética propia). Lanza
 * 400 si no es un número finito.
 */
function toDecimalInput(value, label = 'Monto') {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  if (!Number.isFinite(n)) throw businessError(400, `${label} inválido`)
  return String(value)
}

function trimmedOrNull(value) {
  if (value === undefined) return undefined
  if (value === null) return null
  const t = String(value).trim()
  return t || null
}

/**
 * Valida que `baseTaxId` (al crear o editar `taxId`) no genere un ciclo ni
 * encadene más de MAX_TAX_CHAIN_DEPTH niveles. Chequeo conservador: camina
 * hacia arriba desde `baseTaxId`, no considera la profundidad de dependientes
 * que ya cuelgan de `taxId` — alcanza para el caso de uso real (encadenar 2-3
 * impuestos), no es una garantía matemática completa de "nunca más de 5" en
 * cadenas combinadas.
 */
async function assertNoTaxCycle(tx, workspaceId, taxId, baseTaxId) {
  if (baseTaxId == null) return
  if (taxId != null && baseTaxId === taxId) {
    throw businessError(400, 'Un impuesto no puede tener como base a sí mismo')
  }
  let current = baseTaxId
  let depth = 1
  while (current != null) {
    if (taxId != null && current === taxId) {
      throw businessError(400, 'Esa cadena de impuestos generaría un ciclo')
    }
    if (depth > MAX_TAX_CHAIN_DEPTH) {
      throw businessError(400, `Los impuestos no pueden encadenarse más de ${MAX_TAX_CHAIN_DEPTH} niveles`)
    }
    const row = await tx.financeTax.findFirst({ where: { id: current, workspaceId }, select: { baseTaxId: true } })
    if (!row) throw businessError(400, 'El impuesto base no existe')
    current = row.baseTaxId
    depth++
  }
}

module.exports = { businessError, toDecimalInput, trimmedOrNull, assertNoTaxCycle }
