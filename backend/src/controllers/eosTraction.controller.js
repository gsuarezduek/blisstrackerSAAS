const prisma = require('../lib/prisma')
const { todayString } = require('../utils/dates')

const VALID_ROCK_STATUS = ['not_started', 'on_track', 'off_track', 'complete']
const VALID_MEETING_TYPE = ['weekly', 'quarterly', 'annual']
const QUARTER_RE = /^\d{4}-Q[1-4]$/
const WEEK_RE    = /^\d{4}-W\d{2}$/

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Miembros activos del workspace. Si se pasa `teamIds`, marca quiénes son del
// equipo del proyecto de reuniones (`inTeam`), para agrupar el selector.
async function getMembers(workspaceId, teamIds = null) {
  const rows = await prisma.workspaceMember.findMany({
    where:   { workspaceId, active: true },
    include: { user: { select: { id: true, name: true, avatar: true } } },
    orderBy: { user: { name: 'asc' } },
  })
  return rows.map(m => ({
    id: m.user.id, name: m.user.name, avatar: m.user.avatar, role: m.role,
    inTeam: teamIds ? teamIds.has(m.user.id) : false,
  }))
}

// Proyecto configurado para las reuniones/tareas de EOS + ids de su equipo.
async function getMeetingProjectContext(workspaceId) {
  const eos = await prisma.eOSData.findUnique({ where: { workspaceId }, select: { meetingProjectId: true } })
  const meetingProjectId = eos?.meetingProjectId ?? null
  if (!meetingProjectId) return { meetingProjectId: null, teamIds: new Set() }

  const project = await prisma.project.findFirst({ where: { id: meetingProjectId, workspaceId, active: true }, select: { id: true } })
  if (!project) return { meetingProjectId: null, teamIds: new Set() }

  const teamRows = await prisma.projectMember.findMany({ where: { projectId: meetingProjectId }, select: { userId: true } })
  return { meetingProjectId, teamIds: new Set(teamRows.map(t => t.userId)) }
}

function formatRock(r) {
  return {
    id:          r.id,
    title:       r.title,
    description: r.description,
    ownerId:     r.ownerId,
    quarter:     r.quarter,
    status:      r.status,
    notes:       r.notes,
    order:       r.order,
    createdAt:   r.createdAt,
  }
}

function formatTodo(t) {
  return {
    id:          t.id,
    title:       t.title,
    ownerId:     t.ownerId,
    week:        t.week,
    done:        t.done,
    completedAt: t.completedAt,
    order:       t.order,
    createdAt:   t.createdAt,
    // Tarea del dashboard vinculada (null si no se envió).
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
    week:         m.week,
    date:         m.date,
    notes:        m.notes,
    type:         m.type ?? 'weekly',
    startedAt:    m.startedAt,
    endedAt:      m.endedAt,
    durationMins: m.durationMins,
    running:      !!m.startedAt && !m.endedAt,
    started:      !!m.startedAt,
    participants: m.participants ? m.participants.map(formatParticipant) : undefined,
  }
}

const MEETING_INCLUDE = {
  participants: {
    orderBy: { createdAt: 'asc' },
    include: { user: { select: { id: true, name: true, avatar: true } }, task: { select: { status: true } } },
  },
}

const typeLabel = (t) => (t === 'annual' ? 'Reunión Anual EOS' : t === 'quarterly' ? 'Reunión Trimestral EOS' : 'Reunión L10')

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

// Carga (o crea) la reunión de una semana con sus participantes.
async function loadMeetingByWeek(week, workspaceId, { create = false } = {}) {
  let meeting = await prisma.eOSMeeting.findFirst({ where: { workspaceId, week }, include: MEETING_INCLUDE })
  if (!meeting && create) {
    try {
      await prisma.eOSMeeting.create({ data: { workspaceId, week } })
    } catch (e) {
      if (e.code !== 'P2002') throw e
    }
    meeting = await prisma.eOSMeeting.findFirst({ where: { workspaceId, week }, include: MEETING_INCLUDE })
  }
  return meeting
}

// ─── ROCKS ────────────────────────────────────────────────────────────────────

// GET /api/eos/traction/rocks?quarter=2026-Q2
async function getRocks(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const { quarter } = req.query

    if (!quarter || !QUARTER_RE.test(quarter)) {
      return res.status(400).json({ error: 'quarter inválido (formato: YYYY-Q1..Q4)' })
    }

    const [members, rocks] = await Promise.all([
      getMembers(workspaceId),
      prisma.eOSRock.findMany({
        where:   { workspaceId, quarter },
        orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
      }),
    ])

    res.json({ members, rocks: rocks.map(formatRock) })
  } catch (err) { next(err) }
}

