jest.mock('../../src/lib/prisma', () => ({
  workspace: { findUnique: jest.fn() },
}))
jest.mock('../../src/lib/platformSettings', () => ({
  getSettings: jest.fn(),
}))
jest.mock('../../src/services/workspaceStorage.service', () => ({
  computeWorkspaceStorageUsage: jest.fn(),
}))

const prisma = require('../../src/lib/prisma')
const { getSettings } = require('../../src/lib/platformSettings')
const { computeWorkspaceStorageUsage } = require('../../src/services/workspaceStorage.service')
const { getStorageBudget } = require('../../src/lib/storageBudget')

const MB = 1024 * 1024

function usage(total, extra = {}) {
  return { archivos: total, contenido: 0, imagenesSociales: 0, whatsapp: 0, total, ...extra }
}

describe('storageBudget — getStorageBudget', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    getSettings.mockResolvedValue({ defaultStorageLimitMb: 20480, storageWarningPct: 80, storageCriticalPct: 95 })
  })

  it('status "ok" muy por debajo del límite', async () => {
    prisma.workspace.findUnique.mockResolvedValue({ storageLimitMb: 1000 })
    computeWorkspaceStorageUsage.mockResolvedValue(usage(100 * MB))

    const budget = await getStorageBudget(1)

    expect(budget.status).toBe('ok')
    expect(budget.exceeded).toBe(false)
    expect(budget.pct).toBe(10)
    expect(budget.limitBytes).toBe(1000 * MB)
  })

  it('status "warning" al cruzar storageWarningPct', async () => {
    prisma.workspace.findUnique.mockResolvedValue({ storageLimitMb: 1000 })
    computeWorkspaceStorageUsage.mockResolvedValue(usage(850 * MB)) // 85%

    const budget = await getStorageBudget(1)

    expect(budget.status).toBe('warning')
    expect(budget.exceeded).toBe(false)
  })

  it('status "critical" al cruzar storageCriticalPct', async () => {
    prisma.workspace.findUnique.mockResolvedValue({ storageLimitMb: 1000 })
    computeWorkspaceStorageUsage.mockResolvedValue(usage(960 * MB)) // 96%

    const budget = await getStorageBudget(1)

    expect(budget.status).toBe('critical')
    expect(budget.exceeded).toBe(false)
  })

  it('status "exceeded" cuando usedBytes >= limitBytes', async () => {
    prisma.workspace.findUnique.mockResolvedValue({ storageLimitMb: 1000 })
    computeWorkspaceStorageUsage.mockResolvedValue(usage(1000 * MB))

    const budget = await getStorageBudget(1)

    expect(budget.status).toBe('exceeded')
    expect(budget.exceeded).toBe(true)
    expect(budget.pct).toBe(100)
  })

  it('storageLimitMb === 0 es ilimitado: pct 0, status "ok", nunca exceeded', async () => {
    prisma.workspace.findUnique.mockResolvedValue({ storageLimitMb: 0 })
    computeWorkspaceStorageUsage.mockResolvedValue(usage(999_999 * MB))

    const budget = await getStorageBudget(1)

    expect(budget.pct).toBe(0)
    expect(budget.status).toBe('ok')
    expect(budget.exceeded).toBe(false)
    expect(budget.limitBytes).toBe(0)
  })

  it('sin storageLimitMb propio (workspace no encontrado) cae al default global', async () => {
    prisma.workspace.findUnique.mockResolvedValue(null)
    computeWorkspaceStorageUsage.mockResolvedValue(usage(0))

    const budget = await getStorageBudget(1)

    expect(budget.limitBytes).toBe(20480 * MB)
  })

  it('expone el breakdown devuelto por computeWorkspaceStorageUsage tal cual', async () => {
    prisma.workspace.findUnique.mockResolvedValue({ storageLimitMb: 1000 })
    const breakdown = usage(50 * MB, { contenido: 20 * MB })
    computeWorkspaceStorageUsage.mockResolvedValue(breakdown)

    const budget = await getStorageBudget(1)

    expect(budget.breakdown).toEqual(breakdown)
  })
})
