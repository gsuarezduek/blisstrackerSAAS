const prisma = require('../lib/prisma')

function weekMondayStr(tz) {
  const safeZone = (tz && typeof tz === 'string' && tz.trim()) ? tz : 'America/Argentina/Buenos_Aires'
  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: safeZone })
  const [y, m, d] = todayStr.split('-').map(Number)
  const today = new Date(y, m - 1, d)
  const dow = today.getDay()
  const daysToMonday = dow === 0 ? 6 : dow - 1
  const monday = new Date(today)
  monday.setDate(today.getDate() - daysToMonday)
  return monday.toISOString().slice(0, 10)
}

async function resolveProjectId(param, workspaceId) {
  const num = Number(param)
  if (Number.isInteger(num) && num > 0) return num
  const project = await prisma.project.findFirst({ where: { name: param, workspaceId } })
  return project?.id ?? null
}

function isAdmin(req) {
  const m = req.workspaceMember
  return req.user?.isSuperAdmin || m?.role === 'admin' || m?.role === 'owner'
}

const includeDetails = {
  services: { include: { service: true }, orderBy: { service: { name: 'asc' } } },
  members:  {
    include: { user: { select: { id: true, name: true, avatar: true } } },
    orderBy: { user: { name: 'asc' } },
  },
  links: { orderBy: { createdAt: 'asc' } },
}