// POST /api/eos/traction/rocks
// body: { title, quarter, ownerId? }
async function createRock(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const { title, quarter, ownerId } = req.body

    if (!title?.trim())               return res.status(400).json({ error: 'title es requerido' })
    if (!quarter || !QUARTER_RE.test(quarter)) return res.status(400).json({ error: 'quarter inválido' })

    const count = await prisma.eOSRock.count({ where: { workspaceId, quarter } })

    const rock = await prisma.eOSRock.create({
      data: {
        workspaceId,
        title:   title.trim().slice(0, 300),
        quarter,
        ownerId: ownerId ? Number(ownerId) : null,
        order:   count,
      },
    })

    res.status(201).json(formatRock(rock))
  } catch (err) { next(err) }
}

// PATCH /api/eos/traction/rocks/:id
// body: { title?, description?, status?, notes?, ownerId?, order? }
async function updateRock(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const id = Number(req.params.id)
    const { title, description, status, notes, ownerId, order } = req.body

    const existing = await prisma.eOSRock.findFirst({ where: { id, workspaceId } })
    if (!existing) return res.status(404).json({ error: 'Roca no encontrada' })

    if (status !== undefined && !VALID_ROCK_STATUS.includes(status)) {
      return res.status(400).json({ error: 'status inválido' })
    }

    const data = {}
    if (title       !== undefined) data.title       = title.trim().slice(0, 300)
    if (description !== undefined) data.description = description?.trim() || null
    if (status      !== undefined) data.status      = status
    if (notes       !== undefined) data.notes       = notes?.trim() || null
    if (ownerId     !== undefined) data.ownerId     = ownerId ? Number(ownerId) : null
    if (order       !== undefined) data.order       = Number(order)

    const rock = await prisma.eOSRock.update({ where: { id }, data })
    res.json(formatRock(rock))
  } catch (err) { next(err) }
}

// DELETE /api/eos/traction/rocks/:id
async function deleteRock(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const id = Number(req.params.id)

    const existing = await prisma.eOSRock.findFirst({ where: { id, workspaceId } })
    if (!existing) return res.status(404).json({ error: 'Roca no encontrada' })

    await prisma.eOSRock.delete({ where: { id } })
    res.json({ deleted: true })
  } catch (err) { next(err) }
}

// ─── TODOS + MEETING ──────────────────────────────────────────────────────────

// GET /api/eos/traction/week?week=2026-W18
// Devuelve members + todos + meeting para la semana
async function getWeek(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const { week } = req.query

    if (!week || !WEEK_RE.test(week)) {
      return res.status(400).json({ error: 'week inválida (formato: YYYY-Www)' })
    }

    const [projectCtx, todos, meeting] = await Promise.all([
      getMeetingProjectContext(workspaceId),
      prisma.eOSTodo.findMany({
        where:   { workspaceId, week },
        orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
        include: { task: { select: { id: true, status: true, description: true } } },
      }),
      prisma.eOSMeeting.findFirst({ where: { workspaceId, week }, include: MEETING_INCLUDE }),
    ])

    const members = await getMembers(workspaceId, projectCtx.teamIds)

    res.json({
      members,
      meetingProjectId: projectCtx.meetingProjectId,
      todos:   todos.map(formatTodo),
      meeting: meeting ? formatMeeting(meeting) : null,
    })
  } catch (err) { next(err) }
}

// POST /api/eos/traction/todos
// body: { title, week, ownerId? }
async function createTodo(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const { title, week, ownerId } = req.body

    if (!title?.trim())           return res.status(400).json({ error: 'title es requerido' })
    if (!week || !WEEK_RE.test(week)) return res.status(400).json({ error: 'week inválida' })

    const count = await prisma.eOSTodo.count({ where: { workspaceId, week } })

    const todo = await prisma.eOSTodo.create({
      data: {
        workspaceId,
        title:   title.trim().slice(0, 300),
        week,
        ownerId: ownerId ? Number(ownerId) : null,
        order:   count,
      },
    })

    res.status(201).json(formatTodo(todo))
  } catch (err) { next(err) }
}

