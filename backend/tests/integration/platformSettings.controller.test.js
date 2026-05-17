jest.mock('../../src/lib/prisma', () => {
  const tx = {
    platformSetting: {
      findUnique: jest.fn(),
      findMany:   jest.fn(),
      upsert:     jest.fn(),
    },
    platformSettingLog: {
      create:   jest.fn(),
      findMany: jest.fn(),
    },
  }
  return {
    ...tx,
    $transaction: jest.fn(async (fn) => fn(tx)),
    // El controller usa estos para preview/cleanup pero acá no los testeamos
    notification: { count: jest.fn(), deleteMany: jest.fn() },
    aiTokenLog:   { count: jest.fn(), deleteMany: jest.fn() },
    userLogin:    { count: jest.fn(), deleteMany: jest.fn() },
    dailyInsight: { count: jest.fn(), deleteMany: jest.fn() },
    emailLog:     { count: jest.fn(), deleteMany: jest.fn() },
  }
})

const request = require('supertest')
const jwt     = require('jsonwebtoken')
const prisma  = require('../../src/lib/prisma')
const app     = require('../../src/app')
const { invalidateCache } = require('../../src/lib/platformSettings')

const SECRET = process.env.JWT_SECRET

function superAdminToken() {
  return `Bearer ${jwt.sign(
    { userId: 99, workspaceId: null, role: 'owner', isSuperAdmin: true, name: 'Super', email: 'super@bliss.ar' },
    SECRET,
  )}`
}

function regularUserToken() {
  return `Bearer ${jwt.sign(
    { userId: 1, workspaceId: 1, role: 'admin', isSuperAdmin: false, name: 'User', email: 'u@bliss.ar' },
    SECRET,
  )}`
}

beforeEach(() => {
  jest.clearAllMocks()
  invalidateCache()
})

describe('GET /api/superadmin/settings', () => {
  it('rechaza con 403 si no es superadmin', async () => {
    const res = await request(app)
      .get('/api/superadmin/settings')
      .set('Authorization', regularUserToken())
    expect(res.status).toBe(403)
  })

  it('devuelve catálogo completo con valores actuales', async () => {
    prisma.platformSetting.findMany.mockResolvedValue([
      { key: 'trialDays', value: { value: 7 }, updatedAt: new Date('2026-01-01') },
    ])
    const res = await request(app)
      .get('/api/superadmin/settings')
      .set('Authorization', superAdminToken())
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.settings)).toBe(true)
    const trial = res.body.settings.find(s => s.key === 'trialDays')
    expect(trial.value).toBe(7)
    expect(trial.default).toBe(14)
    expect(trial.min).toBe(0)
    expect(trial.max).toBe(365)
    // Otro setting sin row en DB usa default
    const cooldown = res.body.settings.find(s => s.key === 'aiCooldownMinutes')
    expect(cooldown.value).toBe(60)
  })
})

describe('PUT /api/superadmin/settings', () => {
  it('rechaza body sin changes', async () => {
    const res = await request(app)
      .put('/api/superadmin/settings')
      .set('Authorization', superAdminToken())
      .send({})
    expect(res.status).toBe(400)
  })

  it('rechaza tipo inválido (string en integer field)', async () => {
    const res = await request(app)
      .put('/api/superadmin/settings')
      .set('Authorization', superAdminToken())
      .send({ changes: { trialDays: 'abc' } })
    expect(res.status).toBe(400)
    expect(res.body.details.trialDays).toMatch(/inválido/i)
  })

  it('rechaza valor fuera de bounds', async () => {
    const res = await request(app)
      .put('/api/superadmin/settings')
      .set('Authorization', superAdminToken())
      .send({ changes: { trialDays: -1 } })
    expect(res.status).toBe(400)
    expect(res.body.details.trialDays).toMatch(/rango/i)
  })

  it('rechaza key desconocida', async () => {
    const res = await request(app)
      .put('/api/superadmin/settings')
      .set('Authorization', superAdminToken())
      .send({ changes: { unknownKey: 42 } })
    expect(res.status).toBe(400)
  })

  it('rechaza cross-field: tokenCritical ≤ tokenWarning', async () => {
    prisma.platformSetting.findMany.mockResolvedValue([
      { key: 'tokenWarningPct',  value: { value: 90 } },
      { key: 'tokenCriticalPct', value: { value: 95 } },
    ])
    const res = await request(app)
      .put('/api/superadmin/settings')
      .set('Authorization', superAdminToken())
      .send({ changes: { tokenCriticalPct: 80 } })
    expect(res.status).toBe(400)
    expect(res.body.details.tokenCriticalPct).toMatch(/mayor/i)
  })

  it('aplica cambios válidos y escribe audit log', async () => {
    prisma.platformSetting.findUnique.mockResolvedValue({
      key: 'trialDays',
      value: { value: 14 },
    })
    prisma.platformSetting.upsert.mockResolvedValue({})
    prisma.platformSettingLog.create.mockResolvedValue({})

    const res = await request(app)
      .put('/api/superadmin/settings')
      .set('Authorization', superAdminToken())
      .send({ changes: { trialDays: 7 } })

    expect(res.status).toBe(200)
    expect(res.body.updated).toBe(1)
    expect(prisma.platformSetting.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where:  { key: 'trialDays' },
      update: { value: { value: 7 } },
    }))
    expect(prisma.platformSettingLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        settingKey:  'trialDays',
        oldValue:    { value: 14 },
        newValue:    { value: 7 },
        changedById: 99,
      }),
    }))
  })

  it('skip cuando el valor es idéntico al actual', async () => {
    prisma.platformSetting.findUnique.mockResolvedValue({
      key: 'trialDays',
      value: { value: 14 },
    })

    const res = await request(app)
      .put('/api/superadmin/settings')
      .set('Authorization', superAdminToken())
      .send({ changes: { trialDays: 14 } })

    expect(res.status).toBe(200)
    expect(res.body.updated).toBe(0)
    expect(prisma.platformSetting.upsert).not.toHaveBeenCalled()
    expect(prisma.platformSettingLog.create).not.toHaveBeenCalled()
  })
})

describe('GET /api/superadmin/settings/log', () => {
  it('devuelve historial paginado', async () => {
    prisma.platformSettingLog.findMany.mockResolvedValue([
      { id: 1, settingKey: 'trialDays', oldValue: { value: 14 }, newValue: { value: 7 }, changedById: 99, createdAt: new Date(), changedBy: { id: 99, name: 'Super' } },
    ])
    const res = await request(app)
      .get('/api/superadmin/settings/log?limit=20')
      .set('Authorization', superAdminToken())
    expect(res.status).toBe(200)
    expect(res.body.logs).toHaveLength(1)
    expect(res.body.logs[0].settingKey).toBe('trialDays')
  })
})
