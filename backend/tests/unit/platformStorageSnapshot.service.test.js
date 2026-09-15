jest.mock('../../src/lib/prisma', () => ({
  platformStorageSnapshot: { upsert: jest.fn(), findMany: jest.fn() },
}))
jest.mock('../../src/lib/platformSettings', () => ({
  getSetting: jest.fn(),
}))
jest.mock('../../src/services/workspaceStorage.service', () => ({
  computeGlobalR2Totals: jest.fn(),
}))
jest.mock('../../src/services/email/_shared', () => ({
  sendPlatformNotification: jest.fn(),
  platformCard: jest.fn(() => '<div>card</div>'),
}))

const prisma = require('../../src/lib/prisma')
const { getSetting } = require('../../src/lib/platformSettings')
const { computeGlobalR2Totals } = require('../../src/services/workspaceStorage.service')
const { sendPlatformNotification } = require('../../src/services/email/_shared')
const {
  upsertCurrentMonthSnapshot,
  freezeLastMonthSnapshot,
  getStorageHistory,
  currentMonthStr,
} = require('../../src/services/platformStorageSnapshot.service')

const GB = 1024 ** 3
const totals = (totalBytes, breakdown = {}) => ({
  totalBytes,
  breakdown: { archivos: 0, contenido: 0, imagenesSociales: 0, whatsapp: 0, chat: 0, ...breakdown },
})

describe('platformStorageSnapshot.service — upsertCurrentMonthSnapshot', () => {
  beforeEach(() => jest.clearAllMocks())

  it('hace upsert del mes en curso con el total actual', async () => {
    computeGlobalR2Totals.mockResolvedValue(totals(500))

    await upsertCurrentMonthSnapshot()

    expect(prisma.platformStorageSnapshot.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { month: currentMonthStr() },
        create: expect.objectContaining({ month: currentMonthStr(), totalBytes: 500 }),
        update: expect.objectContaining({ totalBytes: 500 }),
      })
    )
  })

  it('nunca lanza si computeGlobalR2Totals falla (best-effort)', async () => {
    computeGlobalR2Totals.mockRejectedValue(new Error('boom'))
    await expect(upsertCurrentMonthSnapshot()).resolves.toBeUndefined()
  })
})

describe('platformStorageSnapshot.service — freezeLastMonthSnapshot', () => {
  beforeEach(() => jest.clearAllMocks())

  it('congela el mes anterior (no el actual)', async () => {
    computeGlobalR2Totals.mockResolvedValue(totals(10 * GB))
    getSetting.mockResolvedValue(100) // umbral 100 GB, no se cruza

    await freezeLastMonthSnapshot()

    const call = prisma.platformStorageSnapshot.upsert.mock.calls[0][0]
    expect(call.where.month).not.toBe(currentMonthStr())
  })

  it('no envía el aviso si el total está debajo del umbral', async () => {
    computeGlobalR2Totals.mockResolvedValue(totals(10 * GB))
    getSetting.mockResolvedValue(100)

    await freezeLastMonthSnapshot()

    expect(sendPlatformNotification).not.toHaveBeenCalled()
  })

  it('envía el aviso "storageThreshold" cuando el total llega o supera el umbral', async () => {
    computeGlobalR2Totals.mockResolvedValue(totals(150 * GB))
    getSetting.mockResolvedValue(100)

    await freezeLastMonthSnapshot()

    expect(sendPlatformNotification).toHaveBeenCalledWith(
      'storageThreshold',
      expect.objectContaining({ subject: expect.stringContaining('150.0 GB') })
    )
  })

  it('el umbral se evalúa como >= (justo en el límite también avisa)', async () => {
    computeGlobalR2Totals.mockResolvedValue(totals(100 * GB))
    getSetting.mockResolvedValue(100)

    await freezeLastMonthSnapshot()

    expect(sendPlatformNotification).toHaveBeenCalled()
  })
})

describe('platformStorageSnapshot.service — getStorageHistory', () => {
  beforeEach(() => jest.clearAllMocks())

  it('devuelve los snapshots en orden ascendente (para graficar)', async () => {
    prisma.platformStorageSnapshot.findMany.mockResolvedValue([
      { month: '2026-03', totalBytes: 300 },
      { month: '2026-02', totalBytes: 200 },
      { month: '2026-01', totalBytes: 100 },
    ])

    const result = await getStorageHistory(12)

    expect(result.map(r => r.month)).toEqual(['2026-01', '2026-02', '2026-03'])
    expect(prisma.platformStorageSnapshot.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { month: 'desc' }, take: 12 })
    )
  })
})
