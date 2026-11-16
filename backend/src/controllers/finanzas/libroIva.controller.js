const archiver = require('archiver')
const prisma = require('../../lib/prisma')
const { getIssuedVoucher } = require('../../lib/arcaVoucherDocument')
const { buildVentasFiles, toWindows1252 } = require('../../lib/libroIvaDigital')

// Libro IVA Digital — ventas de UN emisor (CUIT) en UN mes: así se presenta
// ante ARCA, una declaración por contribuyente y período.
//
// GET /api/finanzas/invoices/libro-iva?issuerId=&month=YYYY-MM        → resumen
// GET /api/finanzas/invoices/libro-iva?issuerId=&month=YYYY-MM&download=1 → ZIP con los dos .txt
//
// El resumen va primero a propósito: lo que queda AFUERA del libro (comprobantes
// que ARCA todavía no confirmó, emisor en homologación) hay que verlo antes de
// presentar, no descubrirlo después en el rechazo de ARCA.

function bad(res, message) {
  return res.status(400).json({ error: message })
}

function monthBounds(month) {
  const [y, m] = month.split('-').map(Number)
  return { gte: new Date(Date.UTC(y, m - 1, 1)), lt: new Date(Date.UTC(y, m, 1)) }
}

// Centavos con signo → "1234.56" (la nota de crédito resta en el resumen; en el
// archivo, ARCA la recibe en positivo y el signo lo da el tipo de comprobante).
function centsToString(cents) {
  const neg = cents < 0
  const abs = Math.abs(cents)
  return `${neg ? '-' : ''}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`
}

function invoiceRef(inv) {
  return { id: inv.id, number: inv.number, kind: inv.kind, client: inv.item?.name || null }
}

async function collect(workspaceId, issuerId, month) {
  const issuer = await prisma.financeIssuer.findFirst({ where: { id: issuerId, workspaceId } })
  if (!issuer) return { error: 'Emisor no encontrado.' }
  if (issuer.taxCondition !== 'responsable_inscripto') {
    return { error: 'El Libro IVA Digital lo presentan los responsables inscriptos. Este emisor no está inscripto en IVA, así que no lleva libro.' }
  }

  const invoices = await prisma.financeInvoice.findMany({
    where: { workspaceId, issuerId, deletedAt: null, issueDate: monthBounds(month) },
    include: { item: { select: { name: true, legalName: true } } },
    orderBy: [{ issueDate: 'asc' }, { id: 'asc' }],
  })

  const entries = []
  const pending = []       // indeterminate / conflict: pueden tener CAE en ARCA sin que lo sepamos
  const unreadable = []    // autorizados cuyo comprobante no pudimos traer de ARCA
  const otherMonth = []    // la fecha fiscal del comprobante cae en otro mes
  const totals = { count: 0, invoice: 0, credit_note: 0, debit_note: 0, alicuotaLines: 0, total: 0, netTaxed: 0, vat: 0 }

  for (const inv of invoices) {
    if (inv.arcaStatus === 'indeterminate' || inv.arcaStatus === 'conflict') { pending.push(invoiceRef(inv)); continue }
    if (!inv.cae || inv.arcaStatus !== 'authorized') continue // rechazado: nunca existió para ARCA

    let voucher
    try {
      voucher = await getIssuedVoucher(inv, issuer)
    } catch {
      unreadable.push(invoiceRef(inv))
      continue
    }
    if (String(voucher.date).slice(0, 7) !== month) { otherMonth.push({ ...invoiceRef(inv), date: voucher.date }); continue }

    entries.push({ voucher, receiverName: inv.item?.legalName || inv.item?.name || '' })
    const sign = inv.kind === 'credit_note' ? -1 : 1
    const t = voucher.totals || {}
    totals.count++
    totals[inv.kind in totals ? inv.kind : 'invoice']++
    totals.alicuotaLines += (t.vatRates || []).length
    totals.total += sign * Number(t.total || 0)
    totals.netTaxed += sign * Number(t.netTaxed || 0)
    totals.vat += sign * Number(t.vat || 0)
  }

  const warnings = []
  if (issuer.environment !== 'production') {
    warnings.push({ code: 'test_environment', message: 'Este emisor está en homologación: sus comprobantes son de prueba y no existen para ARCA. No presentes este libro.' })
  }
  if (pending.length) {
    warnings.push({ code: 'pending', message: `${pending.length} comprobante${pending.length === 1 ? '' : 's'} sin resultado definitivo de ARCA quedaron afuera. Reconcilialos antes de exportar: si ARCA los autorizó, tienen que estar en el libro.`, invoices: pending })
  }
  if (unreadable.length) {
    warnings.push({ code: 'unreadable', message: `No se pudo traer de ARCA el detalle de ${unreadable.length} comprobante${unreadable.length === 1 ? '' : 's'} autorizado${unreadable.length === 1 ? '' : 's'}: quedaron afuera. Probá de nuevo en un rato.`, invoices: unreadable })
  }
  if (otherMonth.length) {
    warnings.push({ code: 'other_month', message: `${otherMonth.length} comprobante${otherMonth.length === 1 ? '' : 's'} tiene${otherMonth.length === 1 ? '' : 'n'} fecha fiscal de otro mes y quedaron afuera de este período.`, invoices: otherMonth })
  }

  return { issuer, entries, totals, warnings }
}

async function libroIvaVentas(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const issuerId = Number(req.query.issuerId)
    const month = String(req.query.month || '')
    if (!Number.isInteger(issuerId) || issuerId <= 0) return bad(res, 'Elegí un emisor.')
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return bad(res, 'Período inválido (formato YYYY-MM).')

    const result = await collect(workspaceId, issuerId, month)
    if (result.error) return bad(res, result.error)
    const { issuer, entries, totals, warnings } = result

    if (req.query.download !== '1') {
      return res.json({
        issuer: { id: issuer.id, name: issuer.name, cuit: issuer.cuit, environment: issuer.environment },
        month,
        counts: { total: totals.count, invoice: totals.invoice, creditNote: totals.credit_note, debitNote: totals.debit_note, alicuotaLines: totals.alicuotaLines },
        amounts: { total: centsToString(totals.total), netTaxed: centsToString(totals.netTaxed), vat: centsToString(totals.vat) },
        warnings,
      })
    }

    if (entries.length === 0) return bad(res, 'No hay comprobantes autorizados de este emisor en el período.')

    const { cbte, alicuotas } = buildVentasFiles(entries)
    const cuit = issuer.cuit.replace(/\D/g, '')
    const period = month.replace('-', '')
    const base = `LIBRO_IVA_DIGITAL_VENTAS`

    res.setHeader('Content-Type', 'application/zip')
    res.setHeader('Content-Disposition', `attachment; filename="${base}_${cuit}_${period}.zip"`)
    const archive = archiver('zip', { zlib: { level: 6 } })
    archive.on('warning', () => {})
    archive.on('error', err => { if (!res.headersSent) next(err); else res.destroy(err) })
    archive.pipe(res)
    archive.append(toWindows1252(cbte), { name: `${base}_CBTE_${cuit}_${period}.txt` })
    archive.append(toWindows1252(alicuotas), { name: `${base}_ALICUOTAS_${cuit}_${period}.txt` })
    await archive.finalize()
  } catch (err) { next(err) }
}

module.exports = { libroIvaVentas }
