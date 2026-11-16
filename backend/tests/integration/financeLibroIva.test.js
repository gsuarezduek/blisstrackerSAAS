jest.mock('../../src/lib/prisma', () => ({
  workspace:       { findUnique: jest.fn() },
  workspaceMember: { findUnique: jest.fn() },
  featureFlag:     { findUnique: jest.fn() },
  financeIssuer:   { findFirst: jest.fn() },
  financeInvoice:  { findMany: jest.fn(), update: jest.fn() },
}))

const request = require('supertest')
const jwt     = require('jsonwebtoken')
const JSZip   = require('jszip')
const prisma  = require('../../src/lib/prisma')
const app     = require('../../src/app')

const SECRET         = process.env.JWT_SECRET
const WORKSPACE_SLUG = 'bliss'
const WORKSPACE_ID   = 1

function authHeader() {
  const token = jwt.sign(
    { userId: 1, workspaceId: WORKSPACE_ID, role: 'admin', isSuperAdmin: false, name: 'Test', email: 't@t.com' },
    SECRET,
  )
  return `Bearer ${token}`
}

function mockAccess() {
  prisma.workspace.findUnique.mockResolvedValue({
    id: WORKSPACE_ID, slug: WORKSPACE_SLUG, status: 'active', name: 'Bliss',
    disabledFeatureKeys: '[]', financeIvaMode: 'add',
    members: [{ workspaceId: WORKSPACE_ID, userId: 1, role: 'admin', active: true }],
  })
  prisma.featureFlag.findUnique.mockResolvedValue({ key: 'finanzas', enabledGlobally: true, enabledWorkspaceIds: '[]' })
}

const ISSUER = { id: 3, workspaceId: WORKSPACE_ID, name: 'Bliss SRL', cuit: '30-71234567-8', taxCondition: 'responsable_inscripto', environment: 'production', salesPoint: 10 }

function voucher(number, overrides = {}) {
  return {
    voucherType: 1, salesPoint: 10, number, date: '2026-10-05',
    header: { documentType: 80, documentNumber: '30715659480', currencyId: 'PES', exchangeRate: '1' },
    totals: { total: 121000, netTaxed: 100000, untaxed: 0, exempt: 0, vat: 21000, otherTaxes: 0, vatRates: [{ id: 5, base: 100000, amount: 21000 }] },
    ...overrides,
  }
}

function invoice(id, overrides = {}) {
  return {
    id, workspaceId: WORKSPACE_ID, issuerId: 3, kind: 'invoice', number: `00010-0000000${id}`,
    cae: '7000000000000', arcaStatus: 'authorized', arcaResponseRaw: { voucher: voucher(id) },
    item: { name: 'LCE', legalName: 'LCE CONSTRUCCIONES SA' },
    ...overrides,
  }
}

function get(query) {
  return request(app)
    .get('/api/finanzas/invoices/libro-iva')
    .query(query)
    .set('Authorization', authHeader())
    .set('X-Workspace', WORKSPACE_SLUG)
}

