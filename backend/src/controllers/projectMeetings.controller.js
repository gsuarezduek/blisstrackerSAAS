const prisma = require('../lib/prisma')
const { todayString } = require('../utils/dates')
const { isAdmin, canWrite } = require('../lib/projectAccess')

const VALID_TYPE = ['internal', 'client']
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const DEFAULT_MEETINGS_PAGE_SIZE = 5
const MAX_MEETINGS_PAGE_SIZE = 100

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

function formatParticipant(p) {
  return {
    id:         p.id,
    userId:     p.userId,
    name:       p.user?.name,
    avatar:     p.user?.avatar,
    taskId:     p.taskId ?? null,
    taskStatus: p.task?.status ?? null,
  }
}

function formatMeeting(m) {
  return {
    id:           m.id,
    date:         m.date,
    title:        m.title,
    type:         m.type,
    notes:        m.notes,
    startedAt:    m.startedAt,
    endedAt:      m.endedAt,
    durationMins: m.durationMins,
    running:      !!m.startedAt && !m.endedAt,
    started:      !!m.startedAt,
    createdAt:    m.createdAt,
    todos:        m.todos ? m.todos.map(formatTodo) : undefined,
    participants: m.participants ? m.participants.map(formatParticipant) : undefined,
  }
}

const TODO_INCLUDE = { task: { select: { id: true, status: true, description: true } } }
const MEETING_INCLUDE = {
  todos:        { orderBy: [{ order: 'asc' }, { createdAt: 'asc' }], include: TODO_INCLUDE },
  participants: { orderBy: { createdAt: 'asc' }, include: { user: { select: { id: true, name: true, avatar: true } }, task: { select: { status: true } } } },
}

// Carga una reunión del proyecto + su workspace para validar pertenencia.
async function loadMeeting(mid, projectId, workspaceId) {
  return prisma.projectMeeting.findFirst({
    where:   { id: Number(mid), projectId, workspaceId },
    include: MEETING_INCLUDE,
  })
}

const typeLabel = (t) => (t === 'client' ? 'Reunión con cliente' : 'Reunión de equipo')

// WorkDay de hoy del usuario (crear si falta — mismo patrón que tasks.create).
async function ensureWorkDay(userId, workspaceId, today) {
  const wdKey = { userId_workspaceId_date: { userId, workspaceId, date: today } }
  let workDay = await prisma.workDay.findUnique({ where: wdKey })
  if (!workDay) {
    try {
      workDay = await prisma.workDay.create({ data: { userId, workspaceId, date: today } })
    } catch (e) {
      if (e.code === 'P2002') workDay = await prisma.workDay.findUnique({ where: wdKey })
      else throw e
    }
  }
  return workDay
}

// ─── MEETINGS ─────────────────────────────────────────────────────────────────

