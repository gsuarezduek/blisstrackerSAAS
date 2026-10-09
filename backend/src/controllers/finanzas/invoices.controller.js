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
const { parseDate, computeInvoiceStatus } = require('./_shared')

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
  attachments: { where: { deletedAt: null, status: 'ready' }, orderBy: { createdAt: 'asc' } },
  collections: { where: { deletedAt: null }, select: { amount: true } },
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

// POST /api/finanzas/invoices — sección 4.8 "Nueva factura"
async function createInvoice(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const { itemId, number, issueDate, dueDate, concept, amount, currency } = req.body

    if (!Number.isInteger(itemId)) return res.status(400).json({ error: 'Cliente requerido' })
    const item = await prisma.financeItem.findFirst({ where: { id: itemId, workspaceId, tracksAccount: true } })
    if (!item) return res.status(400).json({ error: 'Cliente no encontrado (debe tener seguimiento de cuenta)' })
    if (!number?.trim()) return res.status(400).json({ error: 'Número requerido' })
    if (!concept?.trim()) return res.status(400).json({ error: 'Concepto requerido' })

    const parsedIssue = parseDate(issueDate)
    const parsedDue = parseDate(dueDate)
    if (!parsedIssue) return res.status(400).json({ error: 'Fecha de emisión inválida' })
    if (!parsedDue) return res.status(400).json({ error: 'Fecha de vencimiento inválida' })

    let amountDecimal
    try { amountDecimal = toDecimal(amount) } catch { return res.status(400).json({ error: 'Monto inválido' }) }
    if (!amountDecimal.isFinite() || amountDecimal.lessThanOrEqualTo(0)) return res.status(400).json({ error: 'Monto inválido' })

    const invoice = await prisma.financeInvoice.create({
      data: {
        workspaceId, itemId, number: number.trim(), issueDate: parsedIssue, dueDate: parsedDue,
        concept: concept.trim(), amount: amountDecimal.toString(), currency: currency?.trim() || 'ARS',
        createdById: req.user.userId,
      },
      include: INVOICE_INCLUDE,
    })
    await logFinanceAudit({ workspaceId, entityType: 'invoice', entityId: invoice.id, action: 'create', userId: req.user.userId, entityLabel: `factura ${invoice.number} de ${item.name}` })
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
      entityLabel: `factura ${existing.number} de ${existing.item.name}`, before: existing, after: invoice, fieldLabels: INVOICE_FIELD_LABELS,
    })
    res.json(shapeInvoice(invoice))
  } catch (err) { next(err) }
}

// DELETE /api/finanzas/invoices/:id — soft delete (reversible, ver 3.9)
async function deleteInvoice(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const id = Number(req.params.id)
    const existing = await prisma.financeInvoice.findFirst({ where: { id, workspaceId }, include: { item: { select: { name: true } } } })
    if (!existing) return res.status(404).json({ error: 'Factura no encontrada' })
    await prisma.financeInvoice.update({ where: { id }, data: { deletedAt: new Date(), deletedById: req.user.userId } })
    await logFinanceAudit({ workspaceId, entityType: 'invoice', entityId: id, action: 'delete', userId: req.user.userId, entityLabel: `factura ${existing.number} de ${existing.item.name}` })
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

    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { name: true } })
    const to = [...emails][0]
    await sendInvoicesEmail(to, invoices, { workspaceId, workspaceName: workspace.name })

    await logFinanceAudit({
      workspaceId, entityType: 'invoice', entityId: invoices[0].id, action: 'update', userId: req.user.userId,
      summary: `Envió por mail ${invoices.length > 1 ? `${invoices.length} facturas` : `la factura ${invoices[0].number}`} a ${to}`,
    })

    res.json({ ok: true, sentTo: to, count: invoices.length })
  } catch (err) { next(err) }
}

module.exports = {
  listInvoices, createInvoice, updateInvoice, deleteInvoice, restoreInvoice,
  presignAttachment, confirmAttachment, deleteAttachment, downloadAttachment, downloadZip, sendEmail,
  INVOICE_INCLUDE, shapeInvoice,
}