describe('GET /api/finanzas/invoices/libro-iva', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockAccess()
    prisma.financeIssuer.findFirst.mockResolvedValue(ISSUER)
  })

  it('busca las facturas del emisor en el mes pedido', async () => {
    prisma.financeInvoice.findMany.mockResolvedValue([])
    const res = await get({ issuerId: 3, month: '2026-10' })
    expect(res.status).toBe(200)
    expect(prisma.financeInvoice.findMany.mock.calls[0][0].where).toEqual(expect.objectContaining({
      workspaceId: WORKSPACE_ID, issuerId: 3, deletedAt: null,
      issueDate: { gte: new Date('2026-10-01T00:00:00Z'), lt: new Date('2026-11-01T00:00:00Z') },
    }))
  })

  it('el resumen resta las notas de crédito y deja afuera rechazadas y sin confirmar, avisando', async () => {
    prisma.financeInvoice.findMany.mockResolvedValue([
      invoice(1),
      invoice(2, { kind: 'credit_note', arcaResponseRaw: { voucher: voucher(2, { voucherType: 3, totals: { total: 12100, netTaxed: 10000, vat: 2100, vatRates: [{ id: 5, base: 10000, amount: 2100 }] } }) } }),
      invoice(3, { cae: null, arcaStatus: 'rejected', arcaResponseRaw: { issues: [] } }),
      invoice(4, { cae: null, arcaStatus: 'indeterminate', number: null, arcaResponseRaw: {} }),
    ])
    const res = await get({ issuerId: 3, month: '2026-10' })
    expect(res.status).toBe(200)
    expect(res.body.counts).toEqual({ total: 2, invoice: 1, creditNote: 1, debitNote: 0, alicuotaLines: 2 })
    expect(res.body.amounts).toEqual({ total: '1089.00', netTaxed: '900.00', vat: '189.00' })
    expect(res.body.warnings.map(w => w.code)).toEqual(['pending'])
    expect(res.body.warnings[0].invoices.map(i => i.id)).toEqual([4])
  })

  it('descarga un ZIP con los dos .txt en Windows-1252 y CRLF', async () => {
    prisma.financeInvoice.findMany.mockResolvedValue([
      invoice(1, { item: { name: 'Peña', legalName: 'PEÑA SRL' } }),
    ])
    const res = await get({ issuerId: 3, month: '2026-10', download: '1' })
      .buffer(true).parse((r, cb) => { const chunks = []; r.on('data', c => chunks.push(c)); r.on('end', () => cb(null, Buffer.concat(chunks))) })
    expect(res.status).toBe(200)
    expect(res.headers['content-disposition']).toContain('LIBRO_IVA_DIGITAL_VENTAS_30712345678_202610.zip')

    const zip = await JSZip.loadAsync(res.body)
    const names = Object.keys(zip.files).sort()
    expect(names).toEqual([
      'LIBRO_IVA_DIGITAL_VENTAS_ALICUOTAS_30712345678_202610.txt',
      'LIBRO_IVA_DIGITAL_VENTAS_CBTE_30712345678_202610.txt',
    ])
    const cbte = await zip.file(names[1]).async('nodebuffer')
    expect(cbte.length).toBe(266 + 2) // una línea + CRLF, un byte por carácter
    expect(cbte.subarray(-2).toString()).toBe('\r\n')
    expect(cbte[78 + 2]).toBe(0xD1) // la Ñ de "PEÑA" en Windows-1252
    const alic = await zip.file(names[0]).async('string')
    expect(alic).toBe('00100010000000000000000000010000000001000000005000000000021000\r\n')
  })

  it('no arma libro para un emisor que no es responsable inscripto', async () => {
    prisma.financeIssuer.findFirst.mockResolvedValue({ ...ISSUER, taxCondition: 'monotributo' })
    const res = await get({ issuerId: 3, month: '2026-10' })
    expect(res.status).toBe(400)
    expect(prisma.financeInvoice.findMany).not.toHaveBeenCalled()
  })

  it('avisa si el emisor está en homologación', async () => {
    prisma.financeIssuer.findFirst.mockResolvedValue({ ...ISSUER, environment: 'test' })
    prisma.financeInvoice.findMany.mockResolvedValue([invoice(1)])
    const res = await get({ issuerId: 3, month: '2026-10' })
    expect(res.body.warnings.map(w => w.code)).toEqual(['test_environment'])
  })

  it('valida emisor y período', async () => {
    expect((await get({ month: '2026-10' })).status).toBe(400)
    expect((await get({ issuerId: 3, month: '2026-13' })).status).toBe(400)
    prisma.financeIssuer.findFirst.mockResolvedValue(null)
    expect((await get({ issuerId: 99, month: '2026-10' })).status).toBe(400)
  })

  it('sin comprobantes no descarga archivos vacíos', async () => {
    prisma.financeInvoice.findMany.mockResolvedValue([])
    const res = await get({ issuerId: 3, month: '2026-10', download: '1' })
    expect(res.status).toBe(400)
  })
})
