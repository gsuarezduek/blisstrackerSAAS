// computeGlobalR2Totals hace un require('./storageStats.service') LAZY, dentro
// de la función (para evitar un ciclo de imports) — jest.mock igual intercepta
// ese require en cualquier momento, no hace falta jest.resetModules/doMock.
jest.mock('../../src/services/storageStats.service', () => ({
  getSocialImageStats: jest.fn(),
}))

jest.mock('../../src/lib/prisma', () => ({
  projectFile:         { groupBy: jest.fn(), aggregate: jest.fn() },
  contentAsset:        { groupBy: jest.fn(), aggregate: jest.fn() },
  whatsappMedia:       { groupBy: jest.fn(), aggregate: jest.fn() },
  whatsappBotDocument: { groupBy: jest.fn(), aggregate: jest.fn() },
  chatAttachment:      { groupBy: jest.fn(), aggregate: jest.fn() },
  project:             { findMany: jest.fn() },
  $queryRaw:           jest.fn(),
}))

const prisma = require('../../src/lib/prisma')
const { getSocialImageStats } = require('../../src/services/storageStats.service')
const {
  computeAllWorkspacesStorageUsage,
  computeWorkspaceStorageUsage,
  computeProjectStorageBreakdown,
  computeGlobalR2Totals,
} = require('../../src/services/workspaceStorage.service')

// $queryRaw se llama como tagged template — el primer argumento es el array de
// strings del SQL. Se despacha por contenido (única forma de distinguir las 2
// queries crudas del service: SocialImage vs el join de ContentAsset/ContentPiece).
// `contentByProject` son filas { projectId, active_bytes?, trash_bytes? } (el
// query real de computeProjectStorageBreakdown trae ambas columnas con CASE
// WHEN); computeAllWorkspacesStorageUsage/computeWorkspaceStorageUsage en
// cambio esperan `bytes` (columna única) — cada test arma el shape que su
// query necesita.
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

  it('mergea las 6 fuentes por workspaceId y calcula el total', async () => {
    prisma.projectFile.groupBy.mockResolvedValue([{ workspaceId: 1, _sum: { sizeBytes: 1000 } }])
    prisma.contentAsset.groupBy.mockResolvedValue([{ workspaceId: 1, _sum: { sizeBytes: 500 } }])
    prisma.whatsappMedia.groupBy.mockResolvedValue([{ workspaceId: 1, _sum: { sizeBytes: 200 } }])
    prisma.whatsappBotDocument.groupBy.mockResolvedValue([{ workspaceId: 1, _sum: { sizeBytes: 100 } }])
    prisma.chatAttachment.groupBy.mockResolvedValue([{ workspaceId: 1, _sum: { sizeBytes: 50 } }])
    mockQueryRaw({ socialImage: [{ workspaceId: 1, bytes: 300 }] })

    const result = await computeAllWorkspacesStorageUsage()

    expect(result).toEqual([
      { workspaceId: 1, archivos: 1000, contenido: 500, imagenesSociales: 300, whatsapp: 300, chat: 50, total: 2150 },
    ])
  })

  it('un workspace con datos en un solo modelo aparece igual, con el resto en 0', async () => {
    prisma.projectFile.groupBy.mockResolvedValue([{ workspaceId: 7, _sum: { sizeBytes: 42 } }])
    prisma.contentAsset.groupBy.mockResolvedValue([])
    prisma.whatsappMedia.groupBy.mockResolvedValue([])
    prisma.whatsappBotDocument.groupBy.mockResolvedValue([])
    prisma.chatAttachment.groupBy.mockResolvedValue([])
    mockQueryRaw()

    const result = await computeAllWorkspacesStorageUsage()

    expect(result).toEqual([{ workspaceId: 7, archivos: 42, contenido: 0, imagenesSociales: 0, whatsapp: 0, chat: 0, total: 42 }])
  })

  it('sin datos en ningún workspace devuelve array vacío', async () => {
    prisma.projectFile.groupBy.mockResolvedValue([])
    prisma.contentAsset.groupBy.mockResolvedValue([])
    prisma.whatsappMedia.groupBy.mockResolvedValue([])
    prisma.whatsappBotDocument.groupBy.mockResolvedValue([])
    prisma.chatAttachment.groupBy.mockResolvedValue([])
    mockQueryRaw()

    const result = await computeAllWorkspacesStorageUsage()

    expect(result).toEqual([])
  })

  it('suma whatsappMedia + whatsappBotDocument en la misma categoría "whatsapp"', async () => {
    prisma.projectFile.groupBy.mockResolvedValue([])
    prisma.contentAsset.groupBy.mockResolvedValue([])
    prisma.whatsappMedia.groupBy.mockResolvedValue([{ workspaceId: 3, _sum: { sizeBytes: 10 } }])
    prisma.whatsappBotDocument.groupBy.mockResolvedValue([{ workspaceId: 3, _sum: { sizeBytes: 20 } }])
    prisma.chatAttachment.groupBy.mockResolvedValue([])
    mockQueryRaw()

    const result = await computeAllWorkspacesStorageUsage()

    expect(result).toEqual([{ workspaceId: 3, archivos: 0, contenido: 0, imagenesSociales: 0, whatsapp: 30, chat: 0, total: 30 }])
  })
})

