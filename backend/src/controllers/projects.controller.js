const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

const includeDetails = {
  services: { include: { service: true }, orderBy: { service: { name: 'asc' } } },
  members:  { include: { user: { select: { id: true, name: true, role: true } } }, orderBy: { user: { name: 'asc' } } },
}

// Active projects — admin gets all, regular users get only their assigned projects
async function list(req, res, next) {
  try {
    const isAdmin = req.user.role === 'ADMIN'
    const where = isAdmin
      ? { active: true }
      : { active: true, members: { some: { userId: req.user.id } } }
    const projects = await prisma.project.findMany({ where, orderBy: { name: 'asc' }, include: includeDetails })
    res.json(projects)
  } catch (err) { next(err) }
}

// Admin: all projects including inactive
async function listAll(req, res, next) {
  try {
    const projects = await prisma.project.findMany({ orderBy: { name: 'asc' }, include: includeDetails })
    res.json(projects)
  } catch (err) { next(err) }
}

async function create(req, res, next) {
  try {
    const { name, serviceIds = [], memberIds = [] } = req.body
    if (!name) return res.status(400).json({ error: 'Nombre requerido' })
    const project = await prisma.project.create({
      data: {
        name,
        services: { create: serviceIds.map(serviceId => ({ serviceId: Number(serviceId) })) },
        members:  { create: memberIds.map(userId   => ({ userId:    Number(userId)    })) },
      },
      include: includeDetails,
    })
    res.status(201).json(project)
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'Proyecto ya existe' })
    next(err)
  }
}

async function update(req, res, next) {
  try {
    const { id } = req.params
    const { name, active, serviceIds, memberIds } = req.body
    const data = {}
    if (name   !== undefined) data.name   = name
    if (active !== undefined) data.active = active

    if (serviceIds !== undefined) {
      await prisma.projectService.deleteMany({ where: { projectId: Number(id) } })
      data.services = { create: serviceIds.map(serviceId => ({ serviceId: Number(serviceId) })) }
    }
    if (memberIds !== undefined) {
      await prisma.projectMember.deleteMany({ where: { projectId: Number(id) } })
      data.members = { create: memberIds.map(userId => ({ userId: Number(userId) })) }
    }

    const project = await prisma.project.update({
      where: { id: Number(id) },
      data,
      include: includeDetails,
    })
    res.json(project)
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Proyecto no encontrado' })
    next(err)
  }
}

async function projectTasks(req, res, next) {
  try {
    const projectId = Number(req.params.id)
    const userId = req.user.id
    const isAdmin = req.user.role === 'ADMIN'

    // Verificar que el usuario es miembro del proyecto (o admin)
    if (!isAdmin) {
      const member = await prisma.projectMember.findUnique({
        where: { projectId_userId: { projectId, userId } },
      })
      if (!member) return res.status(403).json({ error: 'No tenés acceso a este proyecto' })
    }

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, name: true },
    })
    if (!project) return res.status(404).json({ error: 'Proyecto no encontrado' })

    const tasks = await prisma.task.findMany({
      where: {
        projectId,
        status: { in: ['PENDING', 'IN_PROGRESS', 'PAUSED'] },
      },
      include: {
        user: { select: { id: true, name: true, role: true } },
      },
      orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
    })

    // Agrupar por usuario
    const byUser = {}
    for (const task of tasks) {
      const uid = task.user.id
      if (!byUser[uid]) byUser[uid] = { user: task.user, tasks: [] }
      byUser[uid].tasks.push({ id: task.id, description: task.description, status: task.status, createdAt: task.createdAt, startedAt: task.startedAt })
    }

    res.json({ project, byUser: Object.values(byUser) })
  } catch (err) { next(err) }
}

module.exports = { list, listAll, create, update, projectTasks }