// PATCH /api/eos/traction/todos/:id
// body: { title?, done?, ownerId? }
async function updateTodo(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const id = Number(req.params.id)
    const { title, done, ownerId } = req.body

    const existing = await prisma.eOSTodo.findFirst({ where: { id, workspaceId } })
    if (!existing) return res.status(404).json({ error: 'To-Do no encontrado' })

    const data = {}
    if (title   !== undefined) data.title   = title.trim().slice(0, 300)
    if (ownerId !== undefined) data.ownerId = ownerId ? Number(ownerId) : null
    if (done    !== undefined) {
      data.done        = Boolean(done)
      data.completedAt = done ? new Date() : null
    }

    const todo = await prisma.eOSTodo.update({
      where:   { id },
      data,
      include: { task: { select: { id: true, status: true, description: true } } },
    })
    res.json(formatTodo(todo))
  } catch (err) { next(err) }
}

// DELETE /api/eos/traction/todos/:id
async function deleteTodo(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const id = Number(req.params.id)

    const existing = await prisma.eOSTodo.findFirst({ where: { id, workspaceId } })
    if (!existing) return res.status(404).json({ error: 'To-Do no encontrado' })

    await prisma.eOSTodo.delete({ where: { id } })
    res.json({ deleted: true })
  } catch (err) { next(err) }
}

// POST /api/eos/traction/todos/:id/send-to-dashboard
// body: { projectId? } — crea una tarea en el dashboard del responsable del To-Do
// y la vincula (taskId). Si no se pasa projectId, usa el proyecto de EOS configurado
// (EOSData.meetingProjectId). Al completar esa tarea, el To-Do se tilda solo.
async function sendTodoToDashboard(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const tz          = req.workspace.timezone
    const requesterId = req.user.userId
    const id          = Number(req.params.id)

    // projectId explícito o, si no viene, el proyecto de EOS configurado.
    let projectId = req.body.projectId ? Number(req.body.projectId) : null
    if (!projectId) {
      const eos = await prisma.eOSData.findUnique({ where: { workspaceId }, select: { meetingProjectId: true } })
      projectId = eos?.meetingProjectId ?? null
    }
    if (!projectId) {
      return res.status(400).json({ error: 'Configurá el proyecto de EOS en Preferencias → Módulos adicionales', code: 'NO_MEETING_PROJECT' })
    }

    const todo = await prisma.eOSTodo.findFirst({ where: { id, workspaceId } })
    if (!todo)         return res.status(404).json({ error: 'To-Do no encontrado' })
    if (!todo.ownerId) return res.status(400).json({ error: 'Asigná un responsable al To-Do primero' })
    if (todo.taskId)   return res.status(409).json({ error: 'Este To-Do ya tiene una tarea vinculada' })

    const [project, member] = await Promise.all([
      prisma.project.findFirst({ where: { id: projectId, workspaceId, active: true }, select: { id: true } }),
      prisma.workspaceMember.findUnique({
        where:  { workspaceId_userId: { workspaceId, userId: todo.ownerId } },
        select: { active: true },
      }),
    ])
    if (!project)               return res.status(400).json({ error: 'Proyecto inválido' })
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

    const updated = await prisma.eOSTodo.update({
      where:   { id },
      data:    { taskId: task.id },
      include: { task: { select: { id: true, status: true, description: true } } },
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
          message:    `te asignó un To-Do de L10: "${desc}"`,
        },
      })
    }

    res.status(201).json(formatTodo(updated))
  } catch (err) { next(err) }
}

// PUT /api/eos/traction/meetings/:week
// body: { date?, rating?, notes?, type? }
async function upsertMeeting(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const { week } = req.params
    const { date, notes, type } = req.body

    if (!WEEK_RE.test(week)) return res.status(400).json({ error: 'week inválida' })

    const data = {}
    if (date   !== undefined) data.date   = date || null
    if (notes  !== undefined) data.notes  = notes?.trim() || null
    if (type !== undefined) {
      if (!VALID_MEETING_TYPE.includes(type)) {
        return res.status(400).json({ error: 'type inválido' })
      }
      data.type = type
    }

    await prisma.eOSMeeting.upsert({
      where:  { workspaceId_week: { workspaceId, week } },
      create: { workspaceId, week, ...data },
      update: data,
    })

    const meeting = await loadMeetingByWeek(week, workspaceId)
    res.json(formatMeeting(meeting))
  } catch (err) { next(err) }
}

// ─── PARTICIPANTES + CRONÓMETRO (reunión L10) ──────────────────────────────────

