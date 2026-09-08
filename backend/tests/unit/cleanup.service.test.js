jest.mock('../../src/lib/prisma', () => ({
  contentPiece: { count: jest.fn(), findMany: jest.fn(), deleteMany: jest.fn() },
}))

jest.mock('../../src/lib/platformSettings', () => ({
  getSettings: jest.fn().mockResolvedValue({}),
  getSetting:  jest.fn(),
}))

jest.mock('../../src/services/storageStats.service', () => ({
  findOrphanImageIds:  jest.fn(),
  cleanupOrphanImages: jest.fn(),
}))

jest.mock('../../src/services/objectStorage.service', () => ({
  deleteObjects: jest.fn().mockResolvedValue({ deleted: 0 }),
}))

const prisma = require('../../src/lib/prisma')
const { getSetting } = require('../../src/lib/platformSettings')
const objectStorage = require('../../src/services/objectStorage.service')
const { previewWeeklyCleanup, runWeeklyCleanup } = require('../../src/services/cleanup.service')

describe('cleanup.service — contentPiecesTrash', () => {
  beforeEach(() => jest.clearAllMocks())

  describe('previewWeeklyCleanup', () => {
    it('cuenta las piezas en la papelera más viejas que el retention configurado', async () => {
      getSetting.mockResolvedValue(30)
      prisma.contentPiece.count.mockResolvedValue(3)

      const result = await previewWeeklyCleanup(['contentPiecesTrash'])

      expect(result.contentPiecesTrash).toBe(3)
      expect(getSetting).toHaveBeenCalledWith('contentPieceTrashRetentionDays')
      const { where } = prisma.contentPiece.count.mock.calls[0][0]
      expect(where.deletedAt.lt).toBeInstanceOf(Date)
    })
  })

  describe('runWeeklyCleanup', () => {
    it('borra primero los assets de R2 y después las piezas (cascade en DB)', async () => {
      getSetting.mockResolvedValue(30)
      prisma.contentPiece.findMany.mockResolvedValue([
        { id: 1, assets: [{ objectKey: 'content/1/a.png', posterKey: null }] },
        { id: 2, assets: [{ objectKey: 'content/1/b.mp4', posterKey: 'content/1/b-poster.jpg' }] },
      ])
      prisma.contentPiece.deleteMany.mockResolvedValue({ count: 2 })

      const result = await runWeeklyCleanup(['contentPiecesTrash'])

      expect(objectStorage.deleteObjects).toHaveBeenCalledWith([
        'content/1/a.png', 'content/1/b.mp4', 'content/1/b-poster.jpg',
      ])
      expect(prisma.contentPiece.deleteMany).toHaveBeenCalledWith({ where: { id: { in: [1, 2] } } })
      expect(result.contentPiecesTrash).toBe(2)
    })

    it('sin piezas vencidas, no borra nada de R2 ni de la DB', async () => {
      getSetting.mockResolvedValue(30)
      prisma.contentPiece.findMany.mockResolvedValue([])
      prisma.contentPiece.deleteMany.mockResolvedValue({ count: 0 })

      const result = await runWeeklyCleanup(['contentPiecesTrash'])

      expect(objectStorage.deleteObjects).toHaveBeenCalledWith([])
      expect(result.contentPiecesTrash).toBe(0)
    })
  })
})
