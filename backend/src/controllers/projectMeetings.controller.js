const prisma = require('../lib/prisma')
const { todayString } = require('../utils/dates')

const VALID_TYPE = ['internal', 'client']
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

// ─── Helpers ────────────────────────────────────────────────────────────────

// Resuelve :id (numérico o name) a un projectId del workspace actual.
async function resolveProjectId(param, workspaceId) {
  const num = Number(param)
  if (Number.isInteger(num) && num > 0) {
    const p = await prisma.project.findFirst({ where: { id: num, workspaceId }, select: { id: true } })
    return p?.id ?? null
  }
  const p = await prisma.project.findFirst({ where: { name: param, workspaceId }, select: { id: true } })
  return p?.id ?? null
}

function isAdmin(req) {
  const m = req.workspaceMember
  return req.user?.isSuperAdmin || m?.role === 'admin' || m?.role === 'owner'
}

// Escritura: admin/owner o miembro del proyecto (mismo criterio que saveSituation/briefs).
async function canWrite(req, projectId) {
  if (isAdmin(req)) return true
  const member = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId: req.user.userId } },
  })
  return !!member
}

// Devuelve los miembros activos del workspace marcando quiénes son del equipo
// del proyecto (`inTeam`), para poder agrupar el selector de responsable.
async function getMembers(workspaceId, projectId) {
  const [rows, teamRows] = await Promise.all([
    prisma.workspaceMember.findMany({
      where:   { workspaceId, active: true },
      include: { user: { select: { id: true, name: true, avatar: true } } },
      orderBy: { user: { name: 'asc' } },
    }),
    prisma.projectMember.findMany({ where: { projectId }, select: { userId: true } }),
  ])
  const teamIds = new Set(teamRows.map(t => t.userId))
  return rows.map(m => ({
    id: m.user.id, name: m.user.name, avatar: m.user.avatar, role: m.role,
    inTeam: teamIds.has(m.user.id),
  }))
}

function formatTodo(t) {
  return {
    id:          t.id,
    title:       t.title,
    ownerId:     t.ownerId,
    done:        t.done,
    completedAt: t.completedAt,
    order:       t.order,
    taskId:      t.taskId ?? null,
    task:        t.task ? { id: t.task.id, status: t.task.status, description: t.task.description } : null,
  }
}

function formatMeeting(m) {
  return {
    id:           m.id,
    date:         m.date,
    type:         m.type,
    notes:        m.notes,
    startedAt:    m.startedAt,
    endedAt:      m.endedAt,
    durationMins: m.durationMins,
    running:      !!m.startedAt && !m.endedAt,
    createdAt:    m.createdAt,
    todos:        m.todos ? m.todos.map(formatTodo) : undefined,
  }
}

const TODO_INCLUDE = { task: { select: { id: true, status: true, description: true } } }

// Carga una reunión del proyecto + su workspace para validar pertenencia.
async function loadMeeting(mid, projectId, workspaceId) {
  return prisma.projectMeeting.findFirst({
    where:   { id: Number(mid), projectId, workspaceId },
    include: { todos: { orderBy: [{ order: 'asc' }, { createdAt: 'asc' }], include: TODO_INCLUDE } },
  })
}

// ─── MEETINGS ─────────────────────────────────────────────────────────────────

// GET /api/projects/:id/meetings — lista (cualquier miembro del workspace).
async function listMeetings(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const projectId = await resolveProjectId(req.params.id, workspaceId)
    if (!projectId) return res.status(404).json({ error: 'Proyecto no encontrado' })

    const [members, meetings] = await Promise.all([
      getMembers(workspaceId, projectId),
      prisma.projectMeeting.findMany({
        where:   { projectId, workspaceId },
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        include: { todos: { orderBy: [{ order: 'asc' }, { createdAt: 'asc' }], include: TODO_INCLUDE } },
      }),
    ])

    res.json({ members, meetings: meetings.map(formatMeeting) })
  } catch (err) { next(err) }
}

// POST /api/projects/:id/meetings — crea (date?, type?).
async function createMeeting(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const tz = req.workspace.timezone
    const projectId = await resolveProjectId(req.params.id, workspaceId)
    if (!projectId) return res.status(404).json({ error: 'Proyecto no encontrado' })
    if (!(await canWrite(req, projectId))) return res.status(403).json({ error: 'No tenés acceso a este proyecto' })

    const { date, type } = req.body
    const d = date && DATE_RE.test(date) ? date : todayString(tz)
    const t = VALID_TYPE.includes(type) ? type : 'internal'

    const meeting = await prisma.projectMeeting.create({
      data: { projectId, workspaceId, date: d, type: t },
    })
    res.status(201).json(formatMeeting({ ...meeting, todos: [] }))
  } catch (err) { next(err) }
}

