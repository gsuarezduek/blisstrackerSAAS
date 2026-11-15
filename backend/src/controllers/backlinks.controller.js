const prisma = require('../lib/prisma')
const { canWrite } = require('../lib/projectAccess')
const { requestAgentId, requestAgentName } = require('./tasks/_shared')
const service = require('../services/backlinks.service')
const verifier = require('../services/backlinkVerifier.service')

/**
 * Preámbulo de todo handler: resuelve el proyecto dentro del workspace y, si la
 * operación escribe, valida el permiso. Devuelve null habiendo respondido ya
 * (el caller hace `if (!ctx) return`). Mismo patrón que content/_shared#resolveCtx.
 *
 * El gate de "este proyecto tiene Marketing apagado" NO se chequea acá: lo
 * resuelve `requireProjectModulePrefix('marketing')` en marketing.routes.js, en la
 * misma query que la privacidad.
 */
async function resolveCtx(req, res, { write = false } = {}) {
  const workspaceId = req.workspace.id
  const id = Number(req.params.id)
  const project = Number.isInteger(id) && id > 0
    ? await prisma.project.findFirst({ where: { id, workspaceId }, select: { id: true, websiteUrl: true } })
    : null
  if (!project) {
    res.status(404).json({ error: 'Proyecto no encontrado' })
    return null
  }
  if (write && !(await canWrite(req, project.id))) {
    res.status(403).json({ error: 'No tenés permiso para editar los enlaces de este proyecto' })
    return null
  }
  return {
    workspaceId,
    projectId: project.id,
    websiteUrl: project.websiteUrl,
    author: {
      userId:    req.user.userId,
      agentId:   requestAgentId(req),
      agentName: requestAgentName(req),
    },
  }
}

/** GET /api/marketing/projects/:id/backlinks */
async function list(req, res, next) {
  try {
    const ctx = await resolveCtx(req, res)
    if (!ctx) return
    const { status, domain, source, q, page, limit } = req.query
    res.json(await service.listBacklinks({ ...ctx, status, domain, source, q, page, limit }))
  } catch (err) { next(err) }
}

/**
 * POST /api/marketing/projects/:id/backlinks
 * Acepta un objeto o un array: un agente que leyó 20 enlaces en Ahrefs los carga
 * en una sola llamada en vez de 20.
 */
async function create(req, res, next) {
  try {
    const ctx = await resolveCtx(req, res, { write: true })
    if (!ctx) return

    const payload = Array.isArray(req.body) ? req.body : [req.body]
    if (!payload.length) return res.status(400).json({ error: 'No mandaste ningún enlace' })
    if (payload.length > service.MAX_PAGE_SIZE) {
      return res.status(400).json({ error: `Máximo ${service.MAX_PAGE_SIZE} enlaces por vez` })
    }

    const created = []
    const skipped = []
    for (const item of payload) {
      const { data, error } = service.buildLinkData(item, { isCreate: true })
      if (error) { skipped.push({ sourceUrl: item?.sourceUrl ?? null, reason: error }); continue }
      try {
        created.push(await service.createBacklink({
          ...ctx, data, source: ctx.author.agentId ? 'agent' : 'manual',
        }))
      } catch (err) {
        // P2002 = ya estaba cargado. En una carga de a uno es un 409 explícito;
        // en un lote es una fila salteada, porque frenar el lote entero por un
        // duplicado obligaría al agente a reintentar todo.
        if (err.code === 'P2002') skipped.push({ sourceUrl: data.sourceUrl, reason: 'ya_cargado' })
        else throw err
      }
    }

    if (!Array.isArray(req.body)) {
      if (created.length) return res.status(201).json(created[0])
      const only = skipped[0]
      const code = only?.reason === 'ya_cargado' ? 409 : 400
      return res.status(code).json({
        error: only?.reason === 'ya_cargado' ? 'Ese enlace ya está cargado en este proyecto' : only?.reason,
        code:  only?.reason === 'ya_cargado' ? 'ALREADY_EXISTS' : undefined,
      })
    }
    res.status(201).json({ created, skipped, createdCount: created.length, skippedCount: skipped.length })
  } catch (err) { next(err) }
}

/** PATCH /api/marketing/projects/:id/backlinks/:blId */
async function update(req, res, next) {
  try {
    const ctx = await resolveCtx(req, res, { write: true })
    if (!ctx) return
    const backlinkId = Number(req.params.blId)
    if (!Number.isInteger(backlinkId)) return res.status(400).json({ error: 'Enlace inválido' })

    const { data, error } = service.buildLinkData(req.body)
    if (error) return res.status(400).json({ error })
    if (!Object.keys(data).length) return res.status(400).json({ error: 'No mandaste ningún cambio' })

    const updated = await service.updateBacklink({ ...ctx, backlinkId, data })
    if (!updated) return res.status(404).json({ error: 'Enlace no encontrado' })
    res.json(updated)
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'Ya hay otro enlace cargado con esa URL', code: 'ALREADY_EXISTS' })
    next(err)
  }
}

