const prisma = require('../lib/prisma')

const VALID_TYPES    = ['weekly', 'quarterly']
const VALID_STATUSES = ['open', 'solved']
const VALID_PRIORITY = ['high', 'medium', 'low']

// ─── GET /api/eos/issues ─────────────────────────────────────────────────────

async function getIssues(req, res, next) {
  try {
    const workspaceId = req.workspace.id

    const [members, issues] = await Promise.all([
      prisma.workspaceMember.findMany({
        where:   { workspaceId, active: true },
        include: { user: { select: { id: true, name: true, avatar: true } } },
        orderBy: { user: { name: 'asc' } },
      }),
      prisma.eOSIssue.findMany({
        where:   { workspaceId },
        orderBy: [{ status: 'asc' }, { order: 'asc' }, { createdAt: 'desc' }],
      }),
    ])

    res.json({
      members: members.map(m => ({ id: m.user.id, name: m.user.name, avatar: m.user.avatar })),
      issues:  issues.map(formatIssue),
    })
  } catch (err) { next(err) }
}

// ─── POST /api/eos/issues ────────────────────────────────────────────────────
// body: { title, type?, priority?, ownerId? }

async function createIssue(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const userId      = req.user.userId
    const { title, type = 'weekly', priority = 'medium', ownerId } = req.body

    if (!title?.trim()) return res.status(400).json({ error: 'title es requerido' })
    if (!VALID_TYPES.includes(type))     return res.status(400).json({ error: 'type inválido' })
    if (!VALID_PRIORITY.includes(priority)) return res.status(400).json({ error: 'priority inválida' })

    const count = await prisma.eOSIssue.count({ where: { workspaceId, type } })

    const issue = await prisma.eOSIssue.create({
      data: {
        workspaceId,
        title:       title.trim().slice(0, 300),
        type,
        priority,
        ownerId:     ownerId ? Number(ownerId) : null,
        createdById: userId,
        order:       count,
      },
    })

    res.status(201).json(formatIssue(issue))
  } catch (err) { next(err) }
}

// ─── PATCH /api/eos/issues/:id ───────────────────────────────────────────────
// body: { title?, description?, type?, priority?, ownerId?, status?, notes?, order? }

async function updateIssue(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const id = Number(req.params.id)
    const { title, description, type, priority, ownerId, status, notes, order } = req.body

    const existing = await prisma.eOSIssue.findFirst({ where: { id, workspaceId } })
    if (!existing) return res.status(404).json({ error: 'Issue no encontrado' })

    if (type     !== undefined && !VALID_TYPES.includes(type))     return res.status(400).json({ error: 'type inválido' })
    if (status   !== undefined && !VALID_STATUSES.includes(status)) return res.status(400).json({ error: 'status inválido' })
    if (priority !== undefined && !VALID_PRIORITY.includes(priority)) return res.status(400).json({ error: 'priority inválida' })

    const data = {}
    if (title       !== undefined) data.title       = title.trim().slice(0, 300)
    if (description !== undefined) data.description = description?.trim() || null
    if (type        !== undefined) data.type        = type
    if (priority    !== undefined) data.priority    = priority
    if (ownerId     !== undefined) data.ownerId     = ownerId ? Number(ownerId) : null
    if (notes       !== undefined) data.notes       = notes?.trim() || null
    if (order       !== undefined) data.order       = Number(order)

    if (status !== undefined) {
      data.status   = status
      data.solvedAt = status === 'solved' ? new Date() : null
    }

    const issue = await prisma.eOSIssue.update({ where: { id }, data })
    res.json(formatIssue(issue))
  } catch (err) { next(err) }
}

// ─── DELETE /api/eos/issues/:id ──────────────────────────────────────────────

async function deleteIssue(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const id = Number(req.params.id)

    const existing = await prisma.eOSIssue.findFirst({ where: { id, workspaceId } })
    if (!existing) return res.status(404).json({ error: 'Issue no encontrado' })

    await prisma.eOSIssue.delete({ where: { id } })
    res.json({ deleted: true })
  } catch (err) { next(err) }
}

// ─── Utility ─────────────────────────────────────────────────────────────────

function formatIssue(i) {
  return {
    id:          i.id,
    title:       i.title,
    description: i.description,
    ownerId:     i.ownerId,
    createdById: i.createdById,
    type:        i.type,
    status:      i.status,
    priority:    i.priority,
    notes:       i.notes,
    solvedAt:    i.solvedAt,
    order:       i.order,
    createdAt:   i.createdAt,
  }
}

module.exports = { getIssues, createIssue, updateIssue, deleteIssue }
