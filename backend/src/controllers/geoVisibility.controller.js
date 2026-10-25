const prisma = require('../lib/prisma')
const { runVisibilityCheck } = require('../services/geoVisibility.service')

// Tope duro de catálogo por proyecto — control de costo "por diseño" (ver
// geoVisibility.service.js): cada corrida llama a claude-sonnet-5 con web_search,
// más caro que el resto de GEO (Haiku, sin búsqueda). v1 es manual on-demand, sin
// cron automático, hasta medir el costo real de una corrida contra un proyecto real.
const MAX_ACTIVE_PROMPTS = 5
const MAX_COMPETITORS    = 4

async function getProjectOrFail(req, res) {
  const workspaceId = req.workspace.id
  const projectId   = Number(req.params.id)
  const project = await prisma.project.findFirst({ where: { id: projectId, workspaceId }, select: { id: true, name: true } })
  if (!project) { res.status(404).json({ error: 'Proyecto no encontrado' }); return null }
  return project
}

// ─── Prompts (catálogo de preguntas a testear) ────────────────────────────────

async function listPrompts(req, res, next) {
  try {
    const project = await getProjectOrFail(req, res)
    if (!project) return

    const prompts = await prisma.geoVisibilityPrompt.findMany({
      where:   { projectId: project.id, workspaceId: req.workspace.id },
      orderBy: { createdAt: 'asc' },
    })
    res.json(prompts)
  } catch (err) { next(err) }
}

async function createPrompt(req, res, next) {
  try {
    const project = await getProjectOrFail(req, res)
    if (!project) return

    const query = (req.body.query || '').trim()
    if (!query) return res.status(400).json({ error: 'query es requerido' })
    if (query.length > 300) return res.status(400).json({ error: 'La pregunta es demasiado larga (máx. 300 caracteres)' })

    const activeCount = await prisma.geoVisibilityPrompt.count({
      where: { projectId: project.id, workspaceId: req.workspace.id, active: true },
    })
    if (activeCount >= MAX_ACTIVE_PROMPTS) {
      return res.status(400).json({ error: `Máximo ${MAX_ACTIVE_PROMPTS} preguntas activas por proyecto. Desactivá o borrá alguna antes de agregar otra.` })
    }

    const prompt = await prisma.geoVisibilityPrompt.create({
      data: { workspaceId: req.workspace.id, projectId: project.id, query },
    })
    res.status(201).json(prompt)
  } catch (err) { next(err) }
}

async function updatePrompt(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const projectId   = Number(req.params.id)
    const promptId    = Number(req.params.promptId)
    const { query, active } = req.body

    const existing = await prisma.geoVisibilityPrompt.findFirst({ where: { id: promptId, projectId, workspaceId } })
    if (!existing) return res.status(404).json({ error: 'Pregunta no encontrada' })

    const data = {}
    if (query !== undefined) {
      const trimmed = (query || '').trim()
      if (!trimmed) return res.status(400).json({ error: 'query no puede quedar vacío' })
      if (trimmed.length > 300) return res.status(400).json({ error: 'La pregunta es demasiado larga (máx. 300 caracteres)' })
      data.query = trimmed
    }
    if (active !== undefined) {
      if (active && !existing.active) {
        const activeCount = await prisma.geoVisibilityPrompt.count({ where: { projectId, workspaceId, active: true } })
        if (activeCount >= MAX_ACTIVE_PROMPTS) {
          return res.status(400).json({ error: `Máximo ${MAX_ACTIVE_PROMPTS} preguntas activas por proyecto. Desactivá otra antes de activar esta.` })
        }
      }
      data.active = !!active
    }

    const updated = await prisma.geoVisibilityPrompt.update({ where: { id: promptId }, data })
    res.json(updated)
  } catch (err) { next(err) }
}

async function deletePrompt(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const projectId   = Number(req.params.id)
    const promptId    = Number(req.params.promptId)

    const existing = await prisma.geoVisibilityPrompt.findFirst({ where: { id: promptId, projectId, workspaceId }, select: { id: true } })
    if (!existing) return res.status(404).json({ error: 'Pregunta no encontrada' })

    await prisma.geoVisibilityPrompt.delete({ where: { id: promptId } })
    res.json({ ok: true })
  } catch (err) { next(err) }
}

// ─── Competidores (catálogo a detectar en las respuestas) ─────────────────────