/** DELETE /api/marketing/projects/:id/backlinks/:blId */
async function remove(req, res, next) {
  try {
    const ctx = await resolveCtx(req, res, { write: true })
    if (!ctx) return
    const backlinkId = Number(req.params.blId)
    if (!Number.isInteger(backlinkId)) return res.status(400).json({ error: 'Enlace inválido' })
    const ok = await service.deleteBacklink({ ...ctx, backlinkId })
    if (!ok) return res.status(404).json({ error: 'Enlace no encontrado' })
    res.json({ ok: true })
  } catch (err) { next(err) }
}

/** GET /api/marketing/projects/:id/backlinks/:blId/checks */
async function listChecks(req, res, next) {
  try {
    const ctx = await resolveCtx(req, res)
    if (!ctx) return
    const backlinkId = Number(req.params.blId)
    if (!Number.isInteger(backlinkId)) return res.status(400).json({ error: 'Enlace inválido' })
    const checks = await service.listChecks({ ...ctx, backlinkId, limit: req.query.limit })
    if (!checks) return res.status(404).json({ error: 'Enlace no encontrado' })
    res.json(checks)
  } catch (err) { next(err) }
}

/** GET /api/marketing/projects/:id/backlinks/profile */
async function getProfile(req, res, next) {
  try {
    const ctx = await resolveCtx(req, res)
    if (!ctx) return
    res.json(await service.getProfile(ctx))
  } catch (err) { next(err) }
}

/** POST /api/marketing/projects/:id/backlinks/profile/readings */
async function createReading(req, res, next) {
  try {
    const ctx = await resolveCtx(req, res, { write: true })
    if (!ctx) return
    const { reportedDomains, reportedLinks, reportedSource, notes } = req.body || {}
    if (reportedDomains == null && reportedLinks == null) {
      return res.status(400).json({ error: 'Cargá al menos los dominios de referencia o el total de enlaces' })
    }
    const reading = await service.recordProfileReading({
      ...ctx,
      reported: { reportedDomains, reportedLinks, reportedSource },
      source:   ctx.author.agentId ? 'agent' : 'manual',
      notes:    typeof notes === 'string' ? notes.trim().slice(0, 1000) || null : null,
    })
    res.status(201).json(reading)
  } catch (err) { next(err) }
}

/**
 * POST /api/marketing/projects/:id/backlinks/verify
 *
 * Async: crea el job, responde 201 con el id y el frontend poll-ea. Los motivos
 * de rechazo son distintos a propósito: 429 con los minutos que faltan (el
 * cooldown de 6h, que existe porque esto hace tráfico a sitios de terceros con
 * nuestro nombre) vs 409 si ya está corriendo.
 */
async function runVerify(req, res, next) {
  try {
    const ctx = await resolveCtx(req, res, { write: true })
    if (!ctx) return
    if (!ctx.websiteUrl) {
      return res.status(400).json({
        error: 'Este proyecto no tiene una URL configurada, así que no se puede saber qué enlace apunta a él.',
        code:  'NO_SITE_URL',
      })
    }

    const result = await verifier.startVerification({
      projectId:   ctx.projectId,
      workspaceId: ctx.workspaceId,
      force:       req.body?.force === true,
    })

    if (result.skipped) {
      if (result.reason === 'running')  return res.status(409).json({ error: 'Ya hay una verificación corriendo.', code: 'ALREADY_RUNNING', jobId: result.jobId })
      if (result.reason === 'cooldown') return res.status(429).json({ error: `La última verificación fue hace poco. Probá de nuevo en ${result.waitMinutes} min.`, code: 'COOLDOWN', waitMinutes: result.waitMinutes })
      return res.status(400).json({ error: 'No hay enlaces para verificar todavía.', code: 'NO_LINKS' })
    }
    res.status(201).json({ jobId: result.jobId, status: 'pending' })
  } catch (err) { next(err) }
}

/** GET /api/marketing/projects/:id/backlinks/jobs — el último de cada tipo. */
async function listJobs(req, res, next) {
  try {
    const ctx = await resolveCtx(req, res)
    if (!ctx) return
    const jobs = await prisma.backlinkJob.findMany({
      where:   { projectId: ctx.projectId },
      orderBy: { createdAt: 'desc' },
      take:    10,
    })
    res.json(jobs)
  } catch (err) { next(err) }
}

/** GET /api/marketing/projects/:id/backlinks/jobs/:jobId — polling. */
async function getJob(req, res, next) {
  try {
    const ctx = await resolveCtx(req, res)
    if (!ctx) return
    const jobId = Number(req.params.jobId)
    if (!Number.isInteger(jobId)) return res.status(400).json({ error: 'Job inválido' })
    const job = await prisma.backlinkJob.findFirst({ where: { id: jobId, projectId: ctx.projectId } })
    if (!job) return res.status(404).json({ error: 'Job no encontrado' })
    res.json(job)
  } catch (err) { next(err) }
}

module.exports = { list, create, update, remove, listChecks, getProfile, createReading, runVerify, listJobs, getJob, resolveCtx }