async function list(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const userId = req.user.userId
    const admin = isAdmin(req)
    const tz = req.workspace.timezone

    const where = admin
      ? { active: true, workspaceId }
      : { active: true, workspaceId, members: { some: { userId } } }

    const projects = await prisma.project.findMany({ where, orderBy: { name: 'asc' }, include: includeDetails })
    const projectIds = projects.map(p => p.id)
    if (projectIds.length === 0) return res.json([])

    const monday = weekMondayStr(tz)

    const [activeCounts, completedWeekRaw] = await Promise.all([
      prisma.task.groupBy({
        by: ['projectId', 'status'],
        where: { projectId: { in: projectIds }, status: { in: ['PENDING', 'IN_PROGRESS', 'PAUSED', 'BLOCKED'] } },
        _count: { _all: true },
      }),
      prisma.task.findMany({
        where: { projectId: { in: projectIds }, status: 'COMPLETED', workDay: { date: { gte: monday } } },
        select: { projectId: true },
      }),
    ])

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

async function getMembers(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const id = await resolveProjectId(req.params.id, workspaceId)
    if (!id) return res.status(404).json({ error: 'Proyecto no encontrado' })

    if (!isAdmin(req)) {
      const member = await prisma.projectMember.findUnique({
        where: { projectId_userId: { projectId: id, userId: req.user.userId } },
      })
      if (!member) return res.status(403).json({ error: 'No tenés acceso a este proyecto' })
    }

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

    // Asegurar que el creador siempre quede como miembro
    const creatorId = req.user.userId
    const uniqueMemberIds = [...new Set([creatorId, ...memberIds.map(Number)])]

    const project = await prisma.project.create({
      data: {
        workspaceId: req.workspace.id,
        name,
        services: { create: serviceIds.map(serviceId => ({ serviceId: Number(serviceId) })) },
        members:  { create: uniqueMemberIds.map(userId => ({ userId })) },
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
    const workspaceId = req.workspace.id
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

    if (newMemberIds.length > 0) {
      await prisma.notification.createMany({
        data: newMemberIds.map(uid => ({
          userId:      uid,
          actorId:     req.user.userId,
          workspaceId,
          projectId:   Number(id),
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

async function projectTasks(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const tz = req.workspace.timezone
    const projectId = await resolveProjectId(req.params.id, workspaceId)
    if (!projectId) return res.status(404).json({ error: 'Proyecto no encontrado' })
    const userId = req.user.userId
    const admin = isAdmin(req)

    if (!admin) {
      const member = await prisma.projectMember.findUnique({
        where: { projectId_userId: { projectId, userId } },
      })
      if (!member) return res.status(403).json({ error: 'No tenés acceso a este proyecto' })
    }

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true, name: true, createdAt: true, situation: true,
        timezone: true, linksEnabled: true, situationEnabled: true,
        links:    { orderBy: { createdAt: 'asc' } },
        services: { include: { service: true }, orderBy: { service: { name: 'asc' } } },
        members:  {
          include: { user: { select: { id: true, name: true, avatar: true } } },
          orderBy: { user: { name: 'asc' } },
        },
      },
    })
    if (!project) return res.status(404).json({ error: 'Proyecto no encontrado' })

    const monday = weekMondayStr(tz)
    const ACTIVE_LIMIT = 200

    const [activeTasks, completedThisWeek, activeCount] = await Promise.all([
      prisma.task.findMany({
        where: { projectId, status: { in: ['PENDING', 'IN_PROGRESS', 'PAUSED', 'BLOCKED'] } },
        include: {
          user:      { select: { id: true, name: true, avatar: true } },
          createdBy: { select: { id: true, name: true } },
          _count:    { select: { comments: true } },
        },
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
        take: ACTIVE_LIMIT,
      }),
      prisma.task.findMany({
        where: { projectId, status: 'COMPLETED', workDay: { date: { gte: monday } } },
        include: { user: { select: { id: true, name: true, avatar: true } } },
        orderBy: { completedAt: 'desc' },
        take: 100,
      }),
      prisma.task.count({
        where: { projectId, status: { in: ['PENDING', 'IN_PROGRESS', 'PAUSED', 'BLOCKED'] } },
      }),
    ])

    const byUser = {}
    for (const task of activeTasks) {
      const uid = task.user.id
      if (!byUser[uid]) byUser[uid] = { user: task.user, tasks: [] }
      byUser[uid].tasks.push({
        id: task.id, description: task.description, status: task.status,
        blockedReason: task.blockedReason, createdAt: task.createdAt, startedAt: task.startedAt,
        projectId: task.projectId, _count: task._count,
        createdBy: task.createdBy?.id !== task.user.id ? task.createdBy : null,
      })
    }

    res.json({
      project,
      byUser: Object.values(byUser),
      completedThisWeek: completedThisWeek.map(t => ({
        id: t.id, description: t.description, completedAt: t.completedAt, user: t.user,
      })),
      activeCount,
      activeLimit: ACTIVE_LIMIT,
    })
  } catch (err) { next(err) }
}

async function projectCompletedHistory(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const projectId = await resolveProjectId(req.params.id, workspaceId)
    if (!projectId) return res.status(404).json({ error: 'Proyecto no encontrado' })
    const userId = req.user.userId
    const skip = Math.max(0, Number(req.query.skip ?? 0))
    const TAKE = 20

    if (!isAdmin(req)) {
      const member = await prisma.projectMember.findUnique({
        where: { projectId_userId: { projectId, userId } },
      })
      if (!member) return res.status(403).json({ error: 'No tenés acceso a este proyecto' })
    }

    const tasks = await prisma.task.findMany({
      where: { projectId, status: 'COMPLETED' },
      include: { user: { select: { id: true, name: true, avatar: true } } },
      orderBy: { completedAt: 'desc' },
      skip,
      take: TAKE + 1,
    })

    const hasMore = tasks.length > TAKE
    res.json({
      tasks: tasks.slice(0, TAKE).map(t => ({
        id: t.id, description: t.description, completedAt: t.completedAt, user: t.user,
      })),
      hasMore,
    })
  } catch (err) { next(err) }
}

async function saveLinks(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const projectId = await resolveProjectId(req.params.id, workspaceId)
    if (!projectId) return res.status(404).json({ error: 'Proyecto no encontrado' })
    const userId = req.user.userId

    if (!isAdmin(req)) {
      const member = await prisma.projectMember.findUnique({
        where: { projectId_userId: { projectId, userId } },
      })
      if (!member) return res.status(403).json({ error: 'No tenés acceso a este proyecto' })
    }

    const { links } = req.body
    if (!Array.isArray(links)) return res.status(400).json({ error: 'links debe ser un array' })
    for (const l of links) {
      if (!l.label?.trim() || !l.url?.trim()) {
        return res.status(400).json({ error: 'Cada link requiere label y url' })
      }
      try { new URL(l.url.trim()) }
      catch { return res.status(400).json({ error: `URL inválida: ${l.url}` }) }
    }

    await prisma.$transaction([
      prisma.projectLink.deleteMany({ where: { projectId } }),
      ...(links.length > 0
        ? [prisma.projectLink.createMany({
            data: links.map(l => ({ projectId, label: l.label.trim(), url: l.url.trim() })),
          })]
        : []),
    ])

    const updated = await prisma.project.findUnique({ where: { id: projectId }, include: includeDetails })
    res.json(updated)
  } catch (err) { next(err) }
}

async function getGlobalSettings(req, res, next) {
  try {
    const workspace = req.workspace
    const first = await prisma.project.findFirst({
      where: { workspaceId: workspace.id },
      select: { linksEnabled: true, situationEnabled: true, emailFrom: true, aiWeeklyTokenLimit: true },
      orderBy: { id: 'asc' },
    })
    const effectiveEmailFrom = first?.emailFrom ?? process.env.EMAIL_FROM ?? null
    res.json({
      timezone: workspace.timezone,
      linksEnabled: first?.linksEnabled ?? true,
      situationEnabled: first?.situationEnabled ?? true,
      emailFrom: effectiveEmailFrom,
      aiWeeklyTokenLimit: first?.aiWeeklyTokenLimit ?? 500000,
    })
  } catch (err) { next(err) }
}

async function getAiUsage(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const now = new Date()
    const startOfDay   = new Date(now); startOfDay.setHours(0, 0, 0, 0)
    const startOfWeek  = new Date(now); startOfWeek.setDate(now.getDate() - now.getDay()); startOfWeek.setHours(0, 0, 0, 0)
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

    const [day, week, month] = await Promise.all([
      prisma.aiTokenLog.aggregate({ where: { workspaceId, createdAt: { gte: startOfDay } }, _sum: { inputTokens: true, outputTokens: true } }),
      prisma.aiTokenLog.aggregate({ where: { workspaceId, createdAt: { gte: startOfWeek } }, _sum: { inputTokens: true, outputTokens: true } }),
      prisma.aiTokenLog.aggregate({ where: { workspaceId, createdAt: { gte: startOfMonth } }, _sum: { inputTokens: true, outputTokens: true } }),
    ])

    const toTotal = (agg) => (agg._sum.inputTokens ?? 0) + (agg._sum.outputTokens ?? 0)
    res.json({
      day:   { input: day._sum.inputTokens ?? 0,   output: day._sum.outputTokens ?? 0,   total: toTotal(day) },
      week:  { input: week._sum.inputTokens ?? 0,  output: week._sum.outputTokens ?? 0,  total: toTotal(week) },
      month: { input: month._sum.inputTokens ?? 0, output: month._sum.outputTokens ?? 0, total: toTotal(month) },
    })
  } catch (err) { next(err) }
}

async function saveGlobalSettings(req, res, next) {
  try {
    const { timezone, linksEnabled, situationEnabled, emailFrom, aiWeeklyTokenLimit } = req.body
    const workspaceData = {}
    const projectData = {}

    if (timezone !== undefined) {
      try { Intl.DateTimeFormat(undefined, { timeZone: timezone }) }
      catch { return res.status(400).json({ error: 'Zona horaria inválida' }) }
      workspaceData.timezone = timezone
    }
    if (linksEnabled !== undefined)    projectData.linksEnabled    = Boolean(linksEnabled)
    if (situationEnabled !== undefined) projectData.situationEnabled = Boolean(situationEnabled)
    if (aiWeeklyTokenLimit !== undefined) {
      const limit = Number(aiWeeklyTokenLimit)
      if (!Number.isInteger(limit) || limit < 0) {
        return res.status(400).json({ error: 'aiWeeklyTokenLimit debe ser un entero positivo' })
      }
      projectData.aiWeeklyTokenLimit = limit
    }
    if (emailFrom !== undefined) {
      if (emailFrom === null || emailFrom === '') {
        projectData.emailFrom = null
      } else if (typeof emailFrom === 'string') {
        const emailMatch = emailFrom.match(/<([^>]+)>/) || [null, emailFrom.trim()]
        const addr = emailMatch[1]
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr)) {
          return res.status(400).json({ error: 'Dirección de email inválida' })
        }
        projectData.emailFrom = emailFrom.trim()
      }
    }

    const workspaceId = req.workspace.id
    await Promise.all([
      Object.keys(workspaceData).length > 0
        ? prisma.workspace.update({ where: { id: workspaceId }, data: workspaceData })
        : Promise.resolve(),
      Object.keys(projectData).length > 0
        ? prisma.project.updateMany({ where: { workspaceId }, data: projectData })
        : Promise.resolve(),
    ])

    res.json({ ok: true, ...workspaceData, ...projectData })
  } catch (err) { next(err) }
}

async function sendTestEmail(req, res, next) {
  try {
    const { sendTestSettingsEmail } = require('../services/email.service')
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { name: true, email: true },
    })
    const settings = await prisma.project.findFirst({
      where: { workspaceId: req.workspace.id },
      select: { emailFrom: true },
      orderBy: { id: 'asc' },
    })
    await sendTestSettingsEmail(user.email, user.name, settings?.emailFrom || null, req.workspace.id)
    res.json({ ok: true, sentTo: user.email })
  } catch (err) { next(err) }
}

async function saveSituation(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const projectId = await resolveProjectId(req.params.id, workspaceId)
    if (!projectId) return res.status(404).json({ error: 'Proyecto no encontrado' })
    const userId = req.user.userId

    if (!isAdmin(req)) {
      const member = await prisma.projectMember.findUnique({
        where: { projectId_userId: { projectId, userId } },
      })
      if (!member) return res.status(403).json({ error: 'No tenés acceso a este proyecto' })
    }

    const { situation } = req.body
    if (typeof situation !== 'string') {
      return res.status(400).json({ error: 'situation debe ser un string' })
    }

    const updated = await prisma.project.update({
      where: { id: projectId },
      data: { situation: situation.trim() || null },
      select: { situation: true },
    })
    res.json(updated)
  } catch (err) { next(err) }
}

module.exports = { list, listAll, create, update, projectTasks, projectCompletedHistory, saveLinks, saveSituation, getGlobalSettings, saveGlobalSettings, sendTestEmail, getAiUsage, getMembers }