// POST /api/eos/traction/meetings/:week/participants — agrega un participante.
// Solo antes de iniciar. Crea la reunión de la semana si no existe.
async function addParticipant(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const { week } = req.params
    if (!WEEK_RE.test(week)) return res.status(400).json({ error: 'week inválida' })

    const userId = Number(req.body.userId)
    if (!userId) return res.status(400).json({ error: 'userId es requerido' })

    const member = await prisma.workspaceMember.findUnique({
      where:  { workspaceId_userId: { workspaceId, userId } },
      select: { active: true },
    })
    if (!member || !member.active) return res.status(400).json({ error: 'No es un miembro activo del workspace' })

    let meeting = await loadMeetingByWeek(week, workspaceId, { create: true })
    if (meeting.startedAt) return res.status(409).json({ error: 'No se pueden editar los participantes después de iniciar la reunión' })

    try {
      await prisma.eOSMeetingParticipant.create({ data: { meetingId: meeting.id, workspaceId, userId } })
    } catch (e) {
      if (e.code !== 'P2002') throw e // ya estaba: idempotente
    }

    meeting = await loadMeetingByWeek(week, workspaceId)
    res.status(201).json(formatMeeting(meeting))
  } catch (err) { next(err) }
}

// DELETE /api/eos/traction/meetings/:week/participants/:uid — quita un participante.
async function removeParticipant(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const { week, uid } = req.params
    if (!WEEK_RE.test(week)) return res.status(400).json({ error: 'week inválida' })

    const meeting = await loadMeetingByWeek(week, workspaceId)
    if (!meeting) return res.status(404).json({ error: 'Reunión no encontrada' })
    if (meeting.startedAt) return res.status(409).json({ error: 'No se pueden editar los participantes después de iniciar la reunión' })

    await prisma.eOSMeetingParticipant.deleteMany({ where: { meetingId: meeting.id, userId: Number(uid) } })
    const fresh = await loadMeetingByWeek(week, workspaceId)
    res.json(formatMeeting(fresh))
  } catch (err) { next(err) }
}

// POST /api/eos/traction/meetings/:week/participants/from-project — agrega como
// participantes a todo el equipo del proyecto de EOS configurado. Idempotente.
async function seedParticipantsFromProject(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const { week } = req.params
    if (!WEEK_RE.test(week)) return res.status(400).json({ error: 'week inválida' })

    const { meetingProjectId, teamIds } = await getMeetingProjectContext(workspaceId)
    if (!meetingProjectId) {
      return res.status(400).json({ error: 'Configurá el proyecto de EOS en Preferencias → Módulos adicionales', code: 'NO_MEETING_PROJECT' })
    }

    let meeting = await loadMeetingByWeek(week, workspaceId, { create: true })
    if (meeting.startedAt) return res.status(409).json({ error: 'No se pueden editar los participantes después de iniciar la reunión' })

    // Solo miembros activos del workspace que estén en el equipo del proyecto.
    const activeIds = new Set(
      (await prisma.workspaceMember.findMany({ where: { workspaceId, active: true }, select: { userId: true } }))
        .map(m => m.userId)
    )
    const toAdd = [...teamIds].filter(id => activeIds.has(id))
    if (toAdd.length) {
      await prisma.eOSMeetingParticipant.createMany({
        data: toAdd.map(userId => ({ meetingId: meeting.id, workspaceId, userId })),
        skipDuplicates: true,
      })
    }

    meeting = await loadMeetingByWeek(week, workspaceId)
    res.json(formatMeeting(meeting))
  } catch (err) { next(err) }
}