describe('workspaceStorage.service — computeWorkspaceStorageUsage', () => {
  beforeEach(() => jest.clearAllMocks())

  it('agrega un solo workspace (aggregate en vez de groupBy)', async () => {
    prisma.projectFile.aggregate.mockResolvedValue({ _sum: { sizeBytes: 100 } })
    prisma.contentAsset.aggregate.mockResolvedValue({ _sum: { sizeBytes: 50 } })
    prisma.whatsappMedia.aggregate.mockResolvedValue({ _sum: { sizeBytes: 10 } })
    prisma.whatsappBotDocument.aggregate.mockResolvedValue({ _sum: { sizeBytes: 5 } })
    prisma.chatAttachment.aggregate.mockResolvedValue({ _sum: { sizeBytes: 15 } })
    prisma.$queryRaw.mockResolvedValue([{ bytes: 25 }])

    const result = await computeWorkspaceStorageUsage(1)

    expect(result).toEqual({ archivos: 100, contenido: 50, imagenesSociales: 25, whatsapp: 15, chat: 15, total: 205 })
  })

  it('sin ningún dato devuelve todo en 0 (sizeBytes null tratado como 0)', async () => {
    prisma.projectFile.aggregate.mockResolvedValue({ _sum: { sizeBytes: null } })
    prisma.contentAsset.aggregate.mockResolvedValue({ _sum: { sizeBytes: null } })
    prisma.whatsappMedia.aggregate.mockResolvedValue({ _sum: { sizeBytes: null } })
    prisma.whatsappBotDocument.aggregate.mockResolvedValue({ _sum: { sizeBytes: null } })
    prisma.chatAttachment.aggregate.mockResolvedValue({ _sum: { sizeBytes: null } })
    prisma.$queryRaw.mockResolvedValue([{ bytes: 0 }])

    const result = await computeWorkspaceStorageUsage(1)

    expect(result).toEqual({ archivos: 0, contenido: 0, imagenesSociales: 0, whatsapp: 0, chat: 0, total: 0 })
  })
})

