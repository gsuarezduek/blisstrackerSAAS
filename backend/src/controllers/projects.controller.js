const prisma = require('../lib/prisma')

const TZ = 'America/Argentina/Buenos_Aires'

function weekMondayStr() {
  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: TZ })
  const [y, m, d] = todayStr.split('-').map(Number)
  const today = new Date(y, m - 1, d)
  const dow = today.getDay()
  const daysToMonday = dow === 0 ? 6 : dow - 1
  const monday = new Date(today)
  monday.setDate(today.getDate() - daysToMonday)
  return monday.toISOString().slice(0, 10)
}

const includeDetails = {
  services: { include: { service: true }, orderBy: { service: { name: 'asc' } } },
  members:  { include: { user: { select: { id: true, name: true, role: true, avatar: true } } }, orderBy: { user: { name: 'asc' } } },
  links:    { orderBy: { createdAt: 'asc' } },
}

// Active projects — admin gets all, regular users get only their assigned projects
async function list(req, res, next) {
  try {
    const isAdmin = req.user.role === 'ADMIN'
    const where = isAdmin
      ? { active: true }
      : { active: true, members: { some: { userId: req.user.id } } }
    const projects = await prisma.project.findMany({ where, orderBy: { name: 'asc' }, include: includeDetails })

    const projectIds = projects.map(p => p.id)
    if (projectIds.length === 0) return res.json([])

    const monday = weekMondayStr()

    const [activeCounts, completedWeekRaw] = await Promise.all([
      prisma.task.groupBy({
        by: ['projectId', 'status'],
        where: {
          projectId: { in: projectIds },
          status: { in: ['PENDING', 'IN_PROGRESS', 'PAUSED', 'BLOCKED'] },
        },
        _count: { _all: true },
      }),
      prisma.task.findMany({
        where: {
          projectId: { in: projectIds },
          status: 'COMPLETED',
          workDay: { date: { gte: monday } },
        },
        select: { projectId: true },
      }),
    ])

    // Build counts map per projectId
    const countsMap = {}
    for (const row of activeCounts) {
      if (!countsMap[row.projectId]) countsMap[row.projectId] = {}
      countsMap[row.projectId][row.status] = row._count._all
    }
    for (const row of completedWeekRaw) {
      if (!countsMap[row.projectId]) countsMap[row.projectId] = {}
      countsMap[row.projectId].COMPLETED_WEEK = (countsMap[row.projectId].COMPLETED_WEEK ?? 0) + 1
    }

    const result = projects.map(p => ({
      ...p,
      taskCounts: {
        IN_PROGRESS:    countsMap[p.id]?.IN_PROGRESS    ?? 0,
        PENDING:        countsMap[p.id]?.PENDING        ?? 0,
        PAUSED:         countsMap[p.id]?.PAUSED         ?? 0,
        BLOCKED:        countsMap[p.id]?.BLOCKED        ?? 0,
        COMPLETED_WEEK: countsMap[p.id]?.COMPLETED_WEEK ?? 0,
      },
    }))

    res.json(result)
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
    let newMemberIds = []
    if (memberIds !== undefined) {
      const existing = await prisma.projectMember.findMany({
        where: { projectId: Number(id) },
        select: { userId: true },
      })
      const existingIds = new Set(existing.map(m => m.userId))
      newMemberIds = memberIds.map(Number).filter(uid => !existingIds.has(uid))

      await prisma.projectMember.deleteMany({ where: { projectId: Number(id) } })
      data.members = { create: memberIds.map(userId => ({ userId: Number(userId) })) }
    }

    const project = await prisma.project.update({
      where: { id: Number(id) },
      data,
      include: includeDetails,
    })

    // Notificar a los miembros recién agregados
    if (newMemberIds.length > 0) {
      await prisma.notification.createMany({
        data: newMemberIds.map(uid => ({
          userId:    uid,
          actorId:   req.user.id,
          projectId: Number(id),
          type:      'ADDED_TO_PROJECT',
          message:   `te agregó al proyecto "${project.name}"`,
        })),
      })
    }

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

    // Verificar acceso
    if (!isAdmin) {
      const member = await prisma.projectMember.findUnique({
        where: { projectId_userId: { projectId, userId } },
      })
      if (!member) return res.status(403).json({ error: 'No tenés acceso a este proyecto' })
    }

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true, name: true, createdAt: true,
        links:    { orderBy: { createdAt: 'asc' } },
        services: { include: { service: true }, orderBy: { service: { name: 'asc' } } },
        members:  { include: { user: { select: { id: true, name: true, role: true, avatar: true } } }, orderBy: { user: { name: 'asc' } } },
      },
    })
    if (!project) return res.status(404).json({ error: 'Proyecto no encontrado' })

    const monday = weekMondayStr()

    const [activeTasks, completedThisWeek] = await Promise.all([
      prisma.task.findMany({
        where: {
          projectId,
          status: { in: ['PENDING', 'IN_PROGRESS', 'PAUSED', 'BLOCKED'] },
        },
        include: {
          user: { select: { id: true, name: true, role: true, avatar: true } },
          _count: { select: { comments: true } },
        },
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      }),
      prisma.task.findMany({
        where: {
          projectId,
          status: 'COMPLETED',
          workDay: { date: { gte: monday } },
        },
        include: { user: { select: { id: true, name: true, role: true, avatar: true } } },
        orderBy: { completedAt: 'desc' },
      }),
    ])

    // Agrupar tareas activas por usuario
    const byUser = {}
    for (const task of activeTasks) {
      const uid = task.user.id
      if (!byUser[uid]) byUser[uid] = { user: task.user, tasks: [] }
      byUser[uid].tasks.push({
        id: task.id, description: task.description, status: task.status,
        blockedReason: task.blockedReason, createdAt: task.createdAt, startedAt: task.startedAt,
        projectId: task.projectId, _count: task._count,
      })
    }

    res.json({
      project,
      byUser: Object.values(byUser),
      completedThisWeek: completedThisWeek.map(t => ({
        id: t.id, description: t.description, completedAt: t.completedAt,
        user: t.user,
      })),
    })
  } catch (err) { next(err) }
}

