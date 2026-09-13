jest.mock('../../src/lib/prisma', () => ({
  projectFile:         { groupBy: jest.fn(), aggregate: jest.fn() },
  contentAsset:        { groupBy: jest.fn(), aggregate: jest.fn() },
  whatsappMedia:       { groupBy: jest.fn(), aggregate: jest.fn() },
  whatsappBotDocument: { groupBy: jest.fn(), aggregate: jest.fn() },
  project:             { findMany: jest.fn() },
  $queryRaw:           jest.fn(),
}))

const prisma = require('../../src/lib/prisma')
const {
  computeAllWorkspacesStorageUsage,
  computeWorkspaceStorageUsage,
  computeProjectStorageBreakdown,
} = require('../../src/services/workspaceStorage.service')

// $queryRaw se llama como tagged template — el primer argumento es el array de
// strings del SQL. Se despacha por contenido (única forma de distinguir las 2
// queries crudas del service: SocialImage vs el join de ContentAsset/ContentPiece).
function mockQueryRaw({ socialImage = [], contentByProject = [] } = {}) {
  prisma.$queryRaw.mockImplementation(strings => {
    const sql = strings.join('')
    if (sql.includes('"SocialImage"')) return Promise.resolve(socialImage)
    if (sql.includes('"ContentAsset"')) return Promise.resolve(contentByProject)
    return Promise.resolve([])
  })
}

describe('workspaceStorage.service — computeAllWorkspacesStorageUsage', () => {
  beforeEach(() => jest.clearAllMocks())

  it('mergea las 5 fuentes por workspaceId y calcula el total', async () => {
    prisma.projectFile.groupBy.mockResolvedValue([{ workspaceId: 1, _sum: { sizeBytes: 1000 } }])
    prisma.contentAsset.groupBy.mockResolvedValue([{ workspaceId: 1, _sum: { sizeBytes: 500 } }])
    prisma.whatsappMedia.groupBy.mockResolvedValue([{ workspaceId: 1, _sum: { sizeBytes: 200 } }])
    prisma.whatsappBotDocument.groupBy.mockResolvedValue([{ workspaceId: 1, _sum: { sizeBytes: 100 } }])
    mockQueryRaw({ socialImage: [{ workspaceId: 1, bytes: 300 }] })

    const result = await computeAllWorkspacesStorageUsage()

    expect(result).toEqual([
      { workspaceId: 1, archivos: 1000, contenido: 500, imagenesSociales: 300, whatsapp: 300, total: 2100 },
    ])
  })

  it('un workspace con datos en un solo modelo aparece igual, con el resto en 0', async () => {
    prisma.projectFile.groupBy.mockResolvedValue([{ workspaceId: 7, _sum: { sizeBytes: 42 } }])
    prisma.contentAsset.groupBy.mockResolvedValue([])
    prisma.whatsappMedia.groupBy.mockResolvedValue([])
    prisma.whatsappBotDocument.groupBy.mockResolvedValue([])
    mockQueryRaw()

    const result = await computeAllWorkspacesStorageUsage()

    expect(result).toEqual([{ workspaceId: 7, archivos: 42, contenido: 0, imagenesSociales: 0, whatsapp: 0, total: 42 }])
  })

  it('sin datos en ningún workspace devuelve array vacío', async () => {
    prisma.projectFile.groupBy.mockResolvedValue([])
    prisma.contentAsset.groupBy.mockResolvedValue([])
    prisma.whatsappMedia.groupBy.mockResolvedValue([])
    prisma.whatsappBotDocument.groupBy.mockResolvedValue([])
    mockQueryRaw()

    const result = await computeAllWorkspacesStorageUsage()

    expect(result).toEqual([])
  })

  it('suma whatsappMedia + whatsappBotDocument en la misma categoría "whatsapp"', async () => {
    prisma.projectFile.groupBy.mockResolvedValue([])
    prisma.contentAsset.groupBy.mockResolvedValue([])
    prisma.whatsappMedia.groupBy.mockResolvedValue([{ workspaceId: 3, _sum: { sizeBytes: 10 } }])
    prisma.whatsappBotDocument.groupBy.mockResolvedValue([{ workspaceId: 3, _sum: { sizeBytes: 20 } }])
    mockQueryRaw()

    const result = await computeAllWorkspacesStorageUsage()

    expect(result).toEqual([{ workspaceId: 3, archivos: 0, contenido: 0, imagenesSociales: 0, whatsapp: 30, total: 30 }])
  })
})

