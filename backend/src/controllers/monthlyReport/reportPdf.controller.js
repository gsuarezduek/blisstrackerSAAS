const jwt = require('jsonwebtoken')
const contentDisposition = require('content-disposition')
const prisma = require('../../lib/prisma')
const { renderUrlToPdf } = require('../../services/pdfRenderer.service')
const { buildPublicReportPayload } = require('./reportPublic.controller')
const { reportLabel } = require('./_shared')

// El token de impresión es lo único que le da acceso al navegador headless a los datos
// del informe (incluso en borrador). Se firma con un secreto DERIVADO, distinto del de
// las sesiones: así nunca puede usarse como JWT de usuario en el resto de la API.
const PRINT_TOKEN_TTL = '3m'
const printSecret = () => `${process.env.JWT_SECRET}:report-print`

function signPrintToken(reportId) {
  return jwt.sign({ purpose: 'report-print', reportId }, printSecret(), { algorithm: 'HS256', expiresIn: PRINT_TOKEN_TTL })
}

function verifyPrintToken(token) {
  const decoded = jwt.verify(token, printSecret(), { algorithms: ['HS256'] })
  if (decoded.purpose !== 'report-print' || !decoded.reportId) throw new Error('Invalid token')
  return decoded
}

// URL de la SPA que Chromium va a abrir. En producción es el subdominio del workspace
// (cualquier subdominio sirve la SPA); en desarrollo, el front local.
function frontendBaseUrl(slug) {
  if (process.env.PDF_RENDER_BASE_URL) return process.env.PDF_RENDER_BASE_URL.replace(/\/$/, '')
  if (process.env.NODE_ENV === 'production' && process.env.APP_DOMAIN && slug) {
    return `https://${slug}.${process.env.APP_DOMAIN}`
  }
  return (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '')
}

/**
 * GET /api/marketing/projects/:id/reports/:month/pdf
 * Genera el PDF del informe (mismo contenido que ve el cliente, con portada) y lo
 * devuelve como descarga. Funciona también con el informe en borrador.
 */
async function downloadReportPdf(req, res, next) {
  try {
    const projectId   = Number(req.params.id)
    const workspaceId = req.workspace.id
    const { month }   = req.params

    if (!/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ error: 'Formato de mes inválido (esperado YYYY-MM)' })
    }

    const report = await prisma.monthlyReport.findFirst({
      where:  { projectId, workspaceId, month },
      select: {
        id: true, month: true, periodStart: true, periodEnd: true,
        enabledSections: true, dataCache: true, analysis: true,
        project: { select: { name: true } },
      },
    })
    const isGenerated = report && (report.enabledSections !== null || !!report.dataCache || !!report.analysis)
    if (!isGenerated) {
      return res.status(404).json({ error: 'Todavía no generaste este informe.' })
    }

    const pdf = await renderReportPdf(report.id, req.workspace.slug)
    sendPdf(res, pdf, report)
  } catch (err) {
    next(err)
  }
}

async function renderReportPdf(reportId, slug) {
  const url = `${frontendBaseUrl(slug)}/report-print/${signPrintToken(reportId)}`
  return renderUrlToPdf(url, { readyFlag: '__REPORT_PRINT_READY__' })
}

function sendPdf(res, pdf, report) {
  const filename = `Informe ${report.project?.name ?? ''} - ${reportLabel(report)}.pdf`.replace(/\s+/g, ' ')
  res.set('Content-Type', 'application/pdf')
  res.set('Content-Disposition', contentDisposition(filename))
  res.set('Content-Length', String(pdf.length))
  res.set('Cache-Control', 'no-store')
  res.send(pdf)
}

// Cache en memoria de los PDF públicos: el link del cliente lo puede abrir mucha gente
// (o el mismo cliente varias veces) y cada render de Chromium cuesta ~5-10 s y memoria.
// Se invalida si el informe cambió (updatedAt) y vence a los 30 min.
const PUBLIC_PDF_TTL_MS = 30 * 60 * 1000
const PUBLIC_PDF_MAX_ENTRIES = 20
const publicPdfCache = new Map() // token -> { pdf, version, at }

/**
 * GET /api/public/report/:token/pdf
 * Mismo PDF que descarga el equipo (portada + A4), para la vista pública del cliente
 * (link del informe y portal). Solo informes PUBLICADOS — igual que el link público.
 * Protegido con rate limit por IP en la ruta + el cache de arriba.
 */
async function downloadPublicReportPdf(req, res, next) {
  try {
    const { token } = req.params
    const report = await prisma.monthlyReport.findUnique({
      where:  { token },
      select: {
        id: true, month: true, periodStart: true, periodEnd: true, status: true, updatedAt: true,
        enabledSections: true, dataCache: true, analysis: true,
        project:   { select: { name: true } },
        workspace: { select: { slug: true } },
      },
    })
    const isGenerated = report && (report.enabledSections !== null || !!report.dataCache || !!report.analysis)
    if (!isGenerated) return res.status(404).json({ error: 'Informe no encontrado' })
    if (report.status !== 'published') {
      return res.status(404).json({ error: 'Este informe todavía no está publicado.', code: 'REPORT_DRAFT' })
    }

    const version = report.updatedAt ? new Date(report.updatedAt).getTime() : 0
    const hit = publicPdfCache.get(token)
    if (hit && hit.version === version && Date.now() - hit.at < PUBLIC_PDF_TTL_MS) {
      return sendPdf(res, hit.pdf, report)
    }

    const pdf = await renderReportPdf(report.id, report.workspace?.slug)
    publicPdfCache.set(token, { pdf, version, at: Date.now() })
    if (publicPdfCache.size > PUBLIC_PDF_MAX_ENTRIES) {
      publicPdfCache.delete(publicPdfCache.keys().next().value) // el más viejo (orden de inserción)
    }
    sendPdf(res, pdf, report)
  } catch (err) {
    next(err)
  }
}

/**
 * GET /api/public/report-print/:printToken
 * Datos del informe para la vista de impresión (la abre Chromium, no una persona).
 * Sin gate de "publicado": el token lo emite el backend solo a quien ya tiene acceso
 * al informe desde el panel, y vence a los pocos minutos.
 */
async function getReportForPrint(req, res, next) {
  try {
    let decoded
    try {
      decoded = verifyPrintToken(req.params.printToken)
    } catch {
      return res.status(401).json({ error: 'El enlace de impresión venció. Volvé a generar el PDF.' })
    }

    const report = await prisma.monthlyReport.findUnique({ where: { id: decoded.reportId } })
    if (!report) return res.status(404).json({ error: 'Informe no encontrado' })

    const [payload, portal] = await Promise.all([
      buildPublicReportPayload(report),
      prisma.projectClientPortal.findUnique({
        where:  { projectId: report.projectId },
        select: { slug: true, bannerMimeType: true },
      }),
    ])
    delete payload.siblings

    res.set('Cache-Control', 'no-store')
    res.json({
      ...payload,
      portal: portal?.bannerMimeType ? { slug: portal.slug } : null,   // banner del portal → portada
    })
  } catch (err) {
    next(err)
  }
}

module.exports = { downloadReportPdf, downloadPublicReportPdf, getReportForPrint, _publicPdfCache: publicPdfCache }