// POST /api/eos/traction/meetings/:week/start — arranca el cronómetro y, por cada
// participante, crea una Task IN_PROGRESS en el proyecto de reuniones configurado.
// Bloquea si algún participante tiene una tarea en curso.
async function startMeeting(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const tz          = req.workspace.timezone
    const requesterId = req.user.userId
    const { week } = req.params
    if (!WEEK_RE.test(week)) return res.status(400).json({ error: 'week inválida' })

    const meeting = await loadMeetingByWeek(week, workspaceId)
    if (!meeting) return res.status(404).json({ error: 'Reunión no encontrada' })
    if (meeting.startedAt && !meeting.endedAt) return res.status(409).json({ error: 'La reunión ya está en curso' })
    if (meeting.endedAt) return res.status(409).json({ error: 'La reunión ya fue finalizada' })
    if (meeting.participants.length === 0) return res.status(400).json({ error: 'Agregá al menos un participante antes de iniciar' })

    // Proyecto configurado para las tareas de reuniones L10 (EOSData.meetingProjectId).
    const eos = await prisma.eOSData.findUnique({ where: { workspaceId }, select: { meetingProjectId: true } })
    const meetingProjectId = eos?.meetingProjectId
    if (!meetingProjectId) {
      return res.status(400).json({ error: 'Configurá el proyecto para reuniones antes de iniciar', code: 'NO_MEETING_PROJECT' })
    }
    const project = await prisma.project.findFirst({ where: { id: meetingProjectId, workspaceId, active: true }, select: { id: true } })
    if (!project) return res.status(400).json({ error: 'El proyecto configurado para reuniones ya no está disponible', code: 'NO_MEETING_PROJECT' })

    const participantIds = meeting.participants.map(p => p.userId)

    // Bloqueo: nadie del grupo puede tener una tarea en curso al iniciar.
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

    const now   = new Date()
    const today = todayString(tz)

    // Workdays por participante (idempotente — no es sensible dejarla creada
    // aunque la transacción de abajo falle).
    const workDays = {}
    for (const p of meeting.participants) {
      const wd = await ensureWorkDay(p.userId, workspaceId, today)
      if (wd) workDays[p.userId] = wd
    }

    // Todo o nada: si algún participante ya tiene una tarea en curso (condición de
    // carrera con el busy-check de arriba), se revierte todo lo creado en este loop
    // en vez de dejar tareas "fantasma" para los participantes anteriores.
    try {
      await prisma.$transaction(async (tx) => {
        for (const p of meeting.participants) {
          const workDay = workDays[p.userId]
          if (!workDay) continue
          const task = await tx.task.create({
            data: {
              description: typeLabel(meeting.type),
              projectId:   meetingProjectId,
              userId:      p.userId,
              workDayId:   workDay.id,
              status:      'IN_PROGRESS',
              startedAt:   now,
              createdById: p.userId !== requesterId ? requesterId : null,
            },
          })
          await tx.taskSession.create({ data: { taskId: task.id, startedAt: now } })
          await tx.eOSMeetingParticipant.update({ where: { id: p.id }, data: { taskId: task.id } })
        }
        await tx.eOSMeeting.update({ where: { id: meeting.id }, data: { startedAt: now, endedAt: null, durationMins: null } })
      })
    } catch (e) {
      if (e.code === 'P2002') {
        return res.status(409).json({ error: 'Uno de los participantes acaba de iniciar otra tarea. Reintentá.' })
      }
      throw e
    }

    const fresh = await loadMeetingByWeek(week, workspaceId)
    res.json(formatMeeting(fresh))
  } catch (err) { next(err) }
}

// POST /api/eos/traction/meetings/:week/finish — frena el cronómetro, congela la
// duración y completa las tareas de los participantes (su tiempo se suma al proyecto).
async function finishMeeting(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const { week } = req.params
    if (!WEEK_RE.test(week)) return res.status(400).json({ error: 'week inválida' })

    const meeting = await loadMeetingByWeek(week, workspaceId)
    if (!meeting) return res.status(404).json({ error: 'Reunión no encontrada' })
    if (!meeting.startedAt) return res.status(400).json({ error: 'La reunión no fue iniciada' })

    const now = new Date()
    const durationMins = Math.max(0, Math.round((now.getTime() - new Date(meeting.startedAt).getTime()) / 60000))

    const taskIds = meeting.participants.map(p => p.taskId).filter(Boolean)
    if (taskIds.length) {
      await prisma.taskSession.updateMany({ where: { taskId: { in: taskIds }, endedAt: null }, data: { endedAt: now } })
      await prisma.task.updateMany({
        where: { id: { in: taskIds }, status: 'IN_PROGRESS' },
        data:  { status: 'COMPLETED', completedAt: now, pausedAt: null },
      })
    }

    await prisma.eOSMeeting.update({ where: { id: meeting.id }, data: { endedAt: now, durationMins } })
    const fresh = await loadMeetingByWeek(week, workspaceId)
    res.json(formatMeeting(fresh))
  } catch (err) { next(err) }
}

// GET /api/eos/traction/meetings/special?type=quarterly|annual
// Lista reuniones especiales ordenadas por week DESC, para navegación rápida.
async function listSpecialMeetings(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const { type } = req.query

    const where = { workspaceId, type: { in: ['quarterly', 'annual'] } }
    if (type === 'quarterly' || type === 'annual') where.type = type

    const meetings = await prisma.eOSMeeting.findMany({
      where,
      orderBy: { week: 'desc' },
    })

    res.json({ meetings: meetings.map(formatMeeting) })
  } catch (err) { next(err) }
}

module.exports = {
  getRocks, createRock, updateRock, deleteRock,
  getWeek, createTodo, updateTodo, deleteTodo, sendTodoToDashboard,
  upsertMeeting, listSpecialMeetings,
  addParticipant, removeParticipant, seedParticipantsFromProject, startMeeting, finishMeeting,
}
