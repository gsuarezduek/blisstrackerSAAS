jest.mock('../../src/lib/prisma', () => {
  const m = {
    workspace:       { findUnique: jest.fn() },
    workspaceMember: { findUnique: jest.fn() },
    featureFlag:     { findUnique: jest.fn() },
    financeCard:     { findFirst: jest.fn(), update: jest.fn() },
    financeCardRule: { findMany: jest.fn(), upsert: jest.fn() },
    financeCardStatement:     { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    financeCardStatementLine: { findMany: jest.fn(), createMany: jest.fn() },
    financeCategory: { findMany: jest.fn() },
    financeItem:     { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn() },
    financeAccount:  { findFirst: jest.fn() },
    financeMovement: { create: jest.fn(), findMany: jest.fn(), updateMany: jest.fn() },
    financeAuditLog: { create: jest.fn() },
  }
  m.$transaction = jest.fn(arg => (typeof arg === 'function' ? arg(m) : Promise.all(arg)))
  return m
})
jest.mock('../../src/services/cardStatementParser.service', () => ({
  extractPdfText: jest.fn(),
  extractStatement: jest.fn(),
  suggestCategories: jest.fn(),
}))
jest.mock('../../src/services/objectStorage.service', () => ({
  isConfigured: jest.fn(() => true),
  putObject: jest.fn(async () => ({ key: 'finance/1/card-statements/x.pdf', url: 'u', size: 1234 })),
  deleteObject: jest.fn(async () => {}),
  deleteObjects: jest.fn(async () => ({ deleted: 0 })),
  getObjectStream: jest.fn(),
}))

const request = require('supertest')
const jwt     = require('jsonwebtoken')
const prisma  = require('../../src/lib/prisma')
const parser  = require('../../src/services/cardStatementParser.service')
const objectStorage = require('../../src/services/objectStorage.service')
const app     = require('../../src/app')
const { sanitizeLines } = require('../../src/lib/cardStatement')

const SECRET = process.env.JWT_SECRET
const WS = 1
const PDF = Buffer.from('%PDF-1.4\n% resumen de prueba\n')

function auth() {
  return `Bearer ${jwt.sign({ userId: 1, workspaceId: WS, role: 'admin', isSuperAdmin: false, name: 'Test', email: 't@t.com' }, SECRET)}`
}

function mockAccess() {
  prisma.workspace.findUnique.mockResolvedValue({
    id: WS, slug: 'bliss', status: 'active', name: 'Bliss', disabledFeatureKeys: '[]',
    members: [{ workspaceId: WS, userId: 1, role: 'admin', active: true }],
  })
  prisma.featureFlag.findUnique.mockResolvedValue({ key: 'finanzas', enabledGlobally: true, enabledWorkspaceIds: '[]' })
}

const CARD = {
  id: 7, workspaceId: WS, name: 'Visa Signature', last4: '6436', arsAccountId: 3, usdAccountId: 4,
  arsAccount: { id: 3, name: 'Patagonia $', currency: 'ARS' }, usdAccount: { id: 4, name: 'Patagonia U$S', currency: 'USD' },
}
const raw = (date, description, amount, currency, kind, voucher = null) => ({ date, voucher, description, installment: null, currency, amount, kind })
const EXTRACTED = {
  isCardStatement: true, bank: 'Banco Patagonia', cardBrand: 'Visa', last4: '6436', closingDate: '2026-10-22', dueDate: '2026-11-02',
  balances: [
    { currency: 'ARS', previousBalance: '100000.00', currentBalance: '50000.00' },
    { currency: 'USD', previousBalance: '10.00', currentBalance: '20.07' },
  ],
  lines: [
    raw('2026-10-02', 'SU PAGO EN PESOS', '100000.00', 'ARS', 'payment'),
    raw('2026-10-02', 'SU PAGO EN USD', '10.00', 'USD', 'payment'),
    raw('2026-09-25', 'FACEBK *N7RA77W5V4', '30000.00', 'ARS', 'purchase', '488422V'),
    raw('2026-09-27', 'FACEBK *W9SFD7W5V4', '20000.00', 'ARS', 'purchase', '245606V'),
    raw('2026-09-26', 'Netflix com', '13000.00', 'ARS', 'purchase', '783554K'),
    raw('2026-09-30', 'BONIFIC. COMIS. PROD. PAT', '13000.00', 'ARS', 'credit'),
    raw('2026-09-24', 'ANTHROPIC', '20.07', 'USD', 'purchase', '592104K'),
  ],
}

function post(path) {
  return request(app).post(`/api/finanzas${path}`).set('Authorization', auth()).set('X-Workspace', 'bliss')
}

beforeEach(() => {
  jest.clearAllMocks()
  mockAccess()
  prisma.financeCard.findFirst.mockResolvedValue(CARD)
  prisma.financeCardStatementLine.findMany.mockResolvedValue([])
  prisma.financeCardRule.findMany.mockResolvedValue([])
  prisma.financeAuditLog.create.mockResolvedValue({})
})

describe('POST /card-statements/parse', () => {
  it('pide la clave cuando el PDF la tiene (422 con code)', async () => {
    parser.extractPdfText.mockRejectedValue(Object.assign(new Error('Este PDF tiene clave.'), { status: 422, code: 'PDF_PASSWORD_REQUIRED', isOperational: true }))
    const res = await post('/card-statements/parse').field('cardId', '7').attach('file', PDF, 'resumen.pdf')
    expect(res.status).toBe(422)
    expect(res.body.code).toBe('PDF_PASSWORD_REQUIRED')
  })

  it('rechaza un archivo que no es PDF', async () => {
    const res = await post('/card-statements/parse').field('cardId', '7').attach('file', Buffer.from('hola que tal'), 'x.pdf')
    expect(res.status).toBe(400)
    expect(parser.extractPdfText).not.toHaveBeenCalled()
  })

  it('arma la vista previa: memoria de la tarjeta, sugerencia de la IA, pagos y ya importados aparte', async () => {
    parser.extractPdfText.mockResolvedValue({ text: 'texto', encrypted: true })
    parser.extractStatement.mockResolvedValue(EXTRACTED)
    // Netflix ya se importó en un resumen anterior (mismo renglón, misma huella).
    const netflixFp = sanitizeLines([EXTRACTED.lines[4]]).lines[0].fingerprint
    prisma.financeCardStatementLine.findMany.mockResolvedValue([{ fingerprint: netflixFp }])
    prisma.financeCardRule.findMany
      .mockResolvedValueOnce([{ merchantKey: 'FACEBK', type: 'expense', itemId: 11, categoryId: 21 }]) // esta tarjeta
      .mockResolvedValueOnce([]) // otras tarjetas
    prisma.financeCategory.findMany.mockResolvedValue([{ id: 21, name: 'Publicidad', type: 'expense' }, { id: 22, name: 'Reintegros', type: 'income' }])
    prisma.financeItem.findMany.mockResolvedValue([{ id: 11, name: 'Facebook Ads', categoryId: 21 }])
    parser.suggestCategories.mockImplementation(async (merchants) => new Map(merchants.map(m => [m.key, { itemId: null, categoryId: m.type === 'income' ? 22 : 21, newItemName: `Nuevo ${m.key}` }])))

    const res = await post('/card-statements/parse').field('cardId', '7').field('password', '123').attach('file', PDF, 'resumen.pdf')

    expect(res.status).toBe(200)
    expect(parser.extractPdfText).toHaveBeenCalledWith(expect.any(Buffer), '123')
    expect(res.body.statement).toMatchObject({ closingDate: '2026-10-22', dueDate: '2026-11-02', last4: '6436', encrypted: true })
    expect(res.body.checks).toEqual([
      expect.objectContaining({ currency: 'ARS', ok: true }),
      expect.objectContaining({ currency: 'USD', ok: true }),
    ])
    const facebk = res.body.groups.find(g => g.merchantKey === 'FACEBK')
    expect(facebk).toMatchObject({ total: '50000.00', suggestion: { itemId: 11, categoryId: 21, source: 'card' } })
    expect(facebk.lines).toHaveLength(2)
    const anthropic = res.body.groups.find(g => g.merchantKey === 'ANTHROPIC')
    expect(anthropic).toMatchObject({ currency: 'USD', suggestion: { newItemName: 'Nuevo ANTHROPIC', categoryId: 21, source: 'ai' } })
    expect(res.body.groups.find(g => g.merchantKey === 'BONIFIC COMIS PROD PAT')).toMatchObject({ type: 'income', suggestion: { categoryId: 22 } })
    expect(res.body.groups.some(g => g.merchantKey === 'NETFLIX COM')).toBe(false)
    expect(res.body.alreadyImported).toHaveLength(1)
    expect(res.body.payments).toHaveLength(2)
    // A la IA solo van los comercios que la memoria no conoce.
    const asked = parser.suggestCategories.mock.calls.flatMap(c => c[0].map(m => m.key))
    expect(asked).not.toContain('FACEBK')
  })
})

function confirmPayload(overrides = {}) {
  const { lines } = sanitizeLines(EXTRACTED.lines)
  const facebk = lines.filter(l => l.merchantKey === 'FACEBK')
  const anthropic = lines.filter(l => l.merchantKey === 'ANTHROPIC')
  return {
    cardId: 7, arsAccountId: 3, usdAccountId: 4, dateMode: 'due', closingDate: '2026-10-22', dueDate: '2026-11-02', encrypted: false,
    groups: [
      { type: 'expense', currency: 'ARS', itemId: 11, categoryId: 21, lines: facebk },
      { type: 'expense', currency: 'USD', itemId: null, newItemName: 'Anthropic', categoryId: 21, lines: anthropic },
    ],
    ...overrides,
  }
}

function mockConfirmRefs() {
  prisma.financeAccount.findFirst.mockImplementation(async ({ where }) => (
    where.id === 3 ? { id: 3, name: 'Patagonia $', currency: 'ARS' } : where.id === 4 ? { id: 4, name: 'Patagonia U$S', currency: 'USD' } : null
  ))
  prisma.financeItem.findMany.mockResolvedValue([{ id: 11, name: 'Facebook Ads', tracksAccount: false }])
  prisma.financeCategory.findMany.mockResolvedValue([{ id: 21, type: 'expense' }])
  prisma.financeItem.findFirst.mockResolvedValue(null)
  prisma.financeItem.create.mockResolvedValue({ id: 12, name: 'Anthropic', tracksAccount: false })
  prisma.financeCardStatement.create.mockResolvedValue({ id: 99 })
  let n = 500
  prisma.financeMovement.create.mockImplementation(async () => ({ id: n++ }))
}

describe('POST /card-statements (confirmar)', () => {
  it('crea un movimiento por grupo, en la cuenta de su moneda, guarda el PDF y la memoria', async () => {
    mockConfirmRefs()
    const res = await post('/card-statements').field('payload', JSON.stringify(confirmPayload())).attach('file', PDF, 'resumen.pdf')

    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({ statementId: 99, movements: 2, fileStored: true })
    expect(objectStorage.putObject).toHaveBeenCalledWith(expect.any(Buffer), 'application/pdf', { prefix: 'finance/1/card-statements' })
    expect(prisma.financeCardStatement.create).toHaveBeenCalledWith({ data: expect.objectContaining({ fileKey: 'finance/1/card-statements/x.pdf', fileExpiresAt: expect.any(Date) }) })

    const [ars, usd] = prisma.financeMovement.create.mock.calls.map(c => c[0].data)
    // El total sale de los renglones, con la fecha del vencimiento.
    expect(ars).toMatchObject({ type: 'expense', accountId: 3, itemId: 11, categoryId: 21, amount: '50000.00', paymentMethod: null })
    expect(ars.date.toISOString().slice(0, 10)).toBe('2026-11-02')
    expect(ars.note).toBe('Visa Signature · 2 renglones de FACEBK del 25/09 al 27/09')
    expect(usd).toMatchObject({ accountId: 4, itemId: 12, amount: '20.07' })
    expect(prisma.financeItem.create).toHaveBeenCalledWith(expect.objectContaining({ data: { workspaceId: WS, name: 'Anthropic', categoryId: 21 } }))

    expect(prisma.financeCardStatementLine.createMany).toHaveBeenCalledTimes(2)
    expect(prisma.financeCardRule.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { cardId_merchantKey_type: { cardId: 7, merchantKey: 'FACEBK', type: 'expense' } },
      update: { itemId: 11, categoryId: 21 },
    }))
  })

  it('con "fecha de cada consumo" usa el último consumo del grupo', async () => {
    mockConfirmRefs()
    const res = await post('/card-statements').field('payload', JSON.stringify(confirmPayload({ dateMode: 'line' }))).attach('file', PDF, 'r.pdf')
    expect(res.status).toBe(201)
    expect(prisma.financeMovement.create.mock.calls[0][0].data.date.toISOString().slice(0, 10)).toBe('2026-09-27')
  })

  it('rechaza una cuenta de otra moneda', async () => {
    mockConfirmRefs()
    const res = await post('/card-statements').field('payload', JSON.stringify(confirmPayload({ usdAccountId: 3 }))).attach('file', PDF, 'r.pdf')
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/en ARS/)
    expect(prisma.financeMovement.create).not.toHaveBeenCalled()
  })

  it('rechaza una categoría de ingresos para un consumo', async () => {
    mockConfirmRefs()
    prisma.financeCategory.findMany.mockResolvedValue([{ id: 21, type: 'income' }])
    const res = await post('/card-statements').field('payload', JSON.stringify(confirmPayload())).attach('file', PDF, 'r.pdf')
    expect(res.status).toBe(400)
  })

  it('no vuelve a importar renglones ya importados (409 si no queda nada)', async () => {
    mockConfirmRefs()
    const payload = confirmPayload()
    prisma.financeCardStatementLine.findMany.mockResolvedValue(payload.groups.flatMap(g => g.lines.map(l => ({ fingerprint: l.fingerprint }))))
    const res = await post('/card-statements').field('payload', JSON.stringify(payload)).attach('file', PDF, 'r.pdf')
    expect(res.status).toBe(409)
    expect(objectStorage.putObject).not.toHaveBeenCalled()
  })

  it('si la transacción falla, borra el PDF que subió', async () => {
    mockConfirmRefs()
    prisma.financeCardStatement.create.mockRejectedValue(new Error('boom'))
    const res = await post('/card-statements').field('payload', JSON.stringify(confirmPayload())).attach('file', PDF, 'r.pdf')
    expect(res.status).toBe(500)
    expect(objectStorage.deleteObject).toHaveBeenCalledWith('finance/1/card-statements/x.pdf')
  })
})

