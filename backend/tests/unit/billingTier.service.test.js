jest.mock('../../src/lib/prisma', () => ({
  workspace:       { findUnique: jest.fn(), update: jest.fn() },
  subscription:    { findUnique: jest.fn() },
  workspaceMember: { count: jest.fn() },
}))
jest.mock('../../src/lib/platformSettings', () => ({
  getSetting: jest.fn(),
}))

const prisma = require('../../src/lib/prisma')
const { getSetting } = require('../../src/lib/platformSettings')
const { reconcileWorkspaceTier } = require('../../src/services/billingTier.service')

const WS = 1

// Helpers para armar escenarios
function setup({ ws, sub = null, seats = 0, limit = 3 }) {
  prisma.workspace.findUnique.mockResolvedValue(ws)
  prisma.subscription.findUnique.mockResolvedValue(sub)
  prisma.workspaceMember.count.mockResolvedValue(seats)
  getSetting.mockResolvedValue(limit)
}

const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
const past   = new Date(Date.now() - 24 * 60 * 60 * 1000)

describe('reconcileWorkspaceTier', () => {
  beforeEach(() => jest.clearAllMocks())

  it('rescata un past_due con ≤ límite usuarios a active (plan Gratis)', async () => {
    setup({ ws: { id: WS, status: 'past_due', trialEndsAt: past, billingExempt: false }, seats: 2, limit: 3 })
    const result = await reconcileWorkspaceTier(WS)
    expect(result).toBe('active')
    expect(prisma.workspace.update).toHaveBeenCalledWith({ where: { id: WS }, data: { status: 'active' } })
  })

  it('marca past_due un workspace gratis que supera el límite', async () => {
    setup({ ws: { id: WS, status: 'active', trialEndsAt: past, billingExempt: false }, seats: 4, limit: 3 })
    const result = await reconcileWorkspaceTier(WS)
    expect(result).toBe('past_due')
    expect(prisma.workspace.update).toHaveBeenCalledWith({ where: { id: WS }, data: { status: 'past_due' } })
  })

  it('un trial vencido con ≤ límite pasa a active (plan Gratis)', async () => {
    setup({ ws: { id: WS, status: 'trialing', trialEndsAt: past, billingExempt: false }, seats: 3, limit: 3 })
    expect(await reconcileWorkspaceTier(WS)).toBe('active')
    expect(prisma.workspace.update).toHaveBeenCalledWith({ where: { id: WS }, data: { status: 'active' } })
  })

  it('un trial vencido que supera el límite pasa a past_due', async () => {
    setup({ ws: { id: WS, status: 'trialing', trialEndsAt: past, billingExempt: false }, seats: 5, limit: 3 })
    expect(await reconcileWorkspaceTier(WS)).toBe('past_due')
  })

  it('no toca un trial en curso', async () => {
    setup({ ws: { id: WS, status: 'trialing', trialEndsAt: future, billingExempt: false }, seats: 9, limit: 3 })
    expect(await reconcileWorkspaceTier(WS)).toBeNull()
    expect(prisma.workspace.update).not.toHaveBeenCalled()
  })

  it('no toca workspaces exentos de billing (ej: bliss)', async () => {
    setup({ ws: { id: WS, status: 'past_due', trialEndsAt: past, billingExempt: true }, seats: 50, limit: 3 })
    expect(await reconcileWorkspaceTier(WS)).toBeNull()
    expect(prisma.workspace.update).not.toHaveBeenCalled()
  })

  it('no toca workspaces con suscripción Stripe paga y activa', async () => {
    setup({
      ws:   { id: WS, status: 'active', trialEndsAt: past, billingExempt: false },
      sub:  { stripeSubId: 'sub_123', status: 'active' },
      seats: 10, limit: 3,
    })
    expect(await reconcileWorkspaceTier(WS)).toBeNull()
    expect(prisma.workspace.update).not.toHaveBeenCalled()
  })

  it('no toca suspendidos ni cancelados (estados manuales)', async () => {
    setup({ ws: { id: WS, status: 'suspended', trialEndsAt: past, billingExempt: false }, seats: 1, limit: 3 })
    expect(await reconcileWorkspaceTier(WS)).toBeNull()
    expect(prisma.workspace.update).not.toHaveBeenCalled()
  })

  it('no escribe en DB si el status ya es el correcto', async () => {
    setup({ ws: { id: WS, status: 'active', trialEndsAt: past, billingExempt: false }, seats: 2, limit: 3 })
    expect(await reconcileWorkspaceTier(WS)).toBe('active')
    expect(prisma.workspace.update).not.toHaveBeenCalled()
  })

  it('con límite 0 (sin plan gratis) cualquier usuario activo cae a past_due', async () => {
    setup({ ws: { id: WS, status: 'active', trialEndsAt: past, billingExempt: false }, seats: 1, limit: 0 })
    expect(await reconcileWorkspaceTier(WS)).toBe('past_due')
  })

  it('devuelve null si el workspace no existe', async () => {
    setup({ ws: null })
    expect(await reconcileWorkspaceTier(WS)).toBeNull()
  })
})
