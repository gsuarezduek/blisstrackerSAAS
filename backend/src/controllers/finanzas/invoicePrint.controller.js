const jwt = require('jsonwebtoken')
const contentDisposition = require('content-disposition')
const QRCode = require('qrcode')
const prisma = require('../../lib/prisma')
const { renderUrlToPdf } = require('../../services/pdfRenderer.service')
const { buildInvoiceVoucherDocument } = require('../../lib/arcaVoucherDocument')

// Mismo patrón que el token de impresión de informes mensuales
// (monthlyReport/reportPdf.controller.js): secreto DERIVADO (distinto del de
// sesión), TTL corto, claim `purpose` fijo — solo lo usa el render headless.
const PRINT_TOKEN_TTL = '3m'
const printSecret = () => `${process.env.JWT_SECRET}:invoice-print`

function signPrintToken(invoiceId) {
  return jwt.sign({ purpose: 'invoice-print', invoiceId }, printSecret(), { algorithm: 'HS256', expiresIn: PRINT_TOKEN_TTL })
}

function verifyPrintToken(token) {
  const decoded = jwt.verify(token, printSecret(), { algorithms: ['HS256'] })
  if (decoded.purpose !== 'invoice-print' || !decoded.invoiceId) throw new Error('Invalid token')
  return decoded
}

function frontendBaseUrl(slug) {
  if (process.env.PDF_RENDER_BASE_URL) return process.env.PDF_RENDER_BASE_URL.replace(/\/$/, '')
  if (process.env.NODE_ENV === 'production' && process.env.APP_DOMAIN && slug) {
    return `https://${slug}.${process.env.APP_DOMAIN}`
  }
  return (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '')
}

async function renderInvoicePdf(invoiceId, slug) {
  const url = `${frontendBaseUrl(slug)}/finanzas/factura-print/${signPrintToken(invoiceId)}`
  return renderUrlToPdf(url, { readyFlag: '__INVOICE_PRINT_READY__' })
}

function sendPdf(res, pdf, filename) {
  res.set('Content-Type', 'application/pdf')
  res.set('Content-Disposition', contentDisposition(filename))
  res.set('Content-Length', String(pdf.length))
  res.set('Cache-Control', 'no-store')
  res.send(pdf)
}

// GET /api/finanzas/invoices/:id/pdf — descarga autenticada, para el equipo.
async function downloadInvoicePdf(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const id = Number(req.params.id)
    const invoice = await prisma.financeInvoice.findFirst({ where: { id, workspaceId, deletedAt: null } })
    if (!invoice) return res.status(404).json({ error: 'Factura no encontrada' })
    if (!invoice.cae) return res.status(400).json({ error: 'Esta factura todavía no tiene CAE — no se puede generar el PDF.' })

    const kindLabel = invoice.kind === 'credit_note' ? 'Nota de crédito' : invoice.kind === 'debit_note' ? 'Nota de débito' : 'Factura'
    const pdf = await renderInvoicePdf(invoice.id, req.workspace.slug)
    sendPdf(res, pdf, `${kindLabel} ${invoice.number}.pdf`)
  } catch (err) { next(err) }
}

// GET /api/public/invoice-print/:printToken — datos para la vista de impresión
// (la abre Chromium headless, no una persona). Sin gate adicional: el token lo
// emite el backend solo a quien ya tiene acceso a la factura desde el panel, y
// vence a los pocos minutos.
async function getInvoiceForPrint(req, res, next) {
  try {
    let decoded
    try {
      decoded = verifyPrintToken(req.params.printToken)
    } catch {
      return res.status(401).json({ error: 'El enlace de impresión venció. Volvé a generar el PDF.' })
    }

    const invoice = await prisma.financeInvoice.findUnique({
      where: { id: decoded.invoiceId },
      include: {
        item: true,
        issuer: true,
        workspace: { select: { name: true, companyName: true, slug: true, logoData: true, brandColors: true } },
      },
    })
    if (!invoice || !invoice.issuer) return res.status(404).json({ error: 'Factura no encontrada' })

    const document = await buildInvoiceVoucherDocument(invoice, invoice.issuer, invoice.item)
    const qrDataUrl = await QRCode.toDataURL(document.qr, { margin: 1, width: 240 })

    res.set('Cache-Control', 'no-store')
    res.json({
      document,
      qrDataUrl,
      workspace: {
        name: invoice.workspace.companyName || invoice.workspace.name,
        slug: invoice.workspace.slug,
        hasLogo: !!invoice.workspace.logoData,
        brandColors: JSON.parse(invoice.workspace.brandColors || '[]'),
      },
    })
  } catch (err) {
    if (err.isOperational) return res.status(err.status || 400).json({ error: err.message })
    next(err)
  }
}

module.exports = { downloadInvoicePdf, getInvoiceForPrint, renderInvoicePdf }
