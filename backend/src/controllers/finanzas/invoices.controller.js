const crypto = require('crypto')
const archiver = require('archiver')
const prisma = require('../../lib/prisma')
const objectStorage = require('../../services/objectStorage.service')
const { sendInvoicesEmail } = require('../../services/email.service')
const { getEffectiveCategoryLimitMb } = require('../../lib/storageBudget')
const { detectImageType } = require('../../lib/imageType')
const { detectDocumentType } = require('../../lib/documentType')
const { safeContentDisposition } = require('../../lib/contentDisposition')
const { logFinanceAudit } = require('../../lib/financeAudit')
const { toDecimal } = require('../../lib/financeMoney')
const { getArcaClient, toMinorUnits, formatVoucherNumber, buildArcaItems } = require('../../lib/arcaClient')
const { getIssuedVoucher } = require('../../lib/arcaVoucherDocument')
const { renderInvoicePdf } = require('./invoicePrint.controller')
const { isValidArcaVatRate } = require('../../lib/financeCatalog')
const { parseDate, computeInvoiceStatus, businessError } = require('./_shared')

const MAX_FILE_BYTES = 20 * 1024 * 1024 // 20MB — comprobantes/facturas, no media pesado
const DENIED_MIME = ['text/html', 'application/xhtml+xml', 'image/svg+xml']
const PRESIGN_EXPIRES_IN = 900
const MAX_ZIP_ENTRIES = 200
const INVOICE_FIELD_LABELS = {
  number: { label: 'Número' }, issueDate: { label: 'Emisión', format: 'date' }, dueDate: { label: 'Vencimiento', format: 'date' },
  concept: { label: 'Concepto' }, amount: { label: 'Monto', format: 'money' },
}

const INVOICE_INCLUDE = {
  item: { select: { id: true, name: true, email: true } },
  issuer: { select: { id: true, name: true, taxCondition: true } },
  attachments: { where: { deletedAt: null, status: 'ready' }, orderBy: { createdAt: 'asc' } },
  collections: { where: { deletedAt: null }, select: { amount: true } },
  relatedInvoice: { select: { id: true, number: true } },
  corrections: { where: { deletedAt: null }, select: { id: true, kind: true, number: true, arcaStatus: true } },
}

function invoiceLabel(inv) {
  return `factura ${inv.number || '(pendiente de ARCA)'}`
}

function shapeInvoice(inv) {
  const collected = inv.collections.reduce((s, m) => s.plus(toDecimal(m.amount)), toDecimal(0))
  const { collections, ...rest } = inv
  return { ...rest, collected: collected.toString(), status: computeInvoiceStatus(inv, collected) }
}

async function assertWithinQuota(workspaceId, extraBytes) {
  const limitMb = await getEffectiveCategoryLimitMb(workspaceId, 'financeAttachmentsMaxMbOverride', 'financeAttachmentsMaxMbPerWorkspace')
  if (!limitMb) return null
  const limitBytes = limitMb * 1024 * 1024
  const agg = await prisma.financeAttachment.aggregate({
    where: { workspaceId, status: { in: ['ready', 'pending'] } }, _sum: { sizeBytes: true },
  })
  const used = agg._sum.sizeBytes || 0
  if (used + extraBytes > limitBytes) return `Se alcanzó el límite de almacenamiento de adjuntos de Finanzas (${limitMb} MB).`
  return null
}

// GET /api/finanzas/invoices?itemId=&status=&year=&search= — sección 4.5b
async function listInvoices(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const { itemId, status, year, search } = req.query
    const where = { workspaceId, deletedAt: null }
    if (itemId) where.itemId = Number(itemId)
    if (year) {
      where.issueDate = { gte: new Date(Date.UTC(Number(year), 0, 1)), lt: new Date(Date.UTC(Number(year) + 1, 0, 1)) }
    }
    if (search && search.trim()) {
      where.OR = [{ number: { contains: search.trim(), mode: 'insensitive' } }, { concept: { contains: search.trim(), mode: 'insensitive' } }]
    }

    const invoices = await prisma.financeInvoice.findMany({ where, orderBy: { issueDate: 'desc' }, include: INVOICE_INCLUDE })
    let shaped = invoices.map(shapeInvoice)
    if (status) shaped = shaped.filter(i => i.status === status)
    res.json(shaped)
  } catch (err) { next(err) }
}

