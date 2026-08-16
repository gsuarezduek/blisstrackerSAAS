jest.mock('../../src/lib/prisma', () => ({
  instagramSnapshot:   { findMany: jest.fn() },
  facebookSnapshot:    { findMany: jest.fn() },
  linkedinSnapshot:    { findMany: jest.fn() },
  competitorSnapshot:  { findMany: jest.fn() },
  tikTokSnapshot:      { findMany: jest.fn() },
  youTubeSnapshot:     { findMany: jest.fn() },
  monthlyReport:       { findMany: jest.fn() },
  projectClientPortal: { findMany: jest.fn() },
  socialImage:         { findMany: jest.fn(), deleteMany: jest.fn() },
}))

const prisma = require('../../src/lib/prisma')
const { collectUsedImageIds, findOrphanImageIds, IMAGE_REF_SOURCES } = require('../../src/services/storageStats.service')

// Todas las fuentes de IMAGE_REF_SOURCES vacías salvo la que el test setea explícitamente.
function mockAllEmpty() {
  for (const { model } of IMAGE_REF_SOURCES) prisma[model].findMany.mockResolvedValue([])
}

describe('storageStats.service — collectUsedImageIds', () => {
  beforeEach(() => jest.clearAllMocks())

  it('incluye projectClientPortal.liveDataCache como fuente de referencias en uso', () => {
    expect(IMAGE_REF_SOURCES).toContainEqual({ model: 'projectClientPortal', field: 'liveDataCache' })
  })

  it('detecta un id referenciado únicamente en el liveDataCache del portal de cliente', async () => {
    mockAllEmpty()
    const id = 'de47ac71-cfa0-42e1-ae57-86a829109872'
    prisma.projectClientPortal.findMany.mockResolvedValue([
      { liveDataCache: JSON.stringify({ sections: { instagram: { topPosts: [{ imgSrc: `https://backend.test/api/social-image/${id}` }] } } }) },
    ])

    const used = await collectUsedImageIds()

    expect(used.has(id)).toBe(true)
  })

  it('detecta ids referenciados en snapshots + informes (fuentes ya existentes)', async () => {
    mockAllEmpty()
    const igId = '11111111-1111-1111-1111-111111111111'
    const reportId = '22222222-2222-2222-2222-222222222222'
    prisma.instagramSnapshot.findMany.mockResolvedValue([
      { topPosts: JSON.stringify([{ imgSrc: `https://backend.test/api/social-image/${igId}` }]) },
    ])
    prisma.monthlyReport.findMany.mockResolvedValue([
      { dataCache: JSON.stringify({ sections: { instagram: { topPosts: [{ imgSrc: `https://backend.test/api/social-image/${reportId}` }] } } }) },
    ])

    const used = await collectUsedImageIds()

    expect(used.has(igId)).toBe(true)
    expect(used.has(reportId)).toBe(true)
  })

  it('un id que no aparece en ninguna fuente queda huérfano', async () => {
    mockAllEmpty()
    prisma.socialImage.findMany.mockResolvedValue([{ id: 'orphan-id' }])

    const orphans = await findOrphanImageIds({ olderThanDays: 0 })

    expect(orphans).toEqual(['orphan-id'])
  })

  it('un id solo referenciado por el portal de cliente NO queda huérfano (regresión del bug de "Datos en vivo")', async () => {
    mockAllEmpty()
    const id = 'de47ac71-cfa0-42e1-ae57-86a829109872'
    prisma.projectClientPortal.findMany.mockResolvedValue([
      { liveDataCache: JSON.stringify({ sections: { instagram: { topPosts: [{ imgSrc: `https://backend.test/api/social-image/${id}` }] } } }) },
    ])
    prisma.socialImage.findMany.mockResolvedValue([{ id }])

    const orphans = await findOrphanImageIds({ olderThanDays: 0 })

    expect(orphans).toEqual([])
  })
})
