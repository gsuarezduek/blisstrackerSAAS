const prisma = require('../lib/prisma')

// ─── Helpers de períodos ──────────────────────────────────────────────────────

function getISOWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const week = Math.ceil((((d - yearStart) / 86400000) + 1) / 7)
  return [d.getUTCFullYear(), week]
}

function weekPeriod(date) {
  const [year, week] = getISOWeek(date)
  return `${year}-W${String(week).padStart(2, '0')}`
}

function lastNWeekPeriods(n) {
  const now = new Date()
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(now)
    d.setDate(d.getDate() - (n - 1 - i) * 7)
    return weekPeriod(d)
  })
}

function lastNMonthPeriods(n) {
  const now = new Date()
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (n - 1 - i), 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
}

function isValidPeriod(p) {
  return /^\d{4}-W\d{2}$/.test(p) || /^\d{4}-\d{2}$/.test(p)
}

// ─── GET /api/eos/scorecard ───────────────────────────────────────────────────
// Devuelve métricas + entradas de los últimos 13 semanas / 12 meses + miembros

async function getScorecard(req, res, next) {
  try {
    const workspaceId = req.workspace.id

    const relevantPeriods = [...lastNWeekPeriods(13), ...lastNMonthPeriods(12)]

    const [members, metrics, entries] = await Promise.all([
      prisma.workspaceMember.findMany({
        where:   { workspaceId, active: true },
        include: { user: { select: { id: true, name: true, avatar: true } } },
        orderBy: { user: { name: 'asc' } },
      }),
      prisma.scorecardMetric.findMany({
        where:   { workspaceId },
        orderBy: [{ frequency: 'asc' }, { order: 'asc' }],
      }),
      prisma.scorecardEntry.findMany({
        where:   { workspaceId, period: { in: relevantPeriods } },
        orderBy: { period: 'asc' },
      }),
    ])

    // Entries indexadas: { [metricId]: { [period]: value } }
    const entriesMap = {}
    for (const e of entries) {
      if (!entriesMap[e.metricId]) entriesMap[e.metricId] = {}
      entriesMap[e.metricId][e.period] = e.value
    }

    res.json({
      members: members.map(m => ({
        id:     m.user.id,
        name:   m.user.name,
        avatar: m.user.avatar,
      })),
      metrics: metrics.map(m => ({
        id:        m.id,
        name:      m.name,
        ownerId:   m.ownerId,
        goal:      m.goal,
        unit:      m.unit,
        frequency: m.frequency,
        order:     m.order,
      })),
      entriesMap,
    })
  } catch (err) { next(err) }
}

// ─── POST /api/eos/scorecard ──────────────────────────────────────────────────
// body: { name, ownerId?, goal?, unit?, frequency }

async function createMetric(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const { name, ownerId, goal, unit, frequency } = req.body

    if (!name?.trim()) return res.status(400).json({ error: 'name es requerido' })
    if (!['weekly', 'monthly'].includes(frequency)) {
      return res.status(400).json({ error: 'frequency debe ser weekly o monthly' })
    }

    const count = await prisma.scorecardMetric.count({ where: { workspaceId } })

    const metric = await prisma.scorecardMetric.create({
      data: {
        workspaceId,
        name:      name.trim().slice(0, 200),
        ownerId:   ownerId   ? Number(ownerId)     : null,
        goal:      goal      != null ? Number(goal) : null,
        unit:      unit?.trim().slice(0, 20) || null,
        frequency: frequency,
        order:     count,
      },
    })

    res.status(201).json(formatMetric(metric))
  } catch (err) { next(err) }
}

// ─── PATCH /api/eos/scorecard/:id ────────────────────────────────────────────
// body: { name?, ownerId?, goal?, unit?, frequency?, order? }

async function updateMetric(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const id = Number(req.params.id)
    const { name, ownerId, goal, unit, frequency, order } = req.body

    const existing = await prisma.scorecardMetric.findFirst({ where: { id, workspaceId } })
    if (!existing) return res.status(404).json({ error: 'Métrica no encontrada' })

    if (frequency && !['weekly', 'monthly'].includes(frequency)) {
      return res.status(400).json({ error: 'frequency debe ser weekly o monthly' })
    }

    const data = {}
    if (name      !== undefined) data.name      = name.trim().slice(0, 200)
    if (ownerId   !== undefined) data.ownerId   = ownerId ? Number(ownerId) : null
    if (goal      !== undefined) data.goal      = goal != null ? Number(goal) : null
    if (unit      !== undefined) data.unit      = unit?.trim().slice(0, 20) || null
    if (frequency !== undefined) data.frequency = frequency
    if (order     !== undefined) data.order     = Number(order)

    const metric = await prisma.scorecardMetric.update({ where: { id }, data })
    res.json(formatMetric(metric))
  } catch (err) { next(err) }
}

// ─── DELETE /api/eos/scorecard/:id ───────────────────────────────────────────

async function deleteMetric(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const id = Number(req.params.id)

    const existing = await prisma.scorecardMetric.findFirst({ where: { id, workspaceId } })
    if (!existing) return res.status(404).json({ error: 'Métrica no encontrada' })

    await prisma.scorecardMetric.delete({ where: { id } })
    res.json({ deleted: true })
  } catch (err) { next(err) }
}

// ─── PUT /api/eos/scorecard/:id/entries/:period ───────────────────────────────
// body: { value: number | null }   null = borrar

async function upsertEntry(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const id     = Number(req.params.id)
    const period = req.params.period

    if (!isValidPeriod(period)) {
      return res.status(400).json({ error: 'Formato de período inválido. Usar YYYY-Www o YYYY-MM' })
    }

    const metric = await prisma.scorecardMetric.findFirst({ where: { id, workspaceId } })
    if (!metric) return res.status(404).json({ error: 'Métrica no encontrada' })

    const { value } = req.body

    if (value === null || value === undefined || value === '') {
      await prisma.scorecardEntry.deleteMany({ where: { metricId: id, period } })
      return res.json({ deleted: true })
    }

    const numValue = Number(value)
    if (isNaN(numValue)) return res.status(400).json({ error: 'value debe ser un número' })

    const entry = await prisma.scorecardEntry.upsert({
      where:  { metricId_period: { metricId: id, period } },
      update: { value: numValue },
      create: { metricId: id, workspaceId, period, value: numValue },
    })

    res.json({ metricId: entry.metricId, period: entry.period, value: entry.value })
  } catch (err) { next(err) }
}

// ─── Utility ──────────────────────────────────────────────────────────────────

function formatMetric(m) {
  return {
    id:        m.id,
    name:      m.name,
    ownerId:   m.ownerId,
    goal:      m.goal,
    unit:      m.unit,
    frequency: m.frequency,
    order:     m.order,
  }
}

module.exports = { getScorecard, createMetric, updateMetric, deleteMetric, upsertEntry }