// Traduce un IssueOutcome (de `issue()`, `issueCreditNote()`, `issueDebitNote()`
// o `recover()` — misma forma en los 4) al patch de columnas a guardar.
// Compartido por emitArcaInvoice, emitArcaNote y reconcileInvoice para no
// triplicar esta lógica.
function applyIssueOutcomeData(outcome) {
  const data = {}
  if (outcome.kind === 'authorized') {
    const v = outcome.voucher
    data.number = formatVoucherNumber(v.salesPoint, v.number)
    data.cae = v.cae
    data.caeExpiresAt = parseDate(v.caeExpiry)
    data.voucherType = v.voucherClass
    data.arcaStatus = 'authorized'
    data.arcaResponseRaw = { totals: v.totals, qr: v.qr, voucher: v }
  } else if (outcome.kind === 'rejected') {
    data.arcaStatus = 'rejected'
    data.arcaResponseRaw = { issues: (outcome.issues || []).map(i => ({ code: i.code, message: i.message })) }
  } else if (outcome.kind === 'conflict') {
    data.arcaStatus = 'conflict'
    data.arcaResponseRaw = { reason: outcome.reason }
  } else {
    // 'indeterminate'
    data.arcaStatus = 'indeterminate'
    data.arcaResponseRaw = { lookup: outcome.lookup?.kind || null }
  }
  return data
}

// Error de transporte/infraestructura al llamar a ARCA (no es un `rejected`
// de negocio, que viene como outcome, no como excepción). Si el error trae
// `issues` (ArcaFiscalIssue[], lo tiran algunos errores del SDK) se guardan
// también — mismo detalle que un `rejected`, para no perder información útil.
function arcaErrorData(err) {
  const raw = { error: err.message || String(err) }
  if (Array.isArray(err.issues) && err.issues.length) {
    raw.issues = err.issues.map(i => ({ code: i.code, message: i.message }))
  }
  return { arcaResponseRaw: raw }
}

/**
 * Emite una factura real contra ARCA para el emisor/cliente dados y persiste
 * el resultado. Crea la fila ANTES de llamar a `issue()` (con arcaStatus
 * 'indeterminate' + la idempotencyKey) para que, si el proceso se cae a mitad
 * de la llamada SOAP, el registro ya exista y pueda reconciliarse más
 * adelante con `recover()` (Etapa 5) — nunca se pierde la clave de
 * idempotencia. Devuelve la fila final (con include completo).
 */
async function emitArcaInvoice({ workspaceId, userId, item, issuer, issueDate, dueDate, concept, amountDecimal, ivaRate }) {
  if (!issuer.active) throw businessError(400, 'Este emisor está desactivado')
  if (!item.ivaCondition) throw businessError(400, 'Este cliente no tiene condición de IVA cargada — configurala en su ficha antes de facturar electrónicamente.')
  if (item.ivaCondition !== 'consumidor_final' && !item.taxId) {
    throw businessError(400, 'Este cliente no tiene CUIT cargado — hace falta para facturar electrónicamente (salvo consumidor final).')
  }
  if (issuer.taxCondition === 'responsable_inscripto') {
    if (!isValidArcaVatRate(ivaRate)) throw businessError(400, 'Elegí una alícuota de IVA válida (0, 2.5, 5, 10.5, 21 o 27%)')
  }

  const amountCents = toMinorUnits(amountDecimal)
  const idempotencyKey = crypto.randomUUID()

  // Fase 1: reserva — ya queda trazable aunque la llamada a ARCA falle a mitad de camino.
  let invoice = await prisma.financeInvoice.create({
    data: {
      workspaceId, itemId: item.id, issuerId: issuer.id, issueDate, dueDate, concept,
      amount: amountDecimal.toString(), currency: 'ARS', ivaRate: issuer.taxCondition === 'responsable_inscripto' ? ivaRate : null,
      arcaStatus: 'indeterminate', arcaIdempotencyKey: idempotencyKey, createdById: userId,
    },
  })

  let outcome
  try {
    const arca = await getArcaClient(issuer)
    outcome = await arca.issue(
      {
        issuer: issuer.taxCondition,
        salesPoint: issuer.salesPoint,
        to: { condition: item.ivaCondition, cuit: item.taxId ? item.taxId.replace(/-/g, '') : undefined },
        items: buildArcaItems(issuer, amountCents, ivaRate),
        date: issueDate.toISOString().slice(0, 10),
      },
      { idempotencyKey },
    )
  } catch (err) {
    invoice = await prisma.financeInvoice.update({ where: { id: invoice.id }, data: arcaErrorData(err), include: INVOICE_INCLUDE })
    await logFinanceAudit({ workspaceId, entityType: 'invoice', entityId: invoice.id, action: 'update', userId, summary: `Emisión ARCA quedó indeterminada (error de conexión) para ${item.name}` })
    return invoice
  }

  const data = applyIssueOutcomeData(outcome)
  invoice = await prisma.financeInvoice.update({ where: { id: invoice.id }, data, include: INVOICE_INCLUDE })
  await logFinanceAudit({
    workspaceId, entityType: 'invoice', entityId: invoice.id, action: 'create', userId,
    summary: `Emitió ${invoiceLabel(invoice)} de ${item.name} vía ARCA (${issuer.name}) — ${data.arcaStatus}`,
  })
  return invoice
}

