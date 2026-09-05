const prisma = require('../../lib/prisma')
const { DEFAULT_TZ } = require('../../utils/dates')
const { createProject } = require('../../services/projects.service')
const { resolveProjectId, includeDetails } = require('./_shared')

function weekMondayStr(tz) {
  const safeZone = (tz && typeof tz === 'string' && tz.trim()) ? tz : DEFAULT_TZ
  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: safeZone })
  const [y, m, d] = todayStr.split('-').map(Number)
  const today = new Date(y, m - 1, d)
  const dow = today.getDay()
  const daysToMonday = dow === 0 ? 6 : dow - 1
  const monday = new Date(today)
  monday.setDate(today.getDate() - daysToMonday)
  return monday.toISOString().slice(0, 10)
}

async function list(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const userId = req.user.userId
    const tz = req.workspace.timezone

    // Todos los integrantes del workspace ven todos los proyectos activos. La
    // membresía (ProjectMember) ya no filtra acá: el frontend la usa para separar
    // "Mis proyectos" (donde soy del equipo) de "Otros proyectos del workspace".
    const where = { active: true, workspaceId }

    const projects = await prisma.project.findMany({ where, orderBy: { name: 'asc' }, include: includeDetails })
    const projectIds = projects.map(p => p.id)
    if (projectIds.length === 0) return res.json([])

    const monday = weekMondayStr(tz)

    const [activeCounts, completedWeekRaw, starredRows] = await Promise.all([
      prisma.task.groupBy({
        by: ['projectId', 'status'],
        where: { projectId: { in: projectIds }, status: { in: ['PENDING', 'IN_PROGRESS', 'PAUSED', 'BLOCKED'] } },
        _count: { _all: true },
      }),
      prisma.task.findMany({
        where: { projectId: { in: projectIds }, status: 'COMPLETED', workDay: { date: { gte: monday } } },
        select: { projectId: true },
      }),
      prisma.projectStar.findMany({
        where: { userId, projectId: { in: projectIds } },
        select: { projectId: true },
      }),
    ])

    const starredSet = new Set(starredRows.map(r => r.projectId))

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
      starred: starredSet.has(p.id),
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

// PATCH /api/projects/:id/star — destaca/quita destacado del proyecto para el
// usuario actual (preferencia personal). Devuelve { starred }.
async function toggleStar(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const userId = req.user.userId
    const projectId = await resolveProjectId(req.params.id, workspaceId)
    if (!projectId) return res.status(404).json({ error: 'Proyecto no encontrado' })

    const key = { projectId_userId: { projectId, userId } }
    const existing = await prisma.projectStar.findUnique({ where: key })
    if (existing) {
      await prisma.projectStar.delete({ where: key })
      return res.json({ starred: false })
    }
    await prisma.projectStar.create({ data: { projectId, userId } })
    res.json({ starred: true })
  } catch (err) { next(err) }
}

async function getMembers(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const id = await resolveProjectId(req.params.id, workspaceId)
    if (!id) return res.status(404).json({ error: 'Proyecto no encontrado' })

    // Lectura abierta a cualquier integrante del workspace (el proyecto ya está
    // scopeado por workspaceId vía resolveProjectId).
    const members = await prisma.projectMember.findMany({
      where: { projectId: id },
      include: { user: { select: { id: true, name: true, avatar: true } } },
      orderBy: { user: { name: 'asc' } },
    })
    res.json(members.map(m => m.user))
  } catch (err) { next(err) }
}

async function listAll(req, res, next) {
  try {
    const projects = await prisma.project.findMany({
      where: { workspaceId: req.workspace.id },
      orderBy: { name: 'asc' },
      include: includeDetails,
    })
    res.json(projects)
  } catch (err) { next(err) }
}

async function create(req, res, next) {
  try {
    const { name, serviceIds = [], memberIds = [] } = req.body
    if (!name) return res.status(400).json({ error: 'Nombre requerido' })

    const project = await createProject({
      workspaceId: req.workspace.id,
      name,
      creatorId: req.user.userId, // el creador siempre queda como miembro
      serviceIds,
      memberIds,
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
    const workspaceId = req.workspace.id
    const projectId = await resolveProjectId(req.params.id, workspaceId)
    if (!projectId) return res.status(404).json({ error: 'Proyecto no encontrado' })
    const { name, active, serviceIds, memberIds, websiteUrl, connections, monthlyHours } = req.body
    const data = {}
    if (name        !== undefined) data.name       = name
    if (active      !== undefined) {
      data.active = active
      // Marca/limpia la fecha de baja solo en la transición (no pisa la original si se re-guarda inactivo).
      const cur = await prisma.project.findFirst({ where: { id: projectId, workspaceId }, select: { active: true } })
      if (cur) {
        if (cur.active && active === false)      data.lostAt = new Date()
        else if (!cur.active && active === true) data.lostAt = null
      }
    }
    if (websiteUrl  !== undefined) data.websiteUrl = websiteUrl || null
    if (connections !== undefined) data.connections = typeof connections === 'string' ? connections : JSON.stringify(connections)
    if (monthlyHours !== undefined) {
      if (monthlyHours === null || monthlyHours === '') {
        data.monthlyHours = null
      } else {
        const h = Number(monthlyHours)
        if (!Number.isInteger(h) || h < 0) return res.status(400).json({ error: 'monthlyHours debe ser un entero positivo' })
        data.monthlyHours = h
      }
    }

    if (serviceIds !== undefined) {
      await prisma.projectService.deleteMany({ where: { projectId } })
      data.services = { create: serviceIds.map(serviceId => ({ serviceId: Number(serviceId) })) }
    }
    let newMemberIds = []
    if (memberIds !== undefined) {
      const existing = await prisma.projectMember.findMany({
        where: { projectId },
        select: { userId: true },
      })
      const existingIds = new Set(existing.map(m => m.userId))
      newMemberIds = memberIds.map(Number).filter(uid => !existingIds.has(uid))

      await prisma.projectMember.deleteMany({ where: { projectId } })
      data.members = { create: memberIds.map(userId => ({ userId: Number(userId) })) }
    }

    const project = await prisma.project.update({
      where: { id: projectId },
      data,
      include: includeDetails,
    })

    if (newMemberIds.length > 0) {
      await prisma.notification.createMany({
        data: newMemberIds.map(uid => ({
          userId:      uid,
          actorId:     req.user.userId,
          workspaceId,
          projectId,
          type:        'ADDED_TO_PROJECT',
          message:     `te agregó al proyecto "${project.name}"`,
        })),
      })
    }

    res.json(project)
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Proyecto no encontrado' })
    next(err)
  }
}

module.exports = { list, listAll, create, update, getMembers, toggleStar }