// PATCH /api/projects/:id/meetings/:mid — edita (date?, type?, notes?).
async function updateMeeting(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const projectId = await resolveProjectId(req.params.id, workspaceId)
    if (!projectId) return res.status(404).json({ error: 'Proyecto no encontrado' })
    if (!(await canWrite(req, projectId))) return res.status(403).json({ error: 'No tenés acceso a este proyecto' })

    const existing = await loadMeeting(req.params.mid, projectId, workspaceId)
    if (!existing) return res.status(404).json({ error: 'Reunión no encontrada' })

    const { date, type, notes } = req.body
    const data = {}
    if (date  !== undefined) {
      if (date && !DATE_RE.test(date)) return res.status(400).json({ error: 'date inválida (YYYY-MM-DD)' })
      data.date = date
    }
    if (type  !== undefined) {
      if (!VALID_TYPE.includes(type)) return res.status(400).json({ error: 'type inválido' })
      data.type = type
    }
    if (notes !== undefined) data.notes = notes?.trim() || null

    await prisma.projectMeeting.update({ where: { id: existing.id }, data })
    const fresh = await loadMeeting(existing.id, projectId, workspaceId)
    res.json(formatMeeting(fresh))
  } catch (err) { next(err) }
}

// DELETE /api/projects/:id/meetings/:mid
async function deleteMeeting(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const projectId = await resolveProjectId(req.params.id, workspaceId)
    if (!projectId) return res.status(404).json({ error: 'Proyecto no encontrado' })
    if (!(await canWrite(req, projectId))) return res.status(403).json({ error: 'No tenés acceso a este proyecto' })

    const existing = await prisma.projectMeeting.findFirst({ where: { id: Number(req.params.mid), projectId, workspaceId } })
    if (!existing) return res.status(404).json({ error: 'Reunión no encontrada' })

    await prisma.projectMeeting.delete({ where: { id: existing.id } })
    res.json({ deleted: true })
  } catch (err) { next(err) }
}

// POST /api/projects/:id/meetings/:mid/start — arranca el cronómetro.
async function startMeeting(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const projectId = await resolveProjectId(req.params.id, workspaceId)
    if (!projectId) return res.status(404).json({ error: 'Proyecto no encontrado' })
    if (!(await canWrite(req, projectId))) return res.status(403).json({ error: 'No tenés acceso a este proyecto' })

    const existing = await prisma.projectMeeting.findFirst({ where: { id: Number(req.params.mid), projectId, workspaceId } })
    if (!existing) return res.status(404).json({ error: 'Reunión no encontrada' })

    // (Re)inicia: marca startedAt = ahora y limpia un fin previo.
    await prisma.projectMeeting.update({
      where: { id: existing.id },
      data:  { startedAt: new Date(), endedAt: null, durationMins: null },
    })
    const fresh = await loadMeeting(existing.id, projectId, workspaceId)
    res.json(formatMeeting(fresh))
  } catch (err) { next(err) }
}

// POST /api/projects/:id/meetings/:mid/finish — frena el cronómetro y congela la duración.
async function finishMeeting(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const projectId = await resolveProjectId(req.params.id, workspaceId)
    if (!projectId) return res.status(404).json({ error: 'Proyecto no encontrado' })
    if (!(await canWrite(req, projectId))) return res.status(403).json({ error: 'No tenés acceso a este proyecto' })

    const existing = await prisma.projectMeeting.findFirst({ where: { id: Number(req.params.mid), projectId, workspaceId } })
    if (!existing) return res.status(404).json({ error: 'Reunión no encontrada' })
    if (!existing.startedAt) return res.status(400).json({ error: 'La reunión no fue iniciada' })

    const now = new Date()
    const durationMins = Math.max(0, Math.round((now.getTime() - new Date(existing.startedAt).getTime()) / 60000))
    await prisma.projectMeeting.update({
      where: { id: existing.id },
      data:  { endedAt: now, durationMins },
    })
    const fresh = await loadMeeting(existing.id, projectId, workspaceId)
    res.json(formatMeeting(fresh))
  } catch (err) { next(err) }
}

// ─── TODOS ──────────────────────────────────────────────────────────────────

// POST /api/projects/:id/meetings/:mid/todos — agrega un to-do.
async function createTodo(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const projectId = await resolveProjectId(req.params.id, workspaceId)
    if (!projectId) return res.status(404).json({ error: 'Proyecto no encontrado' })
    if (!(await canWrite(req, projectId))) return res.status(403).json({ error: 'No tenés acceso a este proyecto' })

    const meeting = await prisma.projectMeeting.findFirst({ where: { id: Number(req.params.mid), projectId, workspaceId } })
    if (!meeting) return res.status(404).json({ error: 'Reunión no encontrada' })

    const { title, ownerId } = req.body
    if (!title?.trim()) return res.status(400).json({ error: 'title es requerido' })

    const count = await prisma.projectMeetingTodo.count({ where: { meetingId: meeting.id } })
    const todo = await prisma.projectMeetingTodo.create({
      data: {
        meetingId: meeting.id,
        workspaceId,
        title:   title.trim().slice(0, 300),
        ownerId: ownerId ? Number(ownerId) : null,
        order:   count,
      },
      include: TODO_INCLUDE,
    })
    res.status(201).json(formatTodo(todo))
  } catch (err) { next(err) }
}