/**
 * Emite una nota de crédito (`all: true`, anula la factura original entera —
 * única modalidad soportada en v1, ver nota de alcance) o débito (monto
 * nuevo) contra ARCA, asociada a una factura original con CAE. Mismo patrón
 * de reserva-antes-de-llamar que emitArcaInvoice. `original` es la factura
 * que se corrige; `amountDecimal`/`ivaRate` ya vienen resueltos por el
 * caller (= los de `original` para una nota de crédito total).
 */
async function emitArcaNote({ workspaceId, userId, original, issuer, item, kind, concept, amountDecimal, ivaRate }) {
  if (!issuer.active) throw businessError(400, 'Este emisor está desactivado')
  if (!original.cae) throw businessError(400, 'Esta factura todavía no tiene CAE — no se puede corregir.')
  if (original.kind !== 'invoice') throw businessError(400, 'Solo se puede emitir una nota sobre una factura, no sobre otra nota.')

  if (kind === 'credit_note') {
    const existing = await prisma.financeInvoice.findFirst({
      where: { workspaceId, relatedInvoiceId: original.id, kind: 'credit_note', arcaStatus: 'authorized', deletedAt: null },
    })
    if (existing) throw businessError(409, 'Esta factura ya tiene una nota de crédito emitida.')
  }

  const voucher = await getIssuedVoucher(original, issuer)
  const forCoords = { salesPoint: voucher.salesPoint, voucherType: voucher.voucherType, number: voucher.number }
  const idempotencyKey = crypto.randomUUID()

  let note = await prisma.financeInvoice.create({
    data: {
      workspaceId, itemId: item.id, issuerId: issuer.id, kind, relatedInvoiceId: original.id,
      issueDate: new Date(), dueDate: new Date(), concept,
      amount: amountDecimal.toString(), currency: 'ARS', ivaRate: ivaRate ?? null,
      arcaStatus: 'indeterminate', arcaIdempotencyKey: idempotencyKey, createdById: userId,
    },
  })

  let outcome
  try {
    const arca = await getArcaClient(issuer)
    if (kind === 'credit_note') {
      outcome = await arca.issueCreditNote({ for: forCoords, all: true }, { idempotencyKey })
    } else {
      const amountCents = toMinorUnits(amountDecimal)
      const items = buildArcaItems(issuer, amountCents, ivaRate).map(i => ({ ...i, description: concept }))
      outcome = await arca.issueDebitNote({ for: forCoords, items }, { idempotencyKey })
    }
  } catch (err) {
    note = await prisma.financeInvoice.update({ where: { id: note.id }, data: arcaErrorData(err), include: INVOICE_INCLUDE })
    await logFinanceAudit({ workspaceId, entityType: 'invoice', entityId: note.id, action: 'update', userId, summary: `Emisión de nota quedó indeterminada (error de conexión) para ${item.name}` })
    return note
  }

  const data = applyIssueOutcomeData(outcome)
  note = await prisma.financeInvoice.update({ where: { id: note.id }, data, include: INVOICE_INCLUDE })
  await logFinanceAudit({
    workspaceId, entityType: 'invoice', entityId: note.id, action: 'create', userId,
    summary: `Emitió ${kind === 'credit_note' ? 'nota de crédito' : 'nota de débito'} de ${item.name} sobre ${invoiceLabel(original)} — ${data.arcaStatus}`,
  })
  return note
}

/**
 * Reconcilia una factura/nota que quedó 'indeterminate'/'conflict' (Etapa 5):
 * consulta `recover()` con la idempotencyKey ya guardada (nunca reintenta
 * `issue()` — ARCA ya tiene la reserva) y actualiza con el mismo patch que
 * una emisión fresca.
 */
