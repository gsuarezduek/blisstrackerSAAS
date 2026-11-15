const { resolveCtx } = require('./backlinks.controller')
const service = require('../services/backlinkProspects.service')
const { prospectDomain } = require('../lib/backlinks')

/**
 * Competencia y oportunidades son EL MISMO modelo (`BacklinkProspect`): una
 * oportunidad es un prospecto con veredicto `conseguible` y que todavía no
 * tenemos, y la vista de oportunidades es este mismo endpoint con otro filtro y
 * otro orden.
 *
 * Dos tablas obligaban a copiar la fila al promover, a mantener dos verdades del
 * mismo dominio y a decidir en cuál vive el histórico al conseguir el enlace.
 */

/** GET /api/marketing/projects/:id/backlinks/prospects */
async function list(req, res, next) {
  try {
    const ctx = await resolveCtx(req, res)
    if (!ctx) return
    const { verdict, pipeline, alreadyLinked, competitor, q, page, limit } = req.query
    res.json(await service.listProspects({
      ...ctx, verdict, pipeline, alreadyLinked, competitor, q, page, limit,
    }))
  } catch (err) { next(err) }
}

/**
 * POST /api/marketing/projects/:id/backlinks/prospects
 *
 * Acepta un objeto o un array. `competitorDomain` dice de quién es la evidencia:
 * sin él el prospecto queda cargado sin atribución, que es el caso de "este sitio
 * me lo recomendaron" y no "lo encontré en el perfil de un competidor".
 */
async function create(req, res, next) {
  try {
    const ctx = await resolveCtx(req, res, { write: true })
    if (!ctx) return

    const isBatch = Array.isArray(req.body)
    const payload = isBatch ? req.body : [req.body]
    if (!payload.length) return res.status(400).json({ error: 'No mandaste ningún dominio' })
    if (payload.length > service.MAX_PAGE_SIZE) {
      return res.status(400).json({ error: `Máximo ${service.MAX_PAGE_SIZE} dominios por vez` })
    }

    // El competidor viaja al lado del lote, no por fila: un export es de UN
    // competidor, y repetirlo en cada fila es la forma de que alguna quede mal.
    const competitorDomain = isBatch
      ? prospectDomain(req.query.competitorDomain ?? req.body?.competitorDomain)
      : prospectDomain(req.body?.competitorDomain)

    const result = await service.createProspects({
      ...ctx, items: payload, competitorDomain,
      source: ctx.author.agentId ? 'agent' : 'manual',
    })

    // Un prospecto nuevo tiene que saber en el acto si el dominio ya nos enlaza:
    // sin esto, "Ya lo tenemos" aparecería recién tras la próxima verificación.
    await service.syncOwnershipQuietly(ctx)

    if (!isBatch) {
      if (result.created.length) return res.status(201).json(result.created[0])
      if (result.merged.length)  return res.status(200).json(result.merged[0])
      return res.status(400).json({ error: result.skipped[0]?.reason || 'No se pudo cargar el dominio' })
    }
    res.status(201).json({
      ...result,
      createdCount: result.created.length,
      mergedCount:  result.merged.length,
      skippedCount: result.skipped.length,
    })
  } catch (err) { next(err) }
}

/**
 * PATCH /api/marketing/projects/:id/backlinks/prospects/:pid
 *
 * Mandar `verdict` sella `verdictLockedAt`, y a partir de ahí la clasificación IA
 * no lo vuelve a pisar (lleva el candado en el WHERE de su updateMany, así la
 * corrección es inmune incluso durante una corrida ya empezada). `resetVerdict`
 * libera el candado y devuelve la fila a la cola de la IA.
 */
async function update(req, res, next) {
  try {
    const ctx = await resolveCtx(req, res, { write: true })
    if (!ctx) return
    const prospectId = Number(req.params.pid)
    if (!Number.isInteger(prospectId)) return res.status(400).json({ error: 'Prospecto inválido' })

    const { data, error } = service.buildProspectData(req.body)
    if (error) return res.status(400).json({ error })
    if (!Object.keys(data).length) return res.status(400).json({ error: 'No mandaste ningún cambio' })

    const updated = await service.updateProspect({ ...ctx, prospectId, data })
    if (!updated) return res.status(404).json({ error: 'Prospecto no encontrado' })
    res.json(updated)
  } catch (err) { next(err) }
}

/** DELETE /api/marketing/projects/:id/backlinks/prospects/:pid */
async function remove(req, res, next) {
  try {
    const ctx = await resolveCtx(req, res, { write: true })
    if (!ctx) return
    const prospectId = Number(req.params.pid)
    if (!Number.isInteger(prospectId)) return res.status(400).json({ error: 'Prospecto inválido' })
    const ok = await service.deleteProspect({ ...ctx, prospectId })
    if (!ok) return res.status(404).json({ error: 'Prospecto no encontrado' })
    res.json({ ok: true })
  } catch (err) { next(err) }
}

module.exports = { list, create, update, remove }