describe('workspaceStorage.service — computeWorkspaceStorageUsage', () => {
  beforeEach(() => jest.clearAllMocks())

  it('agrega un solo workspace (aggregate en vez de groupBy)', async () => {
    prisma.projectFile.aggregate.mockResolvedValue({ _sum: { sizeBytes: 100 } })
    prisma.contentAsset.aggregate.mockResolvedValue({ _sum: { sizeBytes: 50 } })
    prisma.whatsappMedia.aggregate.mockResolvedValue({ _sum: { sizeBytes: 10 } })
    prisma.whatsappBotDocument.aggregate.mockResolvedValue({ _sum: { sizeBytes: 5 } })
    prisma.$queryRaw.mockResolvedValue([{ bytes: 25 }])

    const result = await computeWorkspaceStorageUsage(1)

    expect(result).toEqual({ archivos: 100, contenido: 50, imagenesSociales: 25, whatsapp: 15, total: 190 })
  })

  it('sin ningún dato devuelve todo en 0 (sizeBytes null tratado como 0)', async () => {
    prisma.projectFile.aggregate.mockResolvedValue({ _sum: { sizeBytes: null } })
    prisma.contentAsset.aggregate.mockResolvedValue({ _sum: { sizeBytes: null } })
    prisma.whatsappMedia.aggregate.mockResolvedValue({ _sum: { sizeBytes: null } })
    prisma.whatsappBotDocument.aggregate.mockResolvedValue({ _sum: { sizeBytes: null } })
    prisma.$queryRaw.mockResolvedValue([{ bytes: 0 }])

    const result = await computeWorkspaceStorageUsage(1)

    expect(result).toEqual({ archivos: 0, contenido: 0, imagenesSociales: 0, whatsapp: 0, total: 0 })
  })
})

describe('workspaceStorage.service — computeProjectStorageBreakdown', () => {
  beforeEach(() => jest.clearAllMocks())

  it('ordena el ranking de proyectos desc por totalBytes', async () => {
    prisma.projectFile.groupBy.mockResolvedValue([
      { projectId: 1, _sum: { sizeBytes: 100 } },
      { projectId: 2, _sum: { sizeBytes: 500 } },
    ])
    mockQueryRaw({ contentByProject: [{ projectId: 1, bytes: 50 }] })
    prisma.project.findMany.mockResolvedValue([
      { id: 1, name: 'Proyecto Chico' },
      { id: 2, name: 'Proyecto Grande' },
    ])

    const result = await computeProjectStorageBreakdown(1)

    expect(result).toEqual([
      { projectId: 2, projectName: 'Proyecto Grande', archivosBytes: 500, contenidoBytes: 0, totalBytes: 500 },
      { projectId: 1, projectName: 'Proyecto Chico', archivosBytes: 100, contenidoBytes: 50, totalBytes: 150 },
    ])
  })

  it('un proyecto que solo tiene ContentAsset (sin ProjectFile) aparece igual', async () => {
    prisma.projectFile.groupBy.mockResolvedValue([])
    mockQueryRaw({ contentByProject: [{ projectId: 9, bytes: 77 }] })
    prisma.project.findMany.mockResolvedValue([{ id: 9, name: 'Solo Contenido' }])

    const result = await computeProjectStorageBreakdown(1)

    expect(result).toEqual([
      { projectId: 9, projectName: 'Solo Contenido', archivosBytes: 0, contenidoBytes: 77, totalBytes: 77 },
    ])
  })

  it('sin uso en ningún proyecto devuelve array vacío', async () => {
    prisma.projectFile.groupBy.mockResolvedValue([])
    mockQueryRaw()
    prisma.project.findMany.mockResolvedValue([{ id: 1, name: 'Proyecto Sin Uso' }])

    const result = await computeProjectStorageBreakdown(1)

    expect(result).toEqual([])
  })
})