async function reconcileInvoice(invoice, issuer) {
  let outcome
  try {
    const arca = await getArcaClient(issuer)
    outcome = await arca.recover(invoice.arcaIdempotencyKey)
  } catch (err) {
    return prisma.financeInvoice.update({ where: { id: invoice.id }, data: arcaErrorData(err), include: INVOICE_INCLUDE })
  }
  const data = applyIssueOutcomeData(outcome)
  return prisma.financeInvoice.update({ where: { id: invoice.id }, data, include: INVOICE_INCLUDE })
}

// POST /api/finanzas/invoices — sección 4.8 "Nueva factura". Con `issuerId`:
// emisión electrónica real contra ARCA (Etapa 2, ver emitArcaInvoice). Sin
// `issuerId`: factura informativa de siempre, número tipeado a mano.
async function createInvoice(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const { itemId, issuerId, number, issueDate, dueDate, concept, amount, ivaRate, currency } = req.body

    if (!Number.isInteger(itemId)) return res.status(400).json({ error: 'Cliente requerido' })
    const item = await prisma.financeItem.findFirst({ where: { id: itemId, workspaceId, tracksAccount: true } })
    if (!item) return res.status(400).json({ error: 'Cliente no encontrado (debe tener seguimiento de cuenta)' })
    if (!concept?.trim()) return res.status(400).json({ error: 'Concepto requerido' })

    const parsedIssue = parseDate(issueDate)
    const parsedDue = parseDate(dueDate)
    if (!parsedIssue) return res.status(400).json({ error: 'Fecha de emisión inválida' })
    if (!parsedDue) return res.status(400).json({ error: 'Fecha de vencimiento inválida' })

    let amountDecimal
    try { amountDecimal = toDecimal(amount) } catch { return res.status(400).json({ error: 'Monto inválido' }) }
    if (!amountDecimal.isFinite() || amountDecimal.lessThanOrEqualTo(0)) return res.status(400).json({ error: 'Monto inválido' })

    if (issuerId !== undefined && issuerId !== null) {
      if (!Number.isInteger(issuerId)) return res.status(400).json({ error: 'Emisor inválido' })
      const issuer = await prisma.financeIssuer.findFirst({ where: { id: issuerId, workspaceId } })
      if (!issuer) return res.status(400).json({ error: 'Emisor no encontrado' })

      const invoice = await emitArcaInvoice({
        workspaceId, userId: req.user.userId, item, issuer,
        issueDate: parsedIssue, dueDate: parsedDue, concept: concept.trim(), amountDecimal, ivaRate,
      })
      return res.status(201).json(shapeInvoice(invoice))
    }

    if (!number?.trim()) return res.status(400).json({ error: 'Número requerido' })
    const invoice = await prisma.financeInvoice.create({
      data: {
        workspaceId, itemId, number: number.trim(), issueDate: parsedIssue, dueDate: parsedDue,
        concept: concept.trim(), amount: amountDecimal.toString(), currency: currency?.trim() || 'ARS',
        createdById: req.user.userId,
      },
      include: INVOICE_INCLUDE,
    })
    await logFinanceAudit({ workspaceId, entityType: 'invoice', entityId: invoice.id, action: 'create', userId: req.user.userId, entityLabel: `${invoiceLabel(invoice)} de ${item.name}` })
    res.status(201).json(shapeInvoice(invoice))
  } catch (err) { next(err) }
}

// PATCH /api/finanzas/invoices/:id
async function updateInvoice(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const id = Number(req.params.id)
    const existing = await prisma.financeInvoice.findFirst({ where: { id, workspaceId }, include: { item: { select: { name: true } } } })
    if (!existing) return res.status(404).json({ error: 'Factura no encontrada' })

    const { number, issueDate, dueDate, concept, amount } = req.body
    // Comprobante legal ya autorizado por ARCA (tiene CAE) — amount/concept/
    // fechas/número quedan fijos. La única forma de "corregir" es una nota de
    // crédito (Etapa 4). Nota/adjuntos siguen editables libremente.
    if (existing.cae && (number !== undefined || issueDate !== undefined || dueDate !== undefined || concept !== undefined || amount !== undefined)) {
      return res.status(409).json({ error: 'Esta factura ya tiene CAE — es un comprobante legal autorizado, no se puede editar. Emití una nota de crédito para corregirla.' })
    }

    const data = {}
    if (number !== undefined) { if (!number.trim()) return res.status(400).json({ error: 'Número requerido' }); data.number = number.trim() }
    if (concept !== undefined) { if (!concept.trim()) return res.status(400).json({ error: 'Concepto requerido' }); data.concept = concept.trim() }
    if (issueDate !== undefined) { const d = parseDate(issueDate); if (!d) return res.status(400).json({ error: 'Fecha de emisión inválida' }); data.issueDate = d }
    if (dueDate !== undefined) { const d = parseDate(dueDate); if (!d) return res.status(400).json({ error: 'Fecha de vencimiento inválida' }); data.dueDate = d }
    if (amount !== undefined) {
      let amountDecimal
      try { amountDecimal = toDecimal(amount) } catch { return res.status(400).json({ error: 'Monto inválido' }) }
      if (!amountDecimal.isFinite() || amountDecimal.lessThanOrEqualTo(0)) return res.status(400).json({ error: 'Monto inválido' })
      data.amount = amountDecimal.toString()
    }

    const invoice = await prisma.financeInvoice.update({ where: { id }, data, include: INVOICE_INCLUDE })
    await logFinanceAudit({
      workspaceId, entityType: 'invoice', entityId: id, action: 'update', userId: req.user.userId,
      entityLabel: `${invoiceLabel(existing)} de ${existing.item.name}`, before: existing, after: invoice, fieldLabels: INVOICE_FIELD_LABELS,
    })
    res.json(shapeInvoice(invoice))
  } catch (err) { next(err) }
}

