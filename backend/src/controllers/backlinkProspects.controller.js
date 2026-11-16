const { resolveCtx } = require('./backlinks.controller')
const service = require('../services/backlinkProspects.service')
const classifier = require('../services/backlinkClassifier.service')
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
    const { verdict, pipeline, alreadyLinked, competitor, q, view, page, limit } = req.query
    res.json(await service.listProspects({
      ...ctx, verdict, pipeline, alreadyLinked, competitor, q, view, page, limit,
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
    // El servicio valida contra el workspace lo que el schema no puede (que la
    // tarea vinculada sea de acá), así que puede devolver un motivo en vez de la fila.
    if (updated.error) return res.status(400).json({ error: updated.error })
    res.json(updated)
  } catch (err) { next(err) }
}

/**
 * POST /api/marketing/projects/:id/backlinks/prospects/classify
 *
 * Async igual que el verificador: crea el job, responde 201 con el id y el
 * frontend poll-ea el mismo endpoint de jobs.
 *
 * **Consume tokens del workspace**, así que lo dispara siempre una persona o un
 * agente: nunca entra al cron. No tiene cooldown por tiempo (el del verificador
 * existe porque hace tráfico a sitios de terceros; acá lo que se gasta es
 * presupuesto propio, que ya tiene su gate) — sólo se impide que corran dos a la
 * vez sobre el mismo proyecto.
 *
 * `rerun: true` le pide rehacer SU PROPIA opinión anterior; lo corregido a mano
 * queda afuera igual, porque el candado va en el where de los candidatos Y en el
 * de la escritura.
 */
async function classify(req, res, next) {
  try {
    const ctx = await resolveCtx(req, res, { write: true })
    if (!ctx) return

    const result = await classifier.startClassification({
      projectId:   ctx.projectId,
      workspaceId: ctx.workspaceId,
      rerun:       req.body?.rerun === true,
    })

    if (result.skipped) {
      if (result.reason === 'running') {
        return res.status(409).json({ error: 'Ya hay una clasificación corriendo.', code: 'ALREADY_RUNNING', jobId: result.jobId })
      }
      return res.status(400).json({
        error: req.body?.rerun === true
          ? 'No hay dominios para evaluar: los que quedan están corregidos a mano o ya los tenemos.'
          : 'No hay dominios sin evaluar.',
        code: 'NO_PROSPECTS',
      })
    }
    res.status(201).json({ jobId: result.jobId, status: 'pending', pending: result.pending })
  } catch (err) { next(err) }
}

/**
 * POST /api/marketing/projects/:id/backlinks/prospects/:pid/promote
 *
 * Cierra la oportunidad: nace el `Backlink` y el prospecto queda `conseguido`.
 *
 * `sourceUrl` es la URL de la página que AHORA nos enlaza, y es lo único que vale
 * la pena pedir: el `exampleUrl` del prospecto es la página donde ese sitio enlaza
 * al COMPETIDOR, y usarla registraría un enlace que no existe. Sin ella el enlace
 * nace `verifiable: false`, igual que las filas del reporte de Search Console.
 */
async function promote(req, res, next) {
  try {
    const ctx = await resolveCtx(req, res, { write: true })
    if (!ctx) return
    const prospectId = Number(req.params.pid)
    if (!Number.isInteger(prospectId)) return res.status(400).json({ error: 'Prospecto inválido' })

    const result = await service.promoteProspect({
      ...ctx, prospectId,
      link: {
        sourceUrl: req.body?.sourceUrl,
        anchor:    req.body?.anchor,
        linkType:  req.body?.linkType,
        placement: req.body?.placement,
        notes:     req.body?.notes,
      },
    })
    if (result.notFound) return res.status(404).json({ error: 'Prospecto no encontrado' })
    if (result.alreadyPromoted) {
      return res.status(409).json({
        error: 'Esta oportunidad ya se marcó como conseguida.',
        code:  'ALREADY_PROMOTED',
        backlink: result.backlink,
      })
    }

    // El "ya lo tenemos" NO se escribe acá: lo pone el cruce, que es su única
    // fuente. Así el hecho sigue siendo derivado del inventario y no de este camino.
    await service.syncOwnershipQuietly(ctx)

    // La fila se relee DESPUÉS del cruce. La que salió de la transacción todavía
    // dice `conseguible`, y responder eso le daría a un agente que lee la respuesta
    // un estado que ya dejó de ser cierto.
    const prospect = await service.getProspect({ ...ctx, prospectId })
    res.status(201).json({ ...result, prospect: prospect ?? result.prospect })
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

module.exports = { list, create, classify, promote, update, remove }
