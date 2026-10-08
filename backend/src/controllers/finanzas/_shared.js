// Helpers compartidos por los controllers del módulo Finanzas.
const { MAX_TAX_CHAIN_DEPTH } = require('../../lib/financeCatalog')
const { toDecimal, computeTaxAmount } = require('../../lib/financeMoney')

/** Error de negocio con status HTTP — mismo patrón que assertNoActiveTask (tasks/_shared.js). */
function businessError(status, message) {
  return Object.assign(new Error(message), { status, isOperational: true })
}

/**
 * Fechas "solo día" (YYYY-MM-DD) → mediodía UTC, mismo patrón que
 * controllers/ventas/leads.controller.js `parseDate` — evita que se corran de
 * día al guardarse/filtrarse en timezone ART (UTC-3), que llevaría una
 * medianoche UTC al día anterior. `undefined` = valor inválido (el caller
 * decide si eso es un 400).
 */
function parseDate(v) {
  if (v == null || v === '') return null
  const s = String(v)
  const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T12:00:00Z`) : new Date(s)
  return isNaN(d.getTime()) ? undefined : d
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

/**
 * Resuelve los impuestos tildados (`taxIds`) sobre un movimiento o una
 * transferencia (sección 3.2 del spec): valida que estén ofrecidos en la
 * cuenta, valida que todo impuesto con base "other_tax" tenga su base también
 * tildada (si no, 400 — no hay un estado "0 y deshabilitado" del lado
 * backend, eso lo resuelve el frontend deshabilitando el checkbox), calcula
 * en dos pasadas (primero base='movement', después base='other_tax' contra
 * la línea hermana recién creada) y genera un egreso hijo en "Impuestos
 * bancarios" por cada impuesto tildado.
 *
 * Alcance v1: soporta cadenas de hasta 2 niveles (un impuesto con base en
 * OTRO que a su vez tenga base en el movimiento) — el catálogo permite
 * encadenar hasta 5 a nivel de configuración (ver MAX_TAX_CHAIN_DEPTH), pero
 * aplicar una cadena de 3+ niveles a un movimiento real no está soportado
 * todavía (caso de uso no visto en la práctica).
 *
 * @param {import('@prisma/client').Prisma.TransactionClient} tx
 * @param {{ workspaceId: number, accountId: number, taxIds: number[], baseAmount: import('@prisma/client').Prisma.Decimal, currency: string, date: Date, itemId: number|null, movementId?: number, transferId?: number }} params
 * @returns {Promise<Array>} las filas FinanceMovementTax creadas
 */
async function resolveAndApplyTaxes(tx, { workspaceId, accountId, taxIds, baseAmount, currency, date, itemId, movementId, transferId }) {
  const uniqueIds = [...new Set(taxIds)]
  if (uniqueIds.length === 0) return []

  // FinanceAccountTax es solo el set OFRECIDO por default (los checkboxes que
  // aparecen ya listados al elegir la cuenta) — "+ Agregar otro impuesto" en
  // el modal permite tildar cualquier otro impuesto del catálogo del
  // workspace para esta carga puntual, así que acá solo se valida que el id
  // exista en el workspace, no que esté en FinanceAccountTax.
  const taxRows = await tx.financeTax.findMany({ where: { id: { in: uniqueIds }, workspaceId } })
  if (taxRows.length !== uniqueIds.length) throw businessError(400, 'Alguno de los impuestos elegidos no existe en este workspace')
  const tiltedSet = new Set(uniqueIds)
  for (const t of taxRows) {
    if (t.baseType === 'other_tax' && !tiltedSet.has(t.baseTaxId)) {
      throw businessError(400, `No podés aplicar "${t.name}" sin aplicar también su impuesto base`)
    }
  }

  const bankTaxCategory = await tx.financeCategory.findFirst({
    where: { workspaceId, type: 'expense', name: { equals: 'Impuestos bancarios', mode: 'insensitive' } },
  })
  if (!bankTaxCategory) throw businessError(400, 'No se encontró la categoría "Impuestos bancarios" — recreala en Configuración.')

  const createdLines = []
  const resolvedByTaxId = new Map() // taxId -> { lineId, amount: Decimal }

  async function applyOne(t, baseAmountDecimal, baseTaxLineId) {
    const amount = computeTaxAmount(baseAmountDecimal, t.percentage, currency)
    const childMovement = await tx.financeMovement.create({
      data: {
        workspaceId, type: 'expense', date, itemId: itemId ?? null, categoryId: bankTaxCategory.id, accountId,
        amount: amount.toString(), sourceMovementId: movementId ?? null,
      },
    })
    const line = await tx.financeMovementTax.create({
      data: {
        workspaceId, movementId: movementId ?? null, transferId: transferId ?? null, taxId: t.id, name: t.name,
        percentage: t.percentage, baseType: t.baseType, baseTaxLineId: baseTaxLineId ?? null,
        baseAmount: baseAmountDecimal.toString(), amount: amount.toString(), generatedMovementId: childMovement.id,
      },
    })
    resolvedByTaxId.set(t.id, { lineId: line.id, amount })
    createdLines.push(line)
  }

  for (const t of taxRows.filter(t => t.baseType === 'movement')) {
    await applyOne(t, toDecimal(baseAmount), null)
  }
  for (const t of taxRows.filter(t => t.baseType === 'other_tax')) {
    const base = resolvedByTaxId.get(t.baseTaxId)
    if (!base) throw businessError(400, `No se pudo resolver la base de "${t.name}" (cadenas de más de 2 niveles no soportadas al cargar un movimiento)`)
    await applyOne(t, base.amount, base.lineId)
  }

  return createdLines
}

module.exports = { businessError, toDecimalInput, trimmedOrNull, assertNoTaxCycle, resolveAndApplyTaxes, parseDate }