// DELETE /api/finanzas/invoices/:id — soft delete (reversible, ver 3.9).
// Bloqueado si ya tiene CAE: un comprobante legal autorizado no se "borra",
// ARCA no anula comprobantes (ver nota de crédito, Etapa 4).
async function deleteInvoice(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const id = Number(req.params.id)
    const existing = await prisma.financeInvoice.findFirst({ where: { id, workspaceId }, include: { item: { select: { name: true } } } })
    if (!existing) return res.status(404).json({ error: 'Factura no encontrada' })
    if (existing.cae) return res.status(409).json({ error: 'Esta factura ya tiene CAE — no se puede eliminar. Emití una nota de crédito para corregirla.' })
    await prisma.financeInvoice.update({ where: { id }, data: { deletedAt: new Date(), deletedById: req.user.userId } })
    await logFinanceAudit({ workspaceId, entityType: 'invoice', entityId: id, action: 'delete', userId: req.user.userId, entityLabel: `${invoiceLabel(existing)} de ${existing.item.name}` })
    res.json({ ok: true })
  } catch (err) { next(err) }
}

// POST /api/finanzas/invoices/:id/restore
async function restoreInvoice(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const id = Number(req.params.id)
    const existing = await prisma.financeInvoice.findFirst({ where: { id, workspaceId, deletedAt: { not: null } }, include: { item: { select: { name: true } } } })
    if (!existing) return res.status(404).json({ error: 'Factura eliminada no encontrada' })
    await prisma.financeInvoice.update({ where: { id }, data: { deletedAt: null, deletedById: null } })
    await logFinanceAudit({ workspaceId, entityType: 'invoice', entityId: id, action: 'restore', userId: req.user.userId, entityLabel: `factura ${existing.number} de ${existing.item.name}` })
    const full = await prisma.financeInvoice.findUnique({ where: { id }, include: INVOICE_INCLUDE })
    res.json(shapeInvoice(full))
  } catch (err) { next(err) }
}

// POST /api/finanzas/invoices/:id/credit-note — anula POR COMPLETO una
// factura con CAE (única modalidad soportada en v1: `all: true`, ver nota de
// alcance en emitArcaNote — ARCA acredita exactamente lo que autorizó la
// original, sin desglose de items propio).
async function createCreditNote(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const id = Number(req.params.id)
    const original = await prisma.financeInvoice.findFirst({ where: { id, workspaceId, deletedAt: null }, include: { issuer: true, item: true } })
    if (!original) return res.status(404).json({ error: 'Factura no encontrada' })
    if (!original.issuerId) return res.status(400).json({ error: 'Esta factura no se emitió por ARCA.' })

    const concept = (req.body?.concept || '').trim() || `Anula ${invoiceLabel(original)}`
    const note = await emitArcaNote({
      workspaceId, userId: req.user.userId, original, issuer: original.issuer, item: original.item,
      kind: 'credit_note', concept, amountDecimal: toDecimal(original.amount), ivaRate: original.ivaRate,
    })
    res.status(201).json(shapeInvoice(note))
  } catch (err) { next(err) }
}

