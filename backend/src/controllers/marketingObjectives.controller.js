const prisma = require('../lib/prisma')
const { METRICS, CATEGORIES, PERIODICITIES, AD_PLATFORMS, RRSS_PLATFORMS, metricDef } = require('../lib/objectiveCatalog')
const { computeObjectives } = require('../services/marketingObjectives.service')
const { todayString } = require('../utils/dates')

async function assertProject(req) {
  const projectId = Number(req.params.id)
  const project = await prisma.project.findFirst({
    where: { id: projectId, workspaceId: req.workspace.id }, select: { id: true },
  })
  return project ? projectId : null
}

// Da forma a un objetivo para la respuesta (incluye refs resueltas).
function shape(o) {
  return {
    id:               o.id,
    category:         o.category,
    metric:           o.metric,
    periodicity:      o.periodicity,
    target:           o.target,
    platform:         o.platform,
    trackedKeywordId: o.trackedKeywordId,
    competitorId:     o.competitorId,
    keyword:          o.trackedKeyword?.query ?? null,
    competitor:       o.competitor ? (o.competitor.displayName || `@${o.competitor.username}`) : null,
    createdAt:        o.createdAt,
  }
}

const INCLUDE = {
  trackedKeyword: { select: { id: true, query: true } },
  competitor:     { select: { id: true, username: true, displayName: true } },
}

// Valida el payload de un objetivo. Devuelve { error } o { data } listo para escribir.
async function validatePayload(body, projectId, workspaceId) {
  const { category, metric, periodicity } = body
  if (!CATEGORIES.includes(category))       return { error: 'Categoría inválida' }
  const def = metricDef(metric)
  if (!def || def.category !== category)    return { error: 'Métrica inválida para la categoría' }
  if (!PERIODICITIES.includes(periodicity)) return { error: 'Periodicidad inválida' }

  const data = {
    category, metric, periodicity,
    platform: null, trackedKeywordId: null, competitorId: null,
  }

  // Target: requerido y > 0 salvo "competidores" (que no tiene target numérico)
  if (metric === 'competidores') {
    data.target = 0
  } else {
    const target = Number(body.target)
    if (!Number.isFinite(target) || target <= 0) return { error: 'El objetivo (target) debe ser un número mayor a 0' }
    data.target = target
  }

  // Params requeridos según métrica
  if (def.param === 'platform') {
    if (!AD_PLATFORMS.includes(body.platform)) return { error: 'Plataforma inválida (meta_ads | google_ads)' }
    data.platform = body.platform
  }
  // RRSS: plataforma opcional (instagram | tiktok | linkedin). Vacío = todas las redes.
  if (def.rrssPlatform && body.platform) {
    if (!RRSS_PLATFORMS.includes(body.platform)) return { error: 'Red inválida (instagram | tiktok | linkedin)' }
    data.platform = body.platform
  }
  if (def.param === 'trackedKeywordId') {
    const kwId = Number(body.trackedKeywordId)
    if (!Number.isInteger(kwId)) return { error: 'Falta la keyword (trackedKeywordId)' }
    const kw = await prisma.trackedKeyword.findFirst({ where: { id: kwId, projectId, workspaceId }, select: { id: true } })
    if (!kw) return { error: 'La keyword no existe o no pertenece a este proyecto' }
    data.trackedKeywordId = kwId
  }
  if (def.param === 'competitorId') {
    const cId = Number(body.competitorId)
    if (!Number.isInteger(cId)) return { error: 'Falta el competidor (competitorId)' }
    const comp = await prisma.competitorAccount.findFirst({ where: { id: cId, projectId }, select: { id: true } })
    if (!comp) return { error: 'El competidor no existe o no pertenece a este proyecto' }
    data.competitorId = cId
  }

  return { data }
}

/** GET /api/marketing/projects/:id/objectives */
async function listObjectives(req, res, next) {
  try {
    const projectId = await assertProject(req)
    if (!projectId) return res.status(404).json({ error: 'Proyecto no encontrado' })

    const objectives = await prisma.marketingObjective.findMany({
      where:   { projectId, workspaceId: req.workspace.id },
      include: INCLUDE,
      orderBy: { createdAt: 'asc' },
    })
    res.json({ objectives: objectives.map(shape) })
  } catch (err) { next(err) }
}

/** POST /api/marketing/projects/:id/objectives */
async function createObjective(req, res, next) {
  try {
    const projectId = await assertProject(req)
    if (!projectId) return res.status(404).json({ error: 'Proyecto no encontrado' })

    const { error, data } = await validatePayload(req.body, projectId, req.workspace.id)
    if (error) return res.status(400).json({ error })

    const created = await prisma.marketingObjective.create({
      data: { ...data, projectId, workspaceId: req.workspace.id },
      include: INCLUDE,
    })
    res.status(201).json({ objective: shape(created) })
  } catch (err) { next(err) }
}

/** PATCH /api/marketing/projects/:id/objectives/:oid */
async function updateObjective(req, res, next) {
  try {
    const projectId = await assertProject(req)
    if (!projectId) return res.status(404).json({ error: 'Proyecto no encontrado' })
    const oid = Number(req.params.oid)

    const existing = await prisma.marketingObjective.findFirst({
      where: { id: oid, projectId, workspaceId: req.workspace.id }, select: { id: true },
    })
    if (!existing) return res.status(404).json({ error: 'Objetivo no encontrado' })

    const { error, data } = await validatePayload(req.body, projectId, req.workspace.id)
    if (error) return res.status(400).json({ error })

    const updated = await prisma.marketingObjective.update({
      where: { id: oid }, data, include: INCLUDE,
    })
    res.json({ objective: shape(updated) })
  } catch (err) { next(err) }
}

/**
 * GET /api/marketing/projects/:id/objectives/progress?month=YYYY-MM
 * Progreso calculado de los objetivos del proyecto contra los datos reales.
 * No persiste — recalcula en cada request. `month` por defecto = mes actual (ART).
 */
async function getObjectivesProgress(req, res, next) {
  try {
    const projectId = await assertProject(req)
    if (!projectId) return res.status(404).json({ error: 'Proyecto no encontrado' })

    const month = /^\d{4}-\d{2}$/.test(req.query.month || '')
      ? req.query.month
      : todayString().slice(0, 7)

    const objectives = await computeObjectives({ projectId, workspaceId: req.workspace.id, dataMonth: month })
    res.json({ month, objectives })
  } catch (err) { next(err) }
}

/** DELETE /api/marketing/projects/:id/objectives/:oid */
async function deleteObjective(req, res, next) {
  try {
    const projectId = await assertProject(req)
    if (!projectId) return res.status(404).json({ error: 'Proyecto no encontrado' })
    const oid = Number(req.params.oid)

    const r = await prisma.marketingObjective.deleteMany({
      where: { id: oid, projectId, workspaceId: req.workspace.id },
    })
    if (r.count === 0) return res.status(404).json({ error: 'Objetivo no encontrado' })
    res.json({ ok: true })
  } catch (err) { next(err) }
}

module.exports = { listObjectives, createObjective, updateObjective, deleteObjective, getObjectivesProgress }
