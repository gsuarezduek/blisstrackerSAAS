const prisma = require('../lib/prisma')

const VALID_ROCK_STATUS = ['not_started', 'on_track', 'off_track', 'complete']
const QUARTER_RE = /^\d{4}-Q[1-4]$/
const WEEK_RE    = /^\d{4}-W\d{2}$/

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getMembers(workspaceId) {
  const rows = await prisma.workspaceMember.findMany({
    where:   { workspaceId, active: true },
    include: { user: { select: { id: true, name: true, avatar: true } } },
    orderBy: { user: { name: 'asc' } },
  })
  return rows.map(m => ({ id: m.user.id, name: m.user.name, avatar: m.user.avatar }))
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
  }
}

function formatMeeting(m) {
  return {
    id:     m.id,
    week:   m.week,
    date:   m.date,
    rating: m.rating,
    notes:  m.notes,
  }
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

    const [members, todos, meeting] = await Promise.all([
      getMembers(workspaceId),
      prisma.eOSTodo.findMany({
        where:   { workspaceId, week },
        orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
      }),
      prisma.eOSMeeting.findFirst({ where: { workspaceId, week } }),
    ])

    res.json({
      members,
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

    const todo = await prisma.eOSTodo.update({ where: { id }, data })
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

// PUT /api/eos/traction/meetings/:week
// body: { date?, rating?, notes? }
async function upsertMeeting(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const { week } = req.params
    const { date, rating, notes } = req.body

    if (!WEEK_RE.test(week)) return res.status(400).json({ error: 'week inválida' })

    const data = {}
    if (date   !== undefined) data.date   = date || null
    if (notes  !== undefined) data.notes  = notes?.trim() || null
    if (rating !== undefined) {
      const r = rating ? Number(rating) : null
      if (r !== null && (r < 1 || r > 10)) {
        return res.status(400).json({ error: 'rating debe ser entre 1 y 10' })
      }
      data.rating = r
    }

    const meeting = await prisma.eOSMeeting.upsert({
      where:  { workspaceId_week: { workspaceId, week } },
      create: { workspaceId, week, ...data },
      update: data,
    })

    res.json(formatMeeting(meeting))
  } catch (err) { next(err) }
}

module.exports = {
  getRocks, createRock, updateRock, deleteRock,
  getWeek, createTodo, updateTodo, deleteTodo,
  upsertMeeting,
}