// POST /api/finanzas/invoices/:id/debit-note — agrega un monto nuevo
// asociado a una factura con CAE ya emitida (ej. un cargo adicional).
async function createDebitNote(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const id = Number(req.params.id)
    const original = await prisma.financeInvoice.findFirst({ where: { id, workspaceId, deletedAt: null }, include: { issuer: true, item: true } })
    if (!original) return res.status(404).json({ error: 'Factura no encontrada' })
    if (!original.issuerId) return res.status(400).json({ error: 'Esta factura no se emitió por ARCA.' })

    const { concept, amount, ivaRate } = req.body
    if (!concept?.trim()) return res.status(400).json({ error: 'Concepto requerido' })
    let amountDecimal
    try { amountDecimal = toDecimal(amount) } catch { return res.status(400).json({ error: 'Monto inválido' }) }
    if (!amountDecimal.isFinite() || amountDecimal.lessThanOrEqualTo(0)) return res.status(400).json({ error: 'Monto inválido' })
    const isResponsableInscripto = original.issuer.taxCondition === 'responsable_inscripto'
    if (isResponsableInscripto && !isValidArcaVatRate(ivaRate)) {
      return res.status(400).json({ error: 'Elegí una alícuota de IVA válida (0, 2.5, 5, 10.5, 21 o 27%)' })
    }

    const note = await emitArcaNote({
      workspaceId, userId: req.user.userId, original, issuer: original.issuer, item: original.item,
      kind: 'debit_note', concept: concept.trim(), amountDecimal, ivaRate: isResponsableInscripto ? ivaRate : null,
    })
    res.status(201).json(shapeInvoice(note))
  } catch (err) { next(err) }
}

// POST /api/finanzas/invoices/:id/reconcile — Etapa 5: para una factura/nota
// que quedó 'indeterminate'/'conflict', consulta recover() y actualiza.
async function reconcile(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const id = Number(req.params.id)
    const existing = await prisma.financeInvoice.findFirst({
      where: { id, workspaceId, deletedAt: null },
      include: { issuer: true, item: { select: { name: true } } },
    })
    if (!existing) return res.status(404).json({ error: 'Factura no encontrada' })
    if (!existing.issuerId || !existing.arcaIdempotencyKey) return res.status(400).json({ error: 'Esta factura no pasó por ARCA.' })
    if (!['indeterminate', 'conflict'].includes(existing.arcaStatus)) {
      return res.status(409).json({ error: 'Esta factura ya tiene un resultado definitivo de ARCA.' })
    }

    const updated = await reconcileInvoice(existing, existing.issuer)
    await logFinanceAudit({
      workspaceId, entityType: 'invoice', entityId: id, action: 'update', userId: req.user.userId,
      summary: `Reconcilió ${invoiceLabel(updated)} de ${existing.item.name} — ${updated.arcaStatus}`,
    })
    res.json(shapeInvoice(updated))
  } catch (err) { next(err) }
}

// ── Adjuntos (mismo flujo presign→PUT→confirm que Archivos, ver
// projectFiles.controller.js, pero FinanceAttachment habla directo con R2 sin
// pasar por ProjectFile — ver nota de diseño en el schema) ──────────────────

async function findInvoice(id, workspaceId) {
  return prisma.financeInvoice.findFirst({ where: { id, workspaceId, deletedAt: null } })
}

// POST /api/finanzas/invoices/:id/attachments/presign — { name, mimeType, sizeBytes }
async function presignAttachment(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const invoiceId = Number(req.params.id)
    const invoice = await findInvoice(invoiceId, workspaceId)
    if (!invoice) return res.status(404).json({ error: 'Factura no encontrada' })

    if (!objectStorage.isConfigured()) {
      return res.status(503).json({ error: 'La subida de archivos no está configurada en este workspace.', code: 'STORAGE_NOT_CONFIGURED' })
    }

    const name = (req.body?.name || '').trim().slice(0, 200)
    if (!name) return res.status(400).json({ error: 'Nombre de archivo requerido' })
    const mimeType = typeof req.body?.mimeType === 'string' && req.body.mimeType.trim() ? req.body.mimeType.trim() : 'application/octet-stream'
    if (DENIED_MIME.includes(mimeType)) return res.status(400).json({ error: 'Este tipo de archivo no está permitido.' })
    const declaredSize = Number(req.body?.sizeBytes)
    if (!Number.isInteger(declaredSize) || declaredSize <= 0) return res.status(400).json({ error: 'sizeBytes inválido' })
    if (declaredSize > MAX_FILE_BYTES) return res.status(413).json({ error: `El archivo supera el máximo permitido (${Math.round(MAX_FILE_BYTES / (1024 * 1024))}MB).` })

    const quotaError = await assertWithinQuota(workspaceId, declaredSize)
    if (quotaError) return res.status(413).json({ error: quotaError, code: 'STORAGE_QUOTA_EXCEEDED' })

    const objectKey = objectStorage.buildKey(`finance/${workspaceId}`, mimeType)
    const attachment = await prisma.financeAttachment.create({
      data: { workspaceId, invoiceId, name, mimeType, objectKey, sizeBytes: declaredSize, status: 'pending', uploadedById: req.user.userId },
    })
    const uploadUrl = await objectStorage.presignPut(objectKey, mimeType, { expiresIn: PRESIGN_EXPIRES_IN })
    res.status(201).json({ attachmentId: attachment.id, uploadUrl, expiresIn: PRESIGN_EXPIRES_IN })
  } catch (err) { next(err) }
}

