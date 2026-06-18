const prisma = require('../lib/prisma')
const { EOS_AUTO_METRICS, EOS_AUTO_KEYS, isAutoKey, autoCatalogList } = require('../lib/eosAutoMetricCatalog')
const { computeAutoScorecardYear } = require('../services/eosAutoScorecard.service')

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

    const [members, metrics, entries] = await Promise.all([
      prisma.workspaceMember.findMany({
        where:   { workspaceId, active: true },
        include: { user: { select: { id: true, name: true, avatar: true } } },
        orderBy: { user: { name: 'asc' } },
        // role incluido para que el frontend filtre el select a admins/owners
      }),
      prisma.scorecardMetric.findMany({
        where:   { workspaceId },
        orderBy: [{ frequency: 'asc' }, { order: 'asc' }],
      }),
      prisma.scorecardEntry.findMany({
        where:   { workspaceId },
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
        role:   m.role,
      })),
      metrics: metrics.map(formatMetric),
      entriesMap,
      // Catálogo de datos automáticos + cuáles ya están agregados (para el menú "+ Dato automático").
      autoCatalog: autoCatalogList().map(c => ({
        ...c,
        added: metrics.some(m => m.autoKey === c.key),
      })),
    })
  } catch (err) { next(err) }
}

// ─── GET /api/eos/scorecard/auto?year=YYYY ────────────────────────────────────
// Valores calculados (no persistidos) de las métricas automáticas del workspace,
// por semana ISO del año pedido. Devuelve { [autoKey]: { 'YYYY-Www': { value, top3 } } }.

async function getAutoScorecard(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const tz = req.workspace.timezone || 'America/Argentina/Buenos_Aires'
    const year = Number(req.query.year)
    if (!Number.isInteger(year) || year < 2000 || year > 3000) {
      return res.status(400).json({ error: 'year inválido' })
    }

    const autoMetrics = await prisma.scorecardMetric.findMany({
      where: { workspaceId, autoKey: { not: null } },
      select: { autoKey: true },
    })
    const autoKeys = autoMetrics.map(m => m.autoKey).filter(isAutoKey)

    const data = autoKeys.length
      ? await computeAutoScorecardYear(workspaceId, tz, year, autoKeys)
      : {}

    res.json({ year, data })
  } catch (err) { next(err) }
}

// ─── POST /api/eos/scorecard ──────────────────────────────────────────────────
// body: { name, ownerId?, goal?, unit?, frequency }

async function createMetric(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const { name, ownerId, goal, lowerIsBetter, unit, frequency, autoKey } = req.body

    const count = await prisma.scorecardMetric.count({ where: { workspaceId } })

    // ── Métrica automática: name/unit/lowerIsBetter/frequency salen del catálogo.
    if (autoKey != null) {
      if (!isAutoKey(autoKey)) return res.status(400).json({ error: 'Dato automático desconocido' })
      const exists = await prisma.scorecardMetric.findFirst({ where: { workspaceId, autoKey } })
      if (exists) return res.status(409).json({ error: 'Ese dato automático ya está agregado' })

      const cat = EOS_AUTO_METRICS[autoKey]
      const metric = await prisma.scorecardMetric.create({
        data: {
          workspaceId,
          autoKey,
          name:          cat.name,
          ownerId:       null,
          goal:          goal != null && goal !== '' ? Number(goal) : null,
          lowerIsBetter: cat.lowerIsBetter,
          unit:          cat.unit,
          frequency:     cat.frequency,
          order:         count,
        },
      })
      return res.status(201).json(formatMetric(metric))
    }

    // ── Métrica manual.
    if (!name?.trim()) return res.status(400).json({ error: 'name es requerido' })
    if (!['weekly', 'monthly'].includes(frequency)) {
      return res.status(400).json({ error: 'frequency debe ser weekly o monthly' })
    }

    const metric = await prisma.scorecardMetric.create({
      data: {
        workspaceId,
        name:          name.trim().slice(0, 200),
        ownerId:       ownerId   ? Number(ownerId)     : null,
        goal:          goal      != null ? Number(goal) : null,
        lowerIsBetter: Boolean(lowerIsBetter),
        unit:          unit?.trim().slice(0, 20) || null,
        frequency:     frequency,
        order:         count,
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
    const { name, ownerId, goal, lowerIsBetter, unit, frequency, order } = req.body

    const existing = await prisma.scorecardMetric.findFirst({ where: { id, workspaceId } })
    if (!existing) return res.status(404).json({ error: 'Métrica no encontrada' })

    if (frequency && !['weekly', 'monthly'].includes(frequency)) {
      return res.status(400).json({ error: 'frequency debe ser weekly o monthly' })
    }

    const isAuto = existing.autoKey != null
    const data = {}
    // En automáticas, name/unit/lowerIsBetter/frequency vienen fijos del catálogo: solo meta y orden.
    if (!isAuto && name          !== undefined) data.name          = name.trim().slice(0, 200)
    if (!isAuto && ownerId       !== undefined) data.ownerId       = ownerId ? Number(ownerId) : null
    if (goal          !== undefined) data.goal          = goal != null && goal !== '' ? Number(goal) : null
    if (!isAuto && lowerIsBetter !== undefined) data.lowerIsBetter = Boolean(lowerIsBetter)
    if (!isAuto && unit          !== undefined) data.unit          = unit?.trim().slice(0, 20) || null
    if (!isAuto && frequency     !== undefined) data.frequency     = frequency
    if (order         !== undefined) data.order         = Number(order)

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
    if (metric.autoKey) return res.status(400).json({ error: 'Esta métrica es automática: sus valores los calcula el sistema, no se cargan a mano' })

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
    id:            m.id,
    name:          m.name,
    ownerId:       m.ownerId,
    goal:          m.goal,
    lowerIsBetter: m.lowerIsBetter,
    unit:          m.unit,
    frequency:     m.frequency,
    autoKey:       m.autoKey ?? null,
    order:         m.order,
  }
}

module.exports = { getScorecard, getAutoScorecard, createMetric, updateMetric, deleteMetric, upsertEntry }
