const prisma = require('../lib/prisma')
const { runPageSpeedAnalysis } = require('../services/pageSpeed.service')

const VALID_STRATEGIES = new Set(['mobile', 'desktop'])

async function verifyProject(projectId, workspaceId) {
  return prisma.project.findFirst({
    where:  { id: projectId, workspaceId },
    select: { id: true, websiteUrl: true },
  })
}

/**
 * POST /api/marketing/projects/:id/pagespeed
 * Body: { strategy: 'mobile' | 'desktop' }
 * Inicia el análisis async. Devuelve { resultId } inmediatamente.
 */
async function runAnalysis(req, res) {
  const projectId = Number(req.params.id)
  const strategy  = VALID_STRATEGIES.has(req.body?.strategy) ? req.body.strategy : 'mobile'

  const project = await verifyProject(projectId, req.workspace.id)
  if (!project) return res.status(404).json({ error: 'Proyecto no encontrado' })
  if (!project.websiteUrl) return res.status(400).json({ error: 'El proyecto no tiene URL configurada. Agregala en la tab Info.' })

  // PageSpeed requiere URL con protocolo
  const url = /^https?:\/\//i.test(project.websiteUrl)
    ? project.websiteUrl
    : `https://${project.websiteUrl}`

  const record = await prisma.pageSpeedResult.create({
    data: { workspaceId: req.workspace.id, projectId, url, strategy, status: 'running' },
  })

  res.json({ resultId: record.id })

  // Análisis async — no bloquea la respuesta
  setImmediate(async () => {
    try {
      const result = await runPageSpeedAnalysis(url, strategy)
      await prisma.pageSpeedResult.update({
        where: { id: record.id },
        data: {
          status:           'done',
          performanceScore: result.performanceScore,
          metrics:          JSON.stringify(result.metrics),
          opportunities:    JSON.stringify(result.opportunities),
          diagnostics:      JSON.stringify(result.diagnostics),
        },
      })
    } catch (err) {
      console.error('[PageSpeed] Error en análisis:', err.message)
      await prisma.pageSpeedResult.update({
        where: { id: record.id },
        data:  { status: 'error', errorMsg: err.message },
      }).catch(() => {})
    }
  })
}

/**
 * GET /api/marketing/projects/:id/pagespeed/:resultId
 * Devuelve el estado y resultado de un análisis.
 */
async function getResult(req, res) {
  const projectId = Number(req.params.id)
  const resultId  = Number(req.params.resultId)

  const project = await verifyProject(projectId, req.workspace.id)
  if (!project) return res.status(404).json({ error: 'Proyecto no encontrado' })

  const result = await prisma.pageSpeedResult.findFirst({
    where: { id: resultId, projectId },
  })
  if (!result) return res.status(404).json({ error: 'Resultado no encontrado' })

  res.json(parseResult(result))
}

/**
 * GET /api/marketing/projects/:id/pagespeed?strategy=mobile&limit=5
 * Lista los últimos análisis de un proyecto (para historial de scores).
 */
async function listResults(req, res) {
  const projectId = Number(req.params.id)
  const strategy  = VALID_STRATEGIES.has(req.query.strategy) ? req.query.strategy : 'mobile'
  const limit     = Math.min(Number(req.query.limit) || 10, 20)

  const project = await verifyProject(projectId, req.workspace.id)
  if (!project) return res.status(404).json({ error: 'Proyecto no encontrado' })

  const results = await prisma.pageSpeedResult.findMany({
    where:   { projectId, strategy, status: 'done' },
    orderBy: { createdAt: 'desc' },
    take:    limit,
    select:  { id: true, performanceScore: true, strategy: true, createdAt: true, url: true },
  })

  res.json(results)
}

// ─── Helper: parsear campos JSON del registro ─────────────────────────────────

function parseResult(record) {
  return {
    ...record,
    metrics:       tryParse(record.metrics,       {}),
    opportunities: tryParse(record.opportunities, []),
    diagnostics:   tryParse(record.diagnostics,   []),
  }
}

function tryParse(str, fallback) {
  try { return JSON.parse(str) } catch { return fallback }
}

module.exports = { runAnalysis, getResult, listResults }