async function projectCompletedHistory(req, res, next) {
  try {
    const projectId = Number(req.params.id)
    const userId = req.user.id
    const isAdmin = req.user.role === 'ADMIN'
    const skip = Math.max(0, Number(req.query.skip ?? 0))
    const TAKE = 20

    if (!isAdmin) {
      const member = await prisma.projectMember.findUnique({
        where: { projectId_userId: { projectId, userId } },
      })
      if (!member) return res.status(403).json({ error: 'No tenés acceso a este proyecto' })
    }

    const tasks = await prisma.task.findMany({
      where: { projectId, status: 'COMPLETED' },
      include: { user: { select: { id: true, name: true, role: true, avatar: true } } },
      orderBy: { completedAt: 'desc' },
      skip,
      take: TAKE + 1,
    })

    const hasMore = tasks.length > TAKE
    res.json({
      tasks: tasks.slice(0, TAKE).map(t => ({
        id: t.id, description: t.description, completedAt: t.completedAt,
        user: t.user,
      })),
      hasMore,
    })
  } catch (err) { next(err) }
}

// Replace all links for a project (any project member or admin)
async function saveLinks(req, res, next) {
  try {
    const projectId = Number(req.params.id)
    const userId = req.user.id

    if (!req.user.isAdmin) {
      const member = await prisma.projectMember.findUnique({
        where: { projectId_userId: { projectId, userId } },
      })
      if (!member) return res.status(403).json({ error: 'No tenés acceso a este proyecto' })
    }

    const { links } = req.body // [{ label, url }]

    if (!Array.isArray(links)) {
      return res.status(400).json({ error: 'links debe ser un array' })
    }
    for (const l of links) {
      if (!l.label?.trim() || !l.url?.trim()) {
        return res.status(400).json({ error: 'Cada link requiere label y url' })
      }
    }

    await prisma.$transaction([
      prisma.projectLink.deleteMany({ where: { projectId } }),
      ...(links.length > 0
        ? [prisma.projectLink.createMany({
            data: links.map(l => ({ projectId, label: l.label.trim(), url: l.url.trim() })),
          })]
        : []),
    ])

    const updated = await prisma.project.findUnique({
      where: { id: projectId },
      include: includeDetails,
    })
    res.json(updated)
  } catch (err) { next(err) }
}

module.exports = { list, listAll, create, update, projectTasks, projectCompletedHistory, saveLinks }
