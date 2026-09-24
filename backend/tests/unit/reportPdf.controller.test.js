jest.mock('../../src/lib/prisma', () => ({
  monthlyReport:       { findFirst: jest.fn(), findUnique: jest.fn() },
  projectClientPortal: { findUnique: jest.fn() },
}))
jest.mock('../../src/services/pdfRenderer.service', () => ({ renderUrlToPdf: jest.fn() }))
jest.mock('../../src/controllers/monthlyReport/reportPublic.controller', () => ({ buildPublicReportPayload: jest.fn() }))

const jwt    = require('jsonwebtoken')
const prisma = require('../../src/lib/prisma')
const { renderUrlToPdf } = require('../../src/services/pdfRenderer.service')
const { buildPublicReportPayload } = require('../../src/controllers/monthlyReport/reportPublic.controller')
const { downloadReportPdf, getReportForPrint } = require('../../src/controllers/monthlyReport/reportPdf.controller')

function mockRes() {
  const res = { statusCode: 200, headers: {}, body: undefined }
  res.status = jest.fn(c => { res.statusCode = c; return res })
  res.json   = jest.fn(b => { res.body = b; return res })
  res.send   = jest.fn(b => { res.body = b; return res })
  res.set    = jest.fn((k, v) => { res.headers[k] = v; return res })
  return res
}

const GENERATED = {
  id: 7, month: '2026-10', periodStart: null, periodEnd: null,
  enabledSections: '["analytics"]', dataCache: null, analysis: null,
  project: { name: 'Bliss' },
}
const reqFor = (over = {}) => ({ params: { id: '1', month: '2026-10' }, workspace: { id: 1, slug: 'bliss' }, ...over })

describe('downloadReportPdf', () => {
  it('rechaza un mes con formato inválido', async () => {
    const res = mockRes()
    await downloadReportPdf(reqFor({ params: { id: '1', month: 'octubre' } }), res, jest.fn())
    expect(res.statusCode).toBe(400)
    expect(renderUrlToPdf).not.toHaveBeenCalled()
  })

  it('404 si el informe todavía no fue generado', async () => {
    prisma.monthlyReport.findFirst.mockResolvedValue({ ...GENERATED, enabledSections: null })
    const res = mockRes()
    await downloadReportPdf(reqFor(), res, jest.fn())
    expect(res.statusCode).toBe(404)
    expect(renderUrlToPdf).not.toHaveBeenCalled()
  })

  it('scopea la búsqueda por proyecto y workspace', async () => {
    prisma.monthlyReport.findFirst.mockResolvedValue(null)
    await downloadReportPdf(reqFor(), mockRes(), jest.fn())
    expect(prisma.monthlyReport.findFirst.mock.calls[0][0].where).toEqual({ projectId: 1, workspaceId: 1, month: '2026-10' })
  })

  it('renderiza la vista de impresión con un token de vida corta y devuelve el PDF como descarga', async () => {
    prisma.monthlyReport.findFirst.mockResolvedValue(GENERATED)
    renderUrlToPdf.mockResolvedValue(Buffer.from('%PDF-fake'))
    const res = mockRes()
    await downloadReportPdf(reqFor(), res, jest.fn())

    const [url, opts] = renderUrlToPdf.mock.calls[0]
    expect(url).toMatch(/\/report-print\/[\w-]+\.[\w-]+\.[\w-]+$/)
    expect(opts.readyFlag).toBe('__REPORT_PRINT_READY__')

    expect(res.headers['Content-Type']).toBe('application/pdf')
    expect(res.headers['Content-Disposition']).toMatch(/^attachment; filename=/)
    expect(res.headers['Content-Disposition']).toContain('Informe Bliss')
    expect(res.body.toString()).toBe('%PDF-fake')
  })

  it('el token de impresión NO sirve como sesión de usuario (secreto distinto)', async () => {
    prisma.monthlyReport.findFirst.mockResolvedValue(GENERATED)
    renderUrlToPdf.mockResolvedValue(Buffer.from('x'))
    await downloadReportPdf(reqFor(), mockRes(), jest.fn())
    const printToken = renderUrlToPdf.mock.calls[0][0].split('/report-print/')[1]

    expect(() => jwt.verify(printToken, process.env.JWT_SECRET)).toThrow()
    const decoded = jwt.verify(printToken, `${process.env.JWT_SECRET}:report-print`)
    expect(decoded).toMatchObject({ purpose: 'report-print', reportId: 7 })
  })

  it('propaga el error del render al manejador de errores', async () => {
    prisma.monthlyReport.findFirst.mockResolvedValue(GENERATED)
    const boom = new Error('chromium no arrancó')
    renderUrlToPdf.mockRejectedValue(boom)
    const next = jest.fn()
    await downloadReportPdf(reqFor(), mockRes(), next)
    expect(next).toHaveBeenCalledWith(boom)
  })
})

