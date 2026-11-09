jest.mock('../../src/lib/prisma', () => ({
  projectFile: { create: jest.fn() },
  contentPieceFile: { create: jest.fn() },
}))
jest.mock('../../src/services/objectStorage.service', () => ({
  isConfigured: jest.fn(() => true),
  buildKey: jest.fn((prefix, mime) => `${prefix}/id.${mime === 'image/jpeg' ? 'jpg' : 'bin'}`),
  copyObject: jest.fn(),
}))
jest.mock('../../src/lib/projectFileTree', () => ({
  findOrCreateFolder: jest.fn(async () => 1),
}))
jest.mock('../../src/controllers/projects/projectFiles.controller', () => ({
  sanitizeName: (name) => name,
  assertWithinQuota: jest.fn(),
}))

const prisma = require('../../src/lib/prisma')
const objectStorage = require('../../src/services/objectStorage.service')
const { assertWithinQuota } = require('../../src/controllers/projects/projectFiles.controller')
const { mirrorAssetToArchivos } = require('../../src/services/contentFileMirror.service')

const asset = {
  objectKey: 'content/1/a.mp4', posterKey: 'content/1/poster.jpg',
  mimeType: 'video/mp4', fileName: 'pieza.mp4', sizeBytes: 5000,
  width: 100, height: 100,
}

beforeEach(() => {
  jest.clearAllMocks()
  objectStorage.isConfigured.mockReturnValue(true)
  assertWithinQuota.mockResolvedValue(null)
  prisma.projectFile.create.mockResolvedValue({ id: 9 })
  prisma.contentPieceFile.create.mockResolvedValue({})
})

describe('mirrorAssetToArchivos', () => {
  it('no copia a R2 si la cuota de Archivos no alcanza', async () => {
    assertWithinQuota.mockResolvedValue('Se alcanzó el límite de almacenamiento del workspace (10 MB).')

    await mirrorAssetToArchivos({
      workspaceId: 1, projectId: 2, timezone: 'America/Argentina/Buenos_Aires',
      pieceId: 3, pieceTitle: 'Pieza', asset, uploaderId: 4,
    })

    expect(objectStorage.copyObject).not.toHaveBeenCalled()
    expect(prisma.projectFile.create).not.toHaveBeenCalled()
  })

  it('copia el archivo y deja la miniatura bajo thumbs/', async () => {
    await mirrorAssetToArchivos({
      workspaceId: 1, projectId: 2, timezone: 'America/Argentina/Buenos_Aires',
      pieceId: 3, pieceTitle: 'Pieza', asset, uploaderId: 4,
    })

    expect(objectStorage.copyObject).toHaveBeenCalledWith('content/1/poster.jpg', 'files/1/thumbs/id.jpg')
    expect(prisma.projectFile.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ sizeBytes: 5000, posterKey: 'files/1/thumbs/id.jpg' }),
    }))
  })
})