async function listCompetitors(req, res, next) {
  try {
    const project = await getProjectOrFail(req, res)
    if (!project) return

    const competitors = await prisma.geoVisibilityCompetitor.findMany({
      where:   { projectId: project.id, workspaceId: req.workspace.id },
      orderBy: { createdAt: 'asc' },
    })
    res.json(competitors)
  } catch (err) { next(err) }
}

async function createCompetitor(req, res, next) {
  try {
    const project = await getProjectOrFail(req, res)
    if (!project) return

    const name   = (req.body.name || '').trim()
    const domain = (req.body.domain || '').trim() || null
    if (!name) return res.status(400).json({ error: 'name es requerido' })
    if (name.length > 120) return res.status(400).json({ error: 'El nombre es demasiado largo (máx. 120 caracteres)' })

    const count = await prisma.geoVisibilityCompetitor.count({ where: { projectId: project.id, workspaceId: req.workspace.id } })
    if (count >= MAX_COMPETITORS) {
      return res.status(400).json({ error: `Máximo ${MAX_COMPETITORS} competidores por proyecto. Borrá alguno antes de agregar otro.` })
    }

    const competitor = await prisma.geoVisibilityCompetitor.create({
      data: { workspaceId: req.workspace.id, projectId: project.id, name, domain },
    })
    res.status(201).json(competitor)
  } catch (err) { next(err) }
}

async function deleteCompetitor(req, res, next) {
  try {
    const workspaceId  = req.workspace.id
    const projectId    = Number(req.params.id)
    const competitorId = Number(req.params.competitorId)

    const existing = await prisma.geoVisibilityCompetitor.findFirst({ where: { id: competitorId, projectId, workspaceId }, select: { id: true } })
    if (!existing) return res.status(404).json({ error: 'Competidor no encontrado' })

    await prisma.geoVisibilityCompetitor.delete({ where: { id: competitorId } })
    res.json({ ok: true })
  } catch (err) { next(err) }
}

// ─── Corridas ───────────────────────────────────────────────────────────────

async function runCheck(req, res, next) {
  try {
    const project = await getProjectOrFail(req, res)
    if (!project) return
    const userId = req.user.userId

    const activePrompts = await prisma.geoVisibilityPrompt.count({
      where: { projectId: project.id, workspaceId: req.workspace.id, active: true },
    })
    if (!activePrompts) {
      return res.status(400).json({ error: 'Agregá al menos una pregunta activa antes de probar la visibilidad.' })
    }

    const run = await prisma.geoVisibilityRun.create({
      data: { workspaceId: req.workspace.id, projectId: project.id, status: 'pending' },
    })

    setImmediate(() => runVisibilityCheck(run.id, req.workspace.id, project.id, userId))

    res.status(201).json(run)
  } catch (err) { next(err) }
}

async function listRuns(req, res, next) {
  try {
    const project = await getProjectOrFail(req, res)
    if (!project) return
    const limit = Math.min(Number(req.query.limit) || 10, 50)

    const runs = await prisma.geoVisibilityRun.findMany({
      where:   { projectId: project.id, workspaceId: req.workspace.id },
      orderBy: { createdAt: 'desc' },
      take:    limit,
      include: { _count: { select: { results: true } } },
    })
    res.json(runs)
  } catch (err) { next(err) }
}

async function getRun(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const projectId   = Number(req.params.id)
    const runId       = Number(req.params.runId)

    const run = await prisma.geoVisibilityRun.findFirst({
      where:   { id: runId, projectId, workspaceId },
      include: { results: { include: { prompt: { select: { id: true, query: true } } }, orderBy: { id: 'asc' } } },
    })
    if (!run) return res.status(404).json({ error: 'Corrida no encontrada' })

    const parse = (v) => { try { return JSON.parse(v) } catch { return [] } }
    res.json({
      ...run,
      results: run.results.map(r => ({
        ...r,
        competitorsMentioned: parse(r.competitorsMentioned),
        sources:              parse(r.sources),
      })),
    })
  } catch (err) { next(err) }
}

async function deleteRun(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const projectId   = Number(req.params.id)
    const runId       = Number(req.params.runId)

    const existing = await prisma.geoVisibilityRun.findFirst({ where: { id: runId, projectId, workspaceId }, select: { id: true } })
    if (!existing) return res.status(404).json({ error: 'Corrida no encontrada' })

    await prisma.geoVisibilityRun.delete({ where: { id: runId } })
    res.json({ ok: true })
  } catch (err) { next(err) }
}

module.exports = {
  listPrompts, createPrompt, updatePrompt, deletePrompt,
  listCompetitors, createCompetitor, deleteCompetitor,
  runCheck, listRuns, getRun, deleteRun,
}