// POST /api/finanzas/invoices/:id/attachments/:attId/confirm
async function confirmAttachment(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const invoiceId = Number(req.params.id)
    const attId = Number(req.params.attId)
    const attachment = await prisma.financeAttachment.findFirst({ where: { id: attId, workspaceId, invoiceId } })
    if (!attachment) return res.status(404).json({ error: 'Adjunto no encontrado' })
    if (attachment.status !== 'pending') return res.status(409).json({ error: 'Este adjunto ya fue confirmado.' })

    async function reject(status, error, code) {
      await objectStorage.deleteObject(attachment.objectKey)
      await prisma.financeAttachment.delete({ where: { id: attachment.id } })
      res.status(status).json(code ? { error, code } : { error })
    }

    const head = await objectStorage.headObject(attachment.objectKey)
    if (!head) return reject(400, 'No se encontró el archivo subido. Probá de nuevo.', 'UPLOAD_NOT_FOUND')
    if (head.size > MAX_FILE_BYTES) return reject(413, `El archivo supera el máximo permitido (${Math.round(MAX_FILE_BYTES / (1024 * 1024))}MB).`)

    const headerBuf = await objectStorage.getObjectHead(attachment.objectKey, 32)
    const mimeType = detectImageType(headerBuf) || (detectDocumentType(headerBuf) === 'pdf' ? 'application/pdf' : null) || attachment.mimeType
    if (DENIED_MIME.includes(mimeType)) return reject(400, 'Este tipo de archivo no está permitido.')

    const updated = await prisma.financeAttachment.update({
      where: { id: attachment.id },
      data: { status: 'ready', sizeBytes: head.size, mimeType, confirmedAt: new Date() },
    })
    res.json(updated)
  } catch (err) { next(err) }
}

// DELETE /api/finanzas/invoices/:id/attachments/:attId
async function deleteAttachment(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const invoiceId = Number(req.params.id)
    const attId = Number(req.params.attId)
    const attachment = await prisma.financeAttachment.findFirst({ where: { id: attId, workspaceId, invoiceId, deletedAt: null } })
    if (!attachment) return res.status(404).json({ error: 'Adjunto no encontrado' })
    await prisma.financeAttachment.update({ where: { id: attId }, data: { deletedAt: new Date(), deletedById: req.user.userId } })
    res.json({ ok: true })
  } catch (err) { next(err) }
}

// GET /api/finanzas/invoices/:id/attachments/:attId/download
async function downloadAttachment(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const invoiceId = Number(req.params.id)
    const attId = Number(req.params.attId)
    const attachment = await prisma.financeAttachment.findFirst({ where: { id: attId, workspaceId, invoiceId, status: 'ready', deletedAt: null } })
    if (!attachment || !attachment.objectKey) return res.status(404).json({ error: 'Adjunto no encontrado' })

    const { body, contentLength } = await objectStorage.getObjectStream(attachment.objectKey)
    res.setHeader('Content-Type', attachment.mimeType || 'application/octet-stream')
    if (contentLength != null) res.setHeader('Content-Length', contentLength)
    res.setHeader('Content-Disposition', safeContentDisposition(attachment.name, { type: 'attachment' }))
    body.on('error', next)
    body.pipe(res)
  } catch (err) { next(err) }
}