// PATCH /api/projects/:id/meetings/:mid/todos/:tid — edita (title?, done?, ownerId?).
async function updateTodo(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const projectId = await resolveProjectId(req.params.id, workspaceId)
    if (!projectId) return res.status(404).json({ error: 'Proyecto no encontrado' })
    if (!(await canWrite(req, projectId))) return res.status(403).json({ error: 'No tenés acceso a este proyecto' })

    const existing = await prisma.projectMeetingTodo.findFirst({
      where: { id: Number(req.params.tid), workspaceId, meeting: { projectId } },
    })
    if (!existing) return res.status(404).json({ error: 'To-Do no encontrado' })

    const { title, done, ownerId } = req.body
    const data = {}
    if (title   !== undefined) data.title   = title.trim().slice(0, 300)
    if (ownerId !== undefined) data.ownerId = ownerId ? Number(ownerId) : null
    if (done    !== undefined) {
      data.done        = Boolean(done)
      data.completedAt = done ? new Date() : null
    }

    const todo = await prisma.projectMeetingTodo.update({ where: { id: existing.id }, data, include: TODO_INCLUDE })
    res.json(formatTodo(todo))
  } catch (err) { next(err) }
}

// DELETE /api/projects/:id/meetings/:mid/todos/:tid
async function deleteTodo(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const projectId = await resolveProjectId(req.params.id, workspaceId)
    if (!projectId) return res.status(404).json({ error: 'Proyecto no encontrado' })
    if (!(await canWrite(req, projectId))) return res.status(403).json({ error: 'No tenés acceso a este proyecto' })

    const existing = await prisma.projectMeetingTodo.findFirst({
      where: { id: Number(req.params.tid), workspaceId, meeting: { projectId } },
    })
    if (!existing) return res.status(404).json({ error: 'To-Do no encontrado' })

    await prisma.projectMeetingTodo.delete({ where: { id: existing.id } })
    res.json({ deleted: true })
  } catch (err) { next(err) }
}

// POST /api/projects/:id/meetings/:mid/todos/:tid/send-to-dashboard
// Crea una tarea en el dashboard del responsable (en este mismo proyecto) y la vincula.
async function sendTodoToDashboard(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const tz          = req.workspace.timezone
    const requesterId = req.user.userId
    const projectId   = await resolveProjectId(req.params.id, workspaceId)
    if (!projectId) return res.status(404).json({ error: 'Proyecto no encontrado' })
    if (!(await canWrite(req, projectId))) return res.status(403).json({ error: 'No tenés acceso a este proyecto' })

    const todo = await prisma.projectMeetingTodo.findFirst({
      where: { id: Number(req.params.tid), workspaceId, meeting: { projectId } },
    })
    if (!todo)         return res.status(404).json({ error: 'To-Do no encontrado' })
    if (!todo.ownerId) return res.status(400).json({ error: 'Asigná un responsable al to-do primero' })
    if (todo.taskId)   return res.status(409).json({ error: 'Este to-do ya tiene una tarea vinculada' })

    const member = await prisma.workspaceMember.findUnique({
      where:  { workspaceId_userId: { workspaceId, userId: todo.ownerId } },
      select: { active: true },
    })
    if (!member || !member.active) return res.status(400).json({ error: 'El responsable no es un miembro activo del workspace' })

    // WorkDay de hoy del responsable (crear si falta — mismo patrón que tasks.create).
    const today = todayString(tz)
    const wdKey = { userId_workspaceId_date: { userId: todo.ownerId, workspaceId, date: today } }
    let workDay = await prisma.workDay.findUnique({ where: wdKey })
    if (!workDay) {
      try {
        workDay = await prisma.workDay.create({ data: { userId: todo.ownerId, workspaceId, date: today } })
      } catch (e) {
        if (e.code === 'P2002') workDay = await prisma.workDay.findUnique({ where: wdKey })
        else throw e
      }
    }
    if (!workDay) return res.status(500).json({ error: 'No se pudo obtener la jornada del responsable' })

    const task = await prisma.task.create({
      data: {
        description: todo.title,
        projectId,
        userId:      todo.ownerId,
        workDayId:   workDay.id,
        createdById: todo.ownerId !== requesterId ? requesterId : null,
      },
    })

    const updated = await prisma.projectMeetingTodo.update({
      where:   { id: todo.id },
      data:    { taskId: task.id },
      include: TODO_INCLUDE,
    })

    // Avisar al responsable (si no es quien lo envió).
    if (todo.ownerId !== requesterId) {
      const desc = todo.title.length > 60 ? todo.title.slice(0, 57) + '...' : todo.title
      await prisma.notification.create({
        data: {
          userId:     todo.ownerId,
          actorId:    requesterId,
          taskId:     task.id,
          projectId,
          workspaceId,
          type:       'TASK_MENTION',
          message:    `te asignó una tarea de una reunión: "${desc}"`,
        },
      })
    }

    res.status(201).json(formatTodo(updated))
  } catch (err) { next(err) }
}

module.exports = {
  listMeetings, createMeeting, updateMeeting, deleteMeeting, startMeeting, finishMeeting,
  createTodo, updateTodo, deleteTodo, sendTodoToDashboard,
}