describe('getReportForPrint', () => {
  const sign = (payload, secret = `${process.env.JWT_SECRET}:report-print`, opts = {}) => jwt.sign(payload, secret, opts)

  it('401 con un token inválido', async () => {
    const res = mockRes()
    await getReportForPrint({ params: { printToken: 'basura' } }, res, jest.fn())
    expect(res.statusCode).toBe(401)
  })

  it('401 con un JWT de sesión de usuario', async () => {
    const session = jwt.sign({ userId: 1, purpose: 'report-print', reportId: 7 }, process.env.JWT_SECRET)
    const res = mockRes()
    await getReportForPrint({ params: { printToken: session } }, res, jest.fn())
    expect(res.statusCode).toBe(401)
  })

  it('401 con un token vencido', async () => {
    const expired = sign({ purpose: 'report-print', reportId: 7 }, undefined, { expiresIn: -10 })
    const res = mockRes()
    await getReportForPrint({ params: { printToken: expired }, }, res, jest.fn())
    expect(res.statusCode).toBe(401)
  })

  it('401 si el token es de otro propósito', async () => {
    const res = mockRes()
    await getReportForPrint({ params: { printToken: sign({ purpose: 'otro', reportId: 7 }) } }, res, jest.fn())
    expect(res.statusCode).toBe(401)
  })

  it('devuelve el informe (aunque sea borrador), sin siblings y con el banner del portal si existe', async () => {
    prisma.monthlyReport.findUnique.mockResolvedValue({ id: 7, projectId: 1, status: 'draft' })
    buildPublicReportPayload.mockResolvedValue({ report: { month: '2026-10' }, workspace: { slug: 'bliss' }, siblings: [{ token: 'x' }], data: { ok: true } })
    prisma.projectClientPortal.findUnique.mockResolvedValue({ slug: 'cliente-bliss', bannerMimeType: 'image/png' })

    const res = mockRes()
    await getReportForPrint({ params: { printToken: sign({ purpose: 'report-print', reportId: 7 }) } }, res, jest.fn())

    expect(res.statusCode).toBe(200)
    expect(res.body.siblings).toBeUndefined()
    expect(res.body.data).toEqual({ ok: true })
    expect(res.body.portal).toEqual({ slug: 'cliente-bliss' })
    expect(res.headers['Cache-Control']).toBe('no-store')
  })

  it('sin banner en el portal, portal es null (la portada usa el gradiente de marca)', async () => {
    prisma.monthlyReport.findUnique.mockResolvedValue({ id: 7, projectId: 1 })
    buildPublicReportPayload.mockResolvedValue({ report: {}, workspace: null, siblings: [], data: {} })
    prisma.projectClientPortal.findUnique.mockResolvedValue({ slug: 's', bannerMimeType: null })

    const res = mockRes()
    await getReportForPrint({ params: { printToken: sign({ purpose: 'report-print', reportId: 7 }) } }, res, jest.fn())
    expect(res.body.portal).toBeNull()
  })

  it('404 si el informe ya no existe', async () => {
    prisma.monthlyReport.findUnique.mockResolvedValue(null)
    const res = mockRes()
    await getReportForPrint({ params: { printToken: sign({ purpose: 'report-print', reportId: 7 }) } }, res, jest.fn())
    expect(res.statusCode).toBe(404)
  })
})