// GET /api/projects/:id/meetings — lista paginada (cualquier miembro del workspace).
// ?skip=&take= (default take=5, tope 100) — más recientes primero.
async function listMeetings(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const projectId = await resolveProjectId(req.params.id, workspaceId)
    if (!projectId) return res.status(404).json({ error: 'Proyecto no encontrado' })

    const skip = Math.max(parseInt(req.query.skip, 10) || 0, 0)
    const take = Math.min(Math.max(parseInt(req.query.take, 10) || DEFAULT_MEETINGS_PAGE_SIZE, 1), MAX_MEETINGS_PAGE_SIZE)

    const [members, total, meetings] = await Promise.all([
      getMembers(workspaceId, projectId),
      prisma.projectMeeting.count({ where: { projectId, workspaceId } }),
      prisma.projectMeeting.findMany({
        where:   { projectId, workspaceId },
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        include: MEETING_INCLUDE,
        skip,
        take,
      }),
    ])

    res.json({ members, meetings: meetings.map(formatMeeting), total })
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

    const { date, type, title } = req.body
    const d = date && DATE_RE.test(date) ? date : todayString(tz)
    const t = VALID_TYPE.includes(type) ? type : 'internal'
    const ti = typeof title === 'string' && title.trim() ? title.trim().slice(0, 120) : null

    const meeting = await prisma.projectMeeting.create({
      data: { projectId, workspaceId, date: d, type: t, title: ti },
    })

    // El creador queda como participante por defecto (si es miembro activo del workspace).
    const creator = await prisma.workspaceMember.findUnique({
      where:  { workspaceId_userId: { workspaceId, userId: req.user.userId } },
      select: { active: true },
    })
    if (creator?.active) {
      try {
        await prisma.projectMeetingParticipant.create({
          data: { meetingId: meeting.id, workspaceId, userId: req.user.userId },
        })
      } catch (e) {
        if (e.code !== 'P2002') throw e // idempotente
      }
    }

    const fresh = await loadMeeting(meeting.id, projectId, workspaceId)
    res.status(201).json(formatMeeting(fresh))
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

    const { date, type, notes, title } = req.body
    const data = {}
    if (date  !== undefined) {
      if (date && !DATE_RE.test(date)) return res.status(400).json({ error: 'date inválida (YYYY-MM-DD)' })
      data.date = date
    }
    if (title !== undefined) data.title = typeof title === 'string' && title.trim() ? title.trim().slice(0, 120) : null
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

// POST /api/projects/:id/meetings/:mid/start — arranca el cronómetro y, por cada
// participante, crea una Task IN_PROGRESS en el proyecto (su tiempo cuenta para el
// proyecto y aparece en Actividad). Bloquea si algún participante tiene una tarea en curso.
async function startMeeting(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const tz          = req.workspace.timezone
    const requesterId = req.user.userId
    const projectId   = await resolveProjectId(req.params.id, workspaceId)
    if (!projectId) return res.status(404).json({ error: 'Proyecto no encontrado' })
    if (!(await canWrite(req, projectId))) return res.status(403).json({ error: 'No tenés acceso a este proyecto' })

    const existing = await loadMeeting(req.params.mid, projectId, workspaceId)
    if (!existing) return res.status(404).json({ error: 'Reunión no encontrada' })
    if (existing.startedAt && !existing.endedAt) return res.status(409).json({ error: 'La reunión ya está en curso' })
    if (existing.endedAt) return res.status(409).json({ error: 'La reunión ya fue finalizada' })

    const participants = existing.participants
    const participantIds = participants.map(p => p.userId)

    // Bloqueo: nadie del grupo puede tener una tarea en curso al iniciar.
    if (participantIds.length) {
      const busy = await prisma.task.findMany({
        where:   { userId: { in: participantIds }, status: 'IN_PROGRESS' },
        include: { user: { select: { name: true } } },
      })
      if (busy.length) {
        const names = [...new Set(busy.map(b => b.user.name))].join(', ')
        return res.status(409).json({
          error: `No se puede iniciar: ${names} ${busy.length > 1 ? 'tienen' : 'tiene'} una tarea en curso. Debe pausarla o completarla primero.`,
        })
      }
    }

    const now   = new Date()
    const today = todayString(tz)

    // Workdays por participante (idempotente — no es sensible dejarla creada
    // aunque la transacción de abajo falle).
    const workDays = {}
    for (const p of participants) {
      const wd = await ensureWorkDay(p.userId, workspaceId, today)
      if (wd) workDays[p.userId] = wd
    }

    // Todo o nada: si algún participante ya tiene una tarea en curso (condición de
    // carrera con el busy-check de arriba, ej. dos reuniones iniciándose casi
    // simultáneamente con un participante en común), se revierte todo lo creado en
    // este loop en vez de dejar tareas "fantasma" para los participantes anteriores.
    try {
      await prisma.$transaction(async (tx) => {
        for (const p of participants) {
          const workDay = workDays[p.userId]
          if (!workDay) continue
          const task = await tx.task.create({
            data: {
              description: typeLabel(existing.type),
              projectId,
              userId:      p.userId,
              workDayId:   workDay.id,
              status:      'IN_PROGRESS',
              startedAt:   now,
              createdById: p.userId !== requesterId ? requesterId : null,
            },
          })
          await tx.taskSession.create({ data: { taskId: task.id, startedAt: now } })
          await tx.projectMeetingParticipant.update({ where: { id: p.id }, data: { taskId: task.id } })
        }
        await tx.projectMeeting.update({
          where: { id: existing.id },
          data:  { startedAt: now, endedAt: null, durationMins: null },
        })
      })
    } catch (e) {
      if (e.code === 'P2002') {
        return res.status(409).json({ error: 'Uno de los participantes acaba de iniciar otra tarea. Reintentá.' })
      }
      throw e
    }

    const fresh = await loadMeeting(existing.id, projectId, workspaceId)
    res.json(formatMeeting(fresh))
  } catch (err) { next(err) }
}

