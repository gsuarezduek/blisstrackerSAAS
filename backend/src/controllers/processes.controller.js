const prisma = require('../lib/prisma')

// GET /api/processes — lectura para cualquier miembro del workspace.
// Sólo devuelve procesos con status 'documented' o 'followed'.
async function listProcesses(req, res, next) {
  try {
    const workspaceId = req.workspace.id

    const [roles, processes] = await Promise.all([
      prisma.userRole.findMany({
        where:   { workspaceId },
        select:  { name: true, label: true },
        orderBy: { label: 'asc' },
      }),
      prisma.eOSProcess.findMany({
        where:   { workspaceId, status: { in: ['documented', 'followed'] } },
        include: { steps: { orderBy: { order: 'asc' } } },
        orderBy: { order: 'asc' },
      }),
    ])

    res.json({
      roles: roles.map(r => ({ name: r.name, label: r.label })),
      processes: processes.map(p => ({
        id:          p.id,
        name:        p.name,
        ownerRole:   p.ownerRole,
        status:      p.status,
        description: p.description,
        order:       p.order,
        steps: (p.steps || []).map(s => ({
          id:          s.id,
          title:       s.title,
          description: s.description,
          order:       s.order,
        })),
      })),
    })
  } catch (err) { next(err) }
}

module.exports = { listProcesses }
