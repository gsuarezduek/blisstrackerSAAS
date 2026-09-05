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
  links: { orderBy: { createdAt: 'asc' } },
  integrations: {
    where:  { status: 'active' },
    select: { type: true },
  },
  chatChannel: { select: { slug: true } },
}

module.exports = { resolveProjectId, includeDetails }