// POST /api/projects/:id/meetings/:mid/finish — frena el cronómetro, congela la
// duración y completa las tareas de los participantes (su tiempo se suma al proyecto).
async function finishMeeting(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const projectId = await resolveProjectId(req.params.id, workspaceId)
    if (!projectId) return res.status(404).json({ error: 'Proyecto no encontrado' })
    if (!(await canWrite(req, projectId))) return res.status(403).json({ error: 'No tenés acceso a este proyecto' })

    const existing = await loadMeeting(req.params.mid, projectId, workspaceId)
    if (!existing) return res.status(404).json({ error: 'Reunión no encontrada' })
    if (!existing.startedAt) return res.status(400).json({ error: 'La reunión no fue iniciada' })

    const now = new Date()
    const durationMins = Math.max(0, Math.round((now.getTime() - new Date(existing.startedAt).getTime()) / 60000))

    // Completar las tareas de los participantes que sigan en curso (cerrar su sesión).
    const taskIds = existing.participants.map(p => p.taskId).filter(Boolean)
    if (taskIds.length) {
      await prisma.taskSession.updateMany({ where: { taskId: { in: taskIds }, endedAt: null }, data: { endedAt: now } })
      await prisma.task.updateMany({
        where: { id: { in: taskIds }, status: 'IN_PROGRESS' },
        data:  { status: 'COMPLETED', completedAt: now, pausedAt: null },
      })
    }

    await prisma.projectMeeting.update({
      where: { id: existing.id },
      data:  { endedAt: now, durationMins },
    })
    const fresh = await loadMeeting(existing.id, projectId, workspaceId)
    res.json(formatMeeting(fresh))
  } catch (err) { next(err) }
}

// ─── PARTICIPANTES ────────────────────────────────────────────────────────────

// POST /api/projects/:id/meetings/:mid/participants — agrega un participante.
// Solo antes de iniciar (una vez iniciada, el grupo queda fijo).
async function addParticipant(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const projectId = await resolveProjectId(req.params.id, workspaceId)
    if (!projectId) return res.status(404).json({ error: 'Proyecto no encontrado' })
    if (!(await canWrite(req, projectId))) return res.status(403).json({ error: 'No tenés acceso a este proyecto' })

    const meeting = await prisma.projectMeeting.findFirst({ where: { id: Number(req.params.mid), projectId, workspaceId } })
    if (!meeting) return res.status(404).json({ error: 'Reunión no encontrada' })
    if (meeting.startedAt) return res.status(409).json({ error: 'No se pueden editar los participantes después de iniciar la reunión' })

    const userId = Number(req.body.userId)
    if (!userId) return res.status(400).json({ error: 'userId es requerido' })

    const member = await prisma.workspaceMember.findUnique({
      where:  { workspaceId_userId: { workspaceId, userId } },
      select: { active: true },
    })
    if (!member || !member.active) return res.status(400).json({ error: 'No es un miembro activo del workspace' })

    try {
      await prisma.projectMeetingParticipant.create({ data: { meetingId: meeting.id, workspaceId, userId } })
    } catch (e) {
      if (e.code !== 'P2002') throw e // ya estaba: idempotente
    }

    const fresh = await loadMeeting(meeting.id, projectId, workspaceId)
    res.status(201).json(formatMeeting(fresh))
  } catch (err) { next(err) }
}

// DELETE /api/projects/:id/meetings/:mid/participants/:uid — quita un participante.
async function removeParticipant(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const projectId = await resolveProjectId(req.params.id, workspaceId)
    if (!projectId) return res.status(404).json({ error: 'Proyecto no encontrado' })
    if (!(await canWrite(req, projectId))) return res.status(403).json({ error: 'No tenés acceso a este proyecto' })

    const meeting = await prisma.projectMeeting.findFirst({ where: { id: Number(req.params.mid), projectId, workspaceId } })
    if (!meeting) return res.status(404).json({ error: 'Reunión no encontrada' })
    if (meeting.startedAt) return res.status(409).json({ error: 'No se pueden editar los participantes después de iniciar la reunión' })

    await prisma.projectMeetingParticipant.deleteMany({ where: { meetingId: meeting.id, userId: Number(req.params.uid) } })
    const fresh = await loadMeeting(meeting.id, projectId, workspaceId)
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
  addParticipant, removeParticipant,
  createTodo, updateTodo, deleteTodo, sendTodoToDashboard,
}