describe('DELETE /card-statements/:id (deshacer)', () => {
  it('borra (soft) los movimientos de la importación y el PDF', async () => {
    prisma.financeCardStatement.findFirst.mockResolvedValue({
      id: 99, fileKey: 'finance/1/card-statements/x.pdf', card: { name: 'Visa' },
      lines: [{ movementId: 500 }, { movementId: 500 }, { movementId: 501 }],
    })
    prisma.financeMovement.findMany.mockResolvedValue([{ id: 500 }, { id: 501 }])
    const res = await request(app).delete('/api/finanzas/card-statements/99').set('Authorization', auth()).set('X-Workspace', 'bliss')
    expect(res.status).toBe(200)
    expect(res.body.movements).toBe(2)
    expect(prisma.financeMovement.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: { in: [500, 501] } } }))
    expect(objectStorage.deleteObject).toHaveBeenCalledWith('finance/1/card-statements/x.pdf')
  })
})

describe('purgeExpiredStatementFiles', () => {
  it('borra de R2 los PDFs vencidos y limpia la key', async () => {
    const { purgeExpiredStatementFiles } = require('../../src/controllers/finanzas/cardStatements.controller')
    prisma.financeCardStatement.findMany = jest.fn().mockResolvedValue([{ id: 1, fileKey: 'a' }, { id: 2, fileKey: 'b' }])
    prisma.financeCardStatement.updateMany = jest.fn().mockResolvedValue({})
    const n = await purgeExpiredStatementFiles(new Date('2027-11-01'))
    expect(n).toBe(2)
    expect(objectStorage.deleteObjects).toHaveBeenCalledWith(['a', 'b'])
    expect(prisma.financeCardStatement.updateMany).toHaveBeenCalledWith({ where: { id: { in: [1, 2] } }, data: { fileKey: null } })
  })
})
