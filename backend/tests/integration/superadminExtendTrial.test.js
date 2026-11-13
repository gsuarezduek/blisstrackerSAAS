// PATCH /api/superadmin/workspaces/:id/trial — extender/reabrir un trial hasta una fecha.
// Lo que importa: deja el workspace en `trialing` con trialEndsAt al FINAL del día en la
// tz del workspace (así el cron de free tier lo saltea hasta esa fecha), y no pisa una
// suscripción de Stripe viva ni una suspensión manual.
jest.mock('../../src/lib/prisma', () => ({
  user:         { findUnique: jest.fn() },
  workspace:    { findUnique: jest.fn(), update: jest.fn() },
  subscription: { findUnique: jest.fn() },
}))

const request = require('supertest')
const jwt     = require('jsonwebtoken')
const prisma  = require('../../src/lib/prisma')
const app     = require('../../src/app')

const SECRET = process.env.JWT_SECRET
const auth = `Bearer ${jwt.sign(
  { userId: 99, workspaceId: null, role: 'owner', isSuperAdmin: true, name: 'Super', email: 'super@bliss.ar' },
  SECRET,
)}`

function futureDate(days) {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

const patch = (body, id = 5) =>
  request(app).patch(`/api/superadmin/workspaces/${id}/trial`).set('Authorization', auth).send(body)

beforeEach(() => {
  jest.clearAllMocks()
  prisma.user.findUnique.mockResolvedValue({ isSuperAdmin: true })
  prisma.workspace.findUnique.mockResolvedValue({ id: 5, status: 'past_due', timezone: 'America/Argentina/Buenos_Aires', billingExempt: false })
  prisma.subscription.findUnique.mockResolvedValue(null)
  prisma.workspace.update.mockImplementation(async ({ data }) => ({ id: 5, ...data }))
})

describe('PATCH /api/superadmin/workspaces/:id/trial', () => {
  it('reabre un trial vencido hasta el final del día en la tz del workspace', async () => {
    const until = futureDate(10)
    const res = await patch({ until })
    expect(res.status).toBe(200)
    const { data } = prisma.workspace.update.mock.calls[0][0]
    expect(data.status).toBe('trialing')
    // 23:59:59.999 en Buenos Aires (UTC-3) = 02:59:59.999 UTC del día siguiente
    const next = new Date(`${until}T00:00:00Z`); next.setUTCDate(next.getUTCDate() + 1)
    expect(data.trialEndsAt.toISOString()).toBe(`${next.toISOString().slice(0, 10)}T02:59:59.999Z`)
  })

  it('rechaza una fecha pasada o mal formada', async () => {
    expect((await patch({ until: '2020-01-01' })).status).toBe(400)
    expect((await patch({ until: '10/12/2030' })).status).toBe(400)
    expect((await patch({})).status).toBe(400)
    expect(prisma.workspace.update).not.toHaveBeenCalled()
  })

  it('no toca un workspace con suscripción de Stripe activa', async () => {
    prisma.subscription.findUnique.mockResolvedValue({ stripeSubId: 'sub_1', status: 'active' })
    const res = await patch({ until: futureDate(10) })
    expect(res.status).toBe(409)
    expect(prisma.workspace.update).not.toHaveBeenCalled()
  })

  it('no reabre un workspace suspendido ni uno exento', async () => {
    prisma.workspace.findUnique.mockResolvedValueOnce({ id: 5, status: 'suspended', timezone: 'UTC', billingExempt: false })
    expect((await patch({ until: futureDate(10) })).status).toBe(409)
    prisma.workspace.findUnique.mockResolvedValueOnce({ id: 5, status: 'active', timezone: 'UTC', billingExempt: true })
    expect((await patch({ until: futureDate(10) })).status).toBe(409)
    expect(prisma.workspace.update).not.toHaveBeenCalled()
  })

  it('404 si el workspace no existe', async () => {
    prisma.workspace.findUnique.mockResolvedValue(null)
    expect((await patch({ until: futureDate(10) })).status).toBe(404)
  })
})
