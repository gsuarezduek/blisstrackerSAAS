const prisma    = require('../lib/prisma')
const { generateMemoryForUser } = require('../services/insightMemory.service')

async function listProductivity(req, res, next) {
  try {
    const workspaceId = req.workspace.id

    const members = await prisma.workspaceMember.findMany({
      where: { workspaceId, active: true },
      include: {
        user: {
          select: {
            id: true, name: true, avatar: true,
            insightMemories: {
              where: { workspaceId },
              select: {
                tendencias: true, fortalezas: true, areasDeAtencion: true,
                estadisticas: true, weekStart: true, updatedAt: true,
              },
              orderBy: { weekStart: 'desc' },
              take: 1,
            },
          },
        },
      },
      orderBy: { user: { name: 'asc' } },
    })

    const result = members.map(m => ({
      ...m.user,
      role: m.teamRole,
      insightMemory: m.user.insightMemories[0] ?? null,
      insightMemories: undefined,
    }))

    res.json(result)
  } catch (err) { next(err) }
}

async function refreshProductivity(req, res, next) {
  try {
    const userId = Number(req.params.userId)
    const workspace = req.workspace

    const member = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: workspace.id, userId } },
    })
    if (!member || !member.active) return res.status(404).json({ error: 'Usuario no encontrado' })

    await generateMemoryForUser(userId, workspace)
    const memory = await prisma.userInsightMemory.findFirst({
      where: { userId, workspaceId: workspace.id },
      orderBy: { weekStart: 'desc' },
      select: {
        tendencias: true, fortalezas: true, areasDeAtencion: true,
        estadisticas: true, weekStart: true, updatedAt: true,
      },
    })
    res.json(memory)
  } catch (err) { next(err) }
}

module.exports = { listProductivity, refreshProductivity }
