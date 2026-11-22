const prisma = require('../../lib/prisma')

async function resolveProjectId(param, workspaceId) {
  const num = Number(param)
  if (Number.isInteger(num) && num > 0) {
    const p = await prisma.project.findFirst({ where: { id: num, workspaceId }, select: { id: true } })
    return p?.id ?? null
  }
  const project = await prisma.project.findFirst({ where: { name: param, workspaceId } })
  return project?.id ?? null
}

const includeDetails = {
  services: { include: { service: true }, orderBy: { service: { name: 'asc' } } },
  members:  {
    include: { user: { select: { id: true, name: true, avatar: true } } },
    orderBy: { user: { name: 'asc' } },
  },
  // Agentes IA del equipo del proyecto (ProjectAgent). Es una etiqueta igual que
  // `members`, no una barrera: el agente puede trabajar igual en cualquier proyecto.
  agents: {
    include: {
      agent: {
        select: { id: true, label: true, color: true, teamRole: true, user: { select: { id: true, name: true } } },
      },
    },
    orderBy: { agent: { label: 'asc' } },
  },
  links: { orderBy: { createdAt: 'asc' } },
  integrations: {
    where:  { status: 'active' },
    select: { type: true },
  },
  chatChannel: { select: { slug: true } },
  // Tareas no completadas — usado por el modal de confirmación al desactivar
  // un proyecto (Admin → Proyectos), para avisar cuántas van a dejar de verse
  // en los dashboards mientras el proyecto esté inactivo.
  _count: {
    select: { tasks: { where: { status: { in: ['PENDING', 'IN_PROGRESS', 'PAUSED', 'BLOCKED'] } } } },
  },
}

module.exports = { resolveProjectId, includeDetails }