describe('workspaceStorage.service — computeProjectStorageBreakdown', () => {
  beforeEach(() => jest.clearAllMocks())

  // El service llama prisma.projectFile.groupBy() DOS veces (activos, después
  // papelera) — mockResolvedValueOnce en ese mismo orden.
  function mockProjectFileGroupBy(activeRows, trashRows = []) {
    prisma.projectFile.groupBy
      .mockResolvedValueOnce(activeRows)
      .mockResolvedValueOnce(trashRows)
  }

  it('ordena el ranking de proyectos desc por totalBytes, separando activo de papelera', async () => {
    mockProjectFileGroupBy(
      [{ projectId: 1, _sum: { sizeBytes: 100 } }, { projectId: 2, _sum: { sizeBytes: 500 } }], // activos
      [{ projectId: 1, _sum: { sizeBytes: 20 } }], // papelera
    )
    mockQueryRaw({ contentByProject: [{ projectId: 1, active_bytes: 50, trash_bytes: 0 }] })
    prisma.project.findMany.mockResolvedValue([
      { id: 1, name: 'Proyecto Chico' },
      { id: 2, name: 'Proyecto Grande' },
    ])

    const result = await computeProjectStorageBreakdown(1)

    expect(result).toEqual([
      { projectId: 2, projectName: 'Proyecto Grande', activeBytes: 500, trashBytes: 0, totalBytes: 500 },
      { projectId: 1, projectName: 'Proyecto Chico', activeBytes: 150, trashBytes: 20, totalBytes: 170 },
    ])
  })

  it('un proyecto que solo tiene ContentAsset (sin ProjectFile) aparece igual', async () => {
    mockProjectFileGroupBy([], [])
    mockQueryRaw({ contentByProject: [{ projectId: 9, active_bytes: 77, trash_bytes: 0 }] })
    prisma.project.findMany.mockResolvedValue([{ id: 9, name: 'Solo Contenido' }])

    const result = await computeProjectStorageBreakdown(1)

    expect(result).toEqual([
      { projectId: 9, projectName: 'Solo Contenido', activeBytes: 77, trashBytes: 0, totalBytes: 77 },
    ])
  })

  it('un archivo en la papelera del proyecto suma a trashBytes, no a activeBytes', async () => {
    mockProjectFileGroupBy([], [{ projectId: 5, _sum: { sizeBytes: 999 } }])
    mockQueryRaw()
    prisma.project.findMany.mockResolvedValue([{ id: 5, name: 'Con basura' }])

    const result = await computeProjectStorageBreakdown(1)

    expect(result).toEqual([
      { projectId: 5, projectName: 'Con basura', activeBytes: 0, trashBytes: 999, totalBytes: 999 },
    ])
  })

  it('sin uso en ningún proyecto devuelve array vacío', async () => {
    mockProjectFileGroupBy([], [])
    mockQueryRaw()
    prisma.project.findMany.mockResolvedValue([{ id: 1, name: 'Proyecto Sin Uso' }])

    const result = await computeProjectStorageBreakdown(1)

    expect(result).toEqual([])
  })
})

describe('workspaceStorage.service — computeGlobalR2Totals', () => {
  beforeEach(() => jest.clearAllMocks())

  it('usa solo la porción en R2 de Imágenes de RRSS (no la legacy en DB)', async () => {
    prisma.projectFile.groupBy.mockResolvedValue([{ workspaceId: 1, _sum: { sizeBytes: 100 } }])
    prisma.contentAsset.groupBy.mockResolvedValue([{ workspaceId: 1, _sum: { sizeBytes: 50 } }])
    prisma.whatsappMedia.groupBy.mockResolvedValue([])
    prisma.whatsappBotDocument.groupBy.mockResolvedValue([])
    prisma.chatAttachment.groupBy.mockResolvedValue([])
    // La query cruda de SocialImage (mezcla R2+legacy) igual se dispara dentro
    // de computeAllWorkspacesStorageUsage, pero computeGlobalR2Totals descarta
    // ese valor y usa getSocialImageStats().location.r2 en su lugar.
    mockQueryRaw({ socialImage: [{ workspaceId: 1, bytes: 12345 }] })
    getSocialImageStats.mockResolvedValue({
      location: { r2: { bytes: 300, count: 3 }, db: { bytes: 999, count: 9 } },
    })

    const result = await computeGlobalR2Totals()

    expect(result.breakdown.imagenesSociales).toBe(300) // solo r2.bytes, no db.bytes ni la mezcla de arriba
    expect(result.breakdown.archivos).toBe(100)
    expect(result.breakdown.contenido).toBe(50)
    expect(result.totalBytes).toBe(100 + 50 + 300)
  })

  it('suma varios workspaces por categoría', async () => {
    prisma.projectFile.groupBy.mockResolvedValue([
      { workspaceId: 1, _sum: { sizeBytes: 100 } },
      { workspaceId: 2, _sum: { sizeBytes: 200 } },
    ])
    prisma.contentAsset.groupBy.mockResolvedValue([])
    prisma.whatsappMedia.groupBy.mockResolvedValue([])
    prisma.whatsappBotDocument.groupBy.mockResolvedValue([])
    prisma.chatAttachment.groupBy.mockResolvedValue([])
    mockQueryRaw()
    getSocialImageStats.mockResolvedValue({ location: { r2: { bytes: 0, count: 0 }, db: { bytes: 0, count: 0 } } })

    const result = await computeGlobalR2Totals()

    expect(result.breakdown.archivos).toBe(300)
    expect(result.totalBytes).toBe(300)
  })
})
