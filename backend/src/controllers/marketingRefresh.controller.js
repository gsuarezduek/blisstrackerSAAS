const prisma = require('../lib/prisma')
const { canWrite } = require('../lib/projectAccess')
const { ALL_SOURCES, runRefreshJob } = require('../services/marketingRefresh.service')

/**
 * POST /api/marketing/refresh
 * Body: { projectId?: number, sources?: string[] }
 * Dispara un refresco masivo (async, mismo patrón que GeoAudit) de las fuentes
 * de Marketing — un proyecto puntual o todos los activos del workspace; una
 * lista de fuentes o, sin ella, las que cada proyecto tenga conectadas.
 */
async function startRefresh(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const { projectId, sources } = req.body || {}

    let pid = null
    if (projectId !== undefined && projectId !== null && projectId !== '') {
      pid = Number(projectId)
      const project = await prisma.project.findFirst({
        where:  { id: pid, workspaceId, active: true },
        select: { id: true, isPrivate: true },
      })
      if (!project) return res.status(404).json({ error: 'Proyecto no encontrado' })
      if (project.isPrivate && !(await canWrite(req, pid))) {
        return res.status(403).json({ error: 'Este proyecto es privado: no formás parte del equipo', code: 'PROJECT_PRIVATE' })
      }
    }

    const validSources = Array.isArray(sources) ? sources.filter(s => ALL_SOURCES.includes(s)) : []
    if (Array.isArray(sources) && validSources.length !== sources.length) {
      const invalid = sources.filter(s => !ALL_SOURCES.includes(s))
      return res.status(400).json({ error: `Fuente(s) inválida(s): ${invalid.join(', ')}. Válidas: ${ALL_SOURCES.join(', ')}` })
    }

    const job = await prisma.marketingRefreshJob.create({
      data: {
        workspaceId,
        projectId: pid,
        sources: JSON.stringify(validSources),
        requestedByUserId: req.user.userId,
      },
    })

    setImmediate(() => runRefreshJob(job.id).catch(err => console.error('[MarketingRefresh] Job falló:', err.message)))

    res.status(202).json({ jobId: job.id, status: 'running' })
  } catch (err) { next(err) }
}

/**
 * GET /api/marketing/refresh/:jobId
 * Polling del job: estado + resultados acumulados hasta el momento (por
 * proyecto × fuente) + un resumen de conteos.
 */
async function getRefreshStatus(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const id = Number(req.params.jobId)
    const job = await prisma.marketingRefreshJob.findFirst({ where: { id, workspaceId } })
    if (!job) return res.status(404).json({ error: 'Job no encontrado' })

    const results = JSON.parse(job.results || '[]')
    res.json({
      jobId:      job.id,
      status:     job.status,
      startedAt:  job.startedAt,
      finishedAt: job.finishedAt,
      errorMsg:   job.errorMsg,
      summary: {
        total:        results.length,
        ok:           results.filter(r => r.status === 'ok').length,
        error:        results.filter(r => r.status === 'error').length,
        notConnected: results.filter(r => r.status === 'not_connected').length,
        cooldown:     results.filter(r => r.status === 'cooldown').length,
      },
      results,
    })
  } catch (err) { next(err) }
}

module.exports = { startRefresh, getRefreshStatus }