// POST /api/finanzas/invoices/download-zip — { ids: [invoiceId,...] } — descarga
// en lote de facturas tildadas (sección 4.5b): un .zip con todos los adjuntos
// listos de las facturas seleccionadas.
async function downloadZip(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const ids = [...new Set((Array.isArray(req.body?.ids) ? req.body.ids : []).map(Number).filter(n => Number.isInteger(n) && n > 0))]
    if (ids.length === 0) return res.status(400).json({ error: 'Nada seleccionado para descargar' })
    if (ids.length > MAX_ZIP_ENTRIES) return res.status(413).json({ error: `Se puede descargar hasta ${MAX_ZIP_ENTRIES} facturas por vez.` })

    const invoices = await prisma.financeInvoice.findMany({
      where: { id: { in: ids }, workspaceId, deletedAt: null },
      include: { attachments: { where: { deletedAt: null, status: 'ready' } } },
    })
    const hasAnythingToZip = invoices.some(inv => inv.cae || inv.attachments.length > 0)
    if (!hasAnythingToZip) return res.status(400).json({ error: 'Ninguna de las facturas seleccionadas tiene PDF oficial ni adjuntos para descargar.' })

    const usedNames = new Set()
    function dedupe(name) {
      if (!usedNames.has(name)) { usedNames.add(name); return name }
      const dot = name.lastIndexOf('.')
      const base = dot > 0 ? name.slice(0, dot) : name
      const ext = dot > 0 ? name.slice(dot) : ''
      let i = 2, candidate
      do { candidate = `${base} (${i})${ext}`; i++ } while (usedNames.has(candidate))
      usedNames.add(candidate)
      return candidate
    }

    res.setHeader('Content-Type', 'application/zip')
    res.setHeader('Content-Disposition', safeContentDisposition('facturas.zip', { type: 'attachment' }))
    const archive = archiver('zip', { zlib: { level: 6 } })
    archive.on('warning', () => {})
    archive.on('error', err => { if (!res.headersSent) next(err); else res.destroy(err) })
    archive.pipe(res)
    for (const inv of invoices) {
      // PDF oficial de ARCA además de los adjuntos manuales — antes el zip
      // solo incluía adjuntos, así que una factura recién emitida (sin ningún
      // archivo subido a mano) bajaba un zip vacío pese a tener CAE.
      if (inv.cae) {
        try {
          const kindLabel = inv.kind === 'credit_note' ? 'Nota de crédito' : inv.kind === 'debit_note' ? 'Nota de débito' : 'Factura'
          const pdf = await renderInvoicePdf(inv.id, req.workspace.slug)
          archive.append(pdf, { name: dedupe(`${kindLabel} ${inv.number}.pdf`) })
        } catch { /* no se pudo generar el PDF oficial — se omite, el resto del zip sigue */ }
      }
      for (const att of inv.attachments) {
        try {
          const { body } = await objectStorage.getObjectStream(att.objectKey)
          archive.append(body, { name: dedupe(att.name) })
        } catch { /* objeto faltante en R2 — se omite, el resto del zip sigue */ }
      }
    }
    await archive.finalize()
  } catch (err) { next(err) }
}

// POST /api/finanzas/invoices/send-email — { ids: [invoiceId,...] } — sección
// 4.5b "Enviar por mail" (al mail del cliente, usando el envío de mails del sistema).
async function sendEmail(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const ids = [...new Set((Array.isArray(req.body?.ids) ? req.body.ids : []).map(Number).filter(n => Number.isInteger(n) && n > 0))]
    if (ids.length === 0) return res.status(400).json({ error: 'Nada seleccionado para enviar' })

    const invoices = await prisma.financeInvoice.findMany({
      where: { id: { in: ids }, workspaceId, deletedAt: null },
      include: { item: { select: { name: true, email: true } }, attachments: { where: { deletedAt: null, status: 'ready' } } },
    })
    if (invoices.length === 0) return res.status(404).json({ error: 'No se encontraron facturas' })
    const emails = new Set(invoices.map(i => i.item.email).filter(Boolean))
    if (emails.size === 0) return res.status(400).json({ error: 'El cliente no tiene mail cargado' })
    if (emails.size > 1) return res.status(400).json({ error: 'Las facturas seleccionadas son de clientes distintos' })

    const to = [...emails][0]
    await sendInvoicesEmail(to, invoices, { workspaceId, workspaceName: req.workspace.name, slug: req.workspace.slug })

    await logFinanceAudit({
      workspaceId, entityType: 'invoice', entityId: invoices[0].id, action: 'update', userId: req.user.userId,
      summary: `Envió por mail ${invoices.length > 1 ? `${invoices.length} facturas` : `la factura ${invoices[0].number}`} a ${to}`,
    })

    res.json({ ok: true, sentTo: to, count: invoices.length })
  } catch (err) { next(err) }
}

module.exports = {
  listInvoices, createInvoice, updateInvoice, deleteInvoice, restoreInvoice,
  createCreditNote, createDebitNote, reconcile,
  presignAttachment, confirmAttachment, deleteAttachment, downloadAttachment, downloadZip, sendEmail,
  INVOICE_INCLUDE, shapeInvoice,
}
