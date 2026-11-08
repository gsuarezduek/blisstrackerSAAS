jest.mock('../../src/lib/prisma', () => ({
  contentPiece: { findMany: jest.fn() },
}))

const prisma = require('../../src/lib/prisma')
const { listOwnContentPieces } = require('../../src/lib/contentAgenda')

describe('contentAgenda', () => {
  beforeEach(() => prisma.contentPiece.findMany.mockReset())

  it('devuelve la pieza del responsable en su día de publicación', async () => {
    prisma.contentPiece.findMany.mockResolvedValue([
      { id: 4, title: 'Reel del jueves', scheduledDate: '2026-11-08', project: { id: 9, name: 'Acme' } },
    ])

    const rows = await listOwnContentPieces({
      workspaceId: 1, userId: 7, from: '2026-11-08', to: '2026-11-08', enabled: true,
    })

    expect(rows).toEqual([
      { id: 4, title: 'Reel del jueves', date: '2026-11-08', projectId: 9, projectName: 'Acme' },
    ])
    const where = prisma.contentPiece.findMany.mock.calls[0][0].where
    expect(where.ownerId).toBe(7)
    expect(where.deletedAt).toBeNull()
    expect(where.status).toEqual({ notIn: ['publicado', 'archivado'] })
    expect(where.project).toEqual({ contenidoEnabled: true })
    expect(where.tasks).toEqual({ none: { userId: 7, status: { not: 'COMPLETED' }, isAgentTask: false } })
  })

  it('sin el módulo no consulta', async () => {
    const rows = await listOwnContentPieces({
      workspaceId: 1, userId: 7, from: '2026-11-08', to: '2026-11-08', enabled: false,
    })
    expect(rows).toEqual([])
    expect(prisma.contentPiece.findMany).not.toHaveBeenCalled()
  })
})
