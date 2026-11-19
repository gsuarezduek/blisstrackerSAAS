// Campañas de Mailing: borrador → (programada) → enviando → enviada, con pausa y
// cancelación. Las métricas salen de los contadores desnormalizados de la campaña
// y de MailingSend/MailingLink para el detalle.
const prisma = require('../../lib/prisma')
const { todayString } = require('../../utils/dates')
const { getSetting } = require('../../lib/platformSettings')
const { resolveCtx, intParam, sendError, rejectAgent } = require('./_shared')
const { sanitizeBlocks, renderCampaignHtml, personalize } = require('../../services/mailing/render')
const { countAudience, ownListIds, countNonOpeners } = require('../../services/mailing/audience')
const { estimateFinish, effectiveDailyLimit } = require('../../services/mailing/schedule')
const dispatcher = require('../../services/mailing/dispatcher')

const EDITABLE = ['draft', 'scheduled']
const SEND_STATUSES = ['held', 'queued', 'sending', 'sent', 'delivered', 'failed', 'bounced', 'complained', 'cancelled']

// Plantilla de arranque: algo que ya se ve como un mail, para editar encima.
function starterBlocks() {
  return sanitizeBlocks([
    { type: 'heading', text: 'Hola {{nombre|}}', align: 'left' },
    { type: 'text', doc: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Escribí acá el contenido del mail.' }] }] } },
    { type: 'button', label: 'Ver más', href: 'https://', align: 'left' },
  ])
}

const LIST_SELECT = {
  id: true, name: true, subject: true, status: true, scheduledAt: true, launchedAt: true, finishedAt: true,
  recipients: true, sentCount: true, deliveredCount: true, openCount: true, clickCount: true,
  bounceCount: true, complaintCount: true, unsubscribeCount: true, failedCount: true,
  subjectB: true, abWinner: true, resendOfId: true,
  createdAt: true, updatedAt: true, createdBy: { select: { id: true, name: true } },
}

// Lanzar (y reanudar o cancelar lo que está saliendo) es una decisión de una
// persona: un agente puede armar el borrador, probarlo y leer las métricas, pero
// el botón que manda mails a miles de contactos del cliente no lo aprieta él.
const LAUNCH_HUMAN_ONLY = 'Lanzar, reanudar o cancelar una campaña lo hace una persona desde la app.'

async function findCampaign(ctx, req, res) {
  const id = intParam(req.params.campaignId)
  const c = id && await prisma.mailingCampaign.findFirst({ where: { id, projectId: ctx.projectId } })
  if (!c) res.status(404).json({ error: 'Campaña no encontrada' })
  return c || null
}

/** GET /projects/:id/mailing/campaigns */
async function listCampaigns(req, res, next) {
  try {
    const ctx = await resolveCtx(req, res)
    if (!ctx) return
    const campaigns = await prisma.mailingCampaign.findMany({
      where: { projectId: ctx.projectId },
      orderBy: { createdAt: 'desc' },
      select: LIST_SELECT,
      take: 200,
    })
    res.json(campaigns)
  } catch (err) { next(err) }
}

async function createCampaign(req, res, next) {
  try {
    const ctx = await resolveCtx(req, res, { write: true })
    if (!ctx) return
    const name = String(req.body?.name || '').trim().slice(0, 120) || 'Campaña sin nombre'
    const campaign = await prisma.mailingCampaign.create({
      data: {
        workspaceId: ctx.workspaceId, projectId: ctx.projectId, name,
        blocks: starterBlocks(), createdById: ctx.userId, createdByAgentId: ctx.agentId,
      },
    })
    res.status(201).json(campaign)
  } catch (err) { next(err) }
}

/** GET /projects/:id/mailing/campaigns/:campaignId — sin el snapshot html/text (pesa). */
async function getCampaign(req, res, next) {
  try {
    const ctx = await resolveCtx(req, res)
    if (!ctx) return
    const c = await findCampaign(ctx, req, res)
    if (!c) return
    const { html, text, ...rest } = c
    const resendOf = c.resendOfId
      ? await prisma.mailingCampaign.findUnique({ where: { id: c.resendOfId }, select: { id: true, name: true, subject: true } })
      : null
    res.json({ ...rest, resendOf })
  } catch (err) { next(err) }
}

async function updateCampaign(req, res, next) {
  try {
    const ctx = await resolveCtx(req, res, { write: true })
    if (!ctx) return
    const c = await findCampaign(ctx, req, res)
    if (!c) return
    if (!EDITABLE.includes(c.status)) return res.status(409).json({ error: 'Una campaña ya lanzada no se puede editar. Duplicala para hacer otra.' })
    const b = req.body || {}
    const data = {}
    if (b.name !== undefined) data.name = String(b.name || '').trim().slice(0, 120) || 'Campaña sin nombre'
    if (b.subject !== undefined) data.subject = String(b.subject || '').slice(0, 200)
    if (b.preheader !== undefined) data.preheader = String(b.preheader || '').slice(0, 200) || null
    if (b.blocks !== undefined) data.blocks = sanitizeBlocks(b.blocks)
    if (b.includeListIds !== undefined) data.includeListIds = await ownListIds(ctx.projectId, b.includeListIds)
    if (b.excludeListIds !== undefined) data.excludeListIds = await ownListIds(ctx.projectId, b.excludeListIds)
    // A/B de asunto: `subjectB: null` lo apaga.
    if (b.subjectB !== undefined) data.subjectB = b.subjectB == null ? null : String(b.subjectB).slice(0, 200)
    if (b.abTestPercent !== undefined) {
      if (b.abTestPercent != null && !dispatcher.AB_PERCENTS.includes(Number(b.abTestPercent))) return res.status(400).json({ error: `El test A/B va con ${dispatcher.AB_PERCENTS.join(', ')}% de la audiencia` })
      data.abTestPercent = b.abTestPercent == null ? null : Number(b.abTestPercent)
    }
    if (b.abWaitHours !== undefined) {
      const h = Number(b.abWaitHours)
      if (!Number.isInteger(h) || h < 1 || h > 72) return res.status(400).json({ error: 'La espera del test A/B va de 1 a 72 horas' })
      data.abWaitHours = h
    }
    const { html, text, ...rest } = await prisma.mailingCampaign.update({ where: { id: c.id }, data })
    res.json(rest)
  } catch (err) { next(err) }
}

async function duplicateCampaign(req, res, next) {
  try {
    const ctx = await resolveCtx(req, res, { write: true })
    if (!ctx) return
    const c = await findCampaign(ctx, req, res)
    if (!c) return
    const copy = await prisma.mailingCampaign.create({
      data: {
        workspaceId: ctx.workspaceId, projectId: ctx.projectId,
        name: `${c.name} (copia)`.slice(0, 120), subject: c.subject, preheader: c.preheader,
        blocks: c.blocks, includeListIds: c.includeListIds, excludeListIds: c.excludeListIds,
        subjectB: c.subjectB, abTestPercent: c.abTestPercent, abWaitHours: c.abWaitHours,
        createdById: ctx.userId, createdByAgentId: ctx.agentId,
      },
    })
    res.status(201).json(copy)
  } catch (err) { next(err) }
}

/**
 * POST .../campaigns/:campaignId/resend-non-openers
 * Arma un BORRADOR con el mismo contenido para los que recibieron la campaña y no
 * la abrieron. Conviene cambiarle el asunto: es lo que más mueve la apertura en
 * un segundo intento. Solo sobre una campaña terminada.
 */
async function resendNonOpeners(req, res, next) {
  try {
    const ctx = await resolveCtx(req, res, { write: true })
    if (!ctx) return
    const c = await findCampaign(ctx, req, res)
    if (!c) return
    if (c.status !== 'sent') return res.status(409).json({ error: 'Se puede reenviar cuando la campaña terminó de salir.' })
    const count = await countNonOpeners(c.id)
    if (!count) return res.status(400).json({ error: 'No queda nadie a quien reenviarle: todos abrieron, se dieron de baja o rebotaron.' })
    const draft = await prisma.mailingCampaign.create({
      data: {
        workspaceId: ctx.workspaceId, projectId: ctx.projectId,
        name: `${c.name} — reenvío a quienes no abrieron`.slice(0, 120),
        subject: c.subject, preheader: c.preheader, blocks: c.blocks, resendOfId: c.id,
        createdById: ctx.userId, createdByAgentId: ctx.agentId,
      },
    })
    res.status(201).json({ ...draft, audience: count })
  } catch (err) { next(err) }
}

/** No se borra lo que está saliendo: primero se cancela. */
async function deleteCampaign(req, res, next) {
  try {
    const ctx = await resolveCtx(req, res, { write: true })
    if (!ctx) return
    const c = await findCampaign(ctx, req, res)
    if (!c) return
    if (['sending', 'paused'].includes(c.status)) return res.status(409).json({ error: 'Cancelá el envío antes de borrar la campaña.' })
    // Un agente borra solo borradores: una campaña lanzada se lleva sus métricas.
    if (c.status !== 'draft' && rejectAgent(req, res, 'Un agente solo puede borrar borradores; una campaña programada se desprograma primero y una lanzada la borra una persona.')) return
    await prisma.mailingCampaign.delete({ where: { id: c.id } })
    res.json({ ok: true })
  } catch (err) { next(err) }
}

/**
 * POST /projects/:id/mailing/campaigns/:campaignId/preview
 * { subject?, preheader?, blocks? } — lo que todavía no se guardó. Devuelve el
 * HTML exacto que va a salir (mismo render que el envío), con datos de ejemplo.
 */
async function previewCampaign(req, res, next) {
  try {
    const ctx = await resolveCtx(req, res)
    if (!ctx) return
    const c = await findCampaign(ctx, req, res)
    if (!c) return
    const config = await prisma.mailingConfig.findUnique({ where: { projectId: ctx.projectId } })
    const b = req.body || {}
    const html = renderCampaignHtml({
      subject: b.subject ?? c.subject,
      preheader: b.preheader ?? c.preheader,
      blocks: b.blocks ?? c.blocks,
      brandColor: config?.brandColor,
      senderName: config?.fromName || '',
      postalAddress: config?.postalAddress || '(dirección del remitente)',
    })
    const sample = { firstName: 'Ana', lastName: 'García', email: 'ana@ejemplo.com', fields: {} }
    res.json({ html: personalize(html, { contact: sample, system: { unsub_url: '#', open_url: '' } }) })
  } catch (err) { next(err) }
}

async function capacityInfo(projectId, count) {
  const config = await prisma.mailingConfig.findUnique({
    where: { projectId },
    include: { workspace: { select: { timezone: true } } },
  })
  if (!config) return null
  const tz = config.workspace?.timezone || 'America/Argentina/Buenos_Aires'
  const hardCap = Number(await getSetting('mailingMaxDailyPerProject').catch(() => 0)) || 0
  const { limit: dailyLimit, warmup } = effectiveDailyLimit({ ...config, hardCap, tz })
  const usage = await prisma.mailingDailyUsage.findUnique({ where: { projectId_date: { projectId, date: todayString(tz) } } })
  // Lo que ya está en cola de otras campañas sale antes (FIFO por lanzamiento).
  const queuedAhead = await prisma.mailingSend.count({ where: { projectId, status: { in: ['queued', 'sending'] } } })
  const now = new Date()
  const limitForDay = warmup && !warmup.done
    ? d => effectiveDailyLimit({ ...config, hardCap, tz, now: new Date(now.getTime() + d * 86400000) }).limit
    : null
  const est = estimateFinish({
    count: count + queuedAhead, dailyLimit, limitForDay, usedToday: usage?.count || 0, now,
    tz, start: config.sendWindowStart, end: config.sendWindowEnd,
  })
  return { dailyLimit, warmup, usedToday: usage?.count || 0, queuedAhead, ...est, sendWindowStart: config.sendWindowStart, sendWindowEnd: config.sendWindowEnd }
}

/** POST /projects/:id/mailing/audience { includeListIds, excludeListIds } → conteo + estimación */
async function audiencePreview(req, res, next) {
  try {
    const ctx = await resolveCtx(req, res)
    if (!ctx) return
    let count
    const resendOfId = intParam(req.body?.resendOfId)
    if (resendOfId) {
      const parent = await prisma.mailingCampaign.findFirst({ where: { id: resendOfId, projectId: ctx.projectId }, select: { id: true } })
      if (!parent) return res.status(404).json({ error: 'Campaña original no encontrada' })
      count = await countNonOpeners(parent.id)
    } else {
      count = await countAudience(ctx.projectId, req.body?.includeListIds, req.body?.excludeListIds)
    }
    res.json({ count, capacity: await capacityInfo(ctx.projectId, count) })
  } catch (err) { next(err) }
}

/** POST .../test { emails: [...] } — hasta 5 direcciones. */
async function sendTestCampaign(req, res, next) {
  try {
    const ctx = await resolveCtx(req, res, { write: true })
    if (!ctx) return
    const c = await findCampaign(ctx, req, res)
    if (!c) return
    const emails = [...new Set((Array.isArray(req.body?.emails) ? req.body.emails : [])
      .map(e => String(e).trim().toLowerCase()).filter(e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)))].slice(0, 5)
    if (!emails.length) return res.status(400).json({ error: 'Ingresá al menos un email válido' })
    const config = await prisma.mailingConfig.findUnique({ where: { projectId: ctx.projectId } })
    if (!config?.fromEmail) return res.status(400).json({ error: 'Falta configurar el remitente (Mailing → Configuración).' })
    const results = await dispatcher.sendTest(c, config, emails)
    const failed = results.filter(r => !r.ok)
    if (failed.length === results.length) return res.status(502).json({ error: `No se pudo enviar la prueba: ${failed[0]?.error}` })
    res.json({ sent: results.length - failed.length, failed: failed.map(f => f.error) })
  } catch (err) { sendError(res, next, err) }
}

/**
 * POST .../launch { scheduledAt? }
 * Con fecha futura queda programada (el cron la lanza a esa hora, resolviendo la
 * audiencia en ese momento); sin fecha sale ahora.
 */
async function launch(req, res, next) {
  try {
    if (rejectAgent(req, res, LAUNCH_HUMAN_ONLY)) return
    const ctx = await resolveCtx(req, res, { write: true })
    if (!ctx) return
    const c = await findCampaign(ctx, req, res)
    if (!c) return
    if (!EDITABLE.includes(c.status)) return res.status(409).json({ error: 'La campaña ya fue lanzada' })
    const config = await prisma.mailingConfig.findUnique({ where: { projectId: ctx.projectId } })
    const problems = dispatcher.readinessProblems(c, config)
    if (problems.length) return res.status(400).json({ error: problems[0], problems })

    if (req.body?.scheduledAt) {
      const at = new Date(req.body.scheduledAt)
      if (Number.isNaN(at.getTime())) return res.status(400).json({ error: 'Fecha de programación inválida' })
      if (at.getTime() > Date.now() + 60000) {
        await prisma.mailingCampaign.update({ where: { id: c.id }, data: { status: 'scheduled', scheduledAt: at } })
        return res.json({ status: 'scheduled', scheduledAt: at })
      }
    }
    const r = await dispatcher.launchCampaign(c.id)
    res.json({ status: 'sending', ...r })
  } catch (err) { sendError(res, next, err) }
}

async function transition(req, res, next, { from, to, extra, humanOnly = false }) {
  try {
    if (humanOnly && rejectAgent(req, res, LAUNCH_HUMAN_ONLY)) return
    const ctx = await resolveCtx(req, res, { write: true })
    if (!ctx) return
    const c = await findCampaign(ctx, req, res)
    if (!c) return
    const r = await prisma.mailingCampaign.updateMany({ where: { id: c.id, status: { in: from } }, data: { status: to, ...(extra || {}) } })
    if (!r.count) return res.status(409).json({ error: 'La campaña no está en un estado que permita esa acción' })
    if (to === 'cancelled') {
      await prisma.mailingSend.updateMany({ where: { campaignId: c.id, status: { in: ['queued', 'held'] } }, data: { status: 'cancelled', errorMsg: 'Campaña cancelada' } })
    }
    res.json({ status: to })
  } catch (err) { next(err) }
}

const pause = (req, res, next) => transition(req, res, next, { from: ['sending'], to: 'paused' })
// Pausar sí lo puede hacer un agente: frenar un envío nunca manda nada.
const resume = (req, res, next) => transition(req, res, next, { from: ['paused'], to: 'sending', humanOnly: true })
const cancel = (req, res, next) => transition(req, res, next, { from: ['sending', 'paused'], to: 'cancelled', extra: { finishedAt: new Date() }, humanOnly: true })
const unschedule = (req, res, next) => transition(req, res, next, { from: ['scheduled'], to: 'draft', extra: { scheduledAt: null } })

/** GET .../stats — contadores, progreso, links y aperturas por hora (primeras 72h). */
async function stats(req, res, next) {
  try {
    const ctx = await resolveCtx(req, res)
    if (!ctx) return
    const c = await findCampaign(ctx, req, res)
    if (!c) return
    const [byStatus, links, opens] = await Promise.all([
      prisma.mailingSend.groupBy({ by: ['status'], where: { campaignId: c.id }, _count: { _all: true } }),
      prisma.mailingLink.findMany({ where: { campaignId: c.id }, orderBy: { uniqueClicks: 'desc' }, select: { idx: true, url: true, clickCount: true, uniqueClicks: true } }),
      c.launchedAt
        ? prisma.mailingSend.findMany({
          where: { campaignId: c.id, firstOpenedAt: { not: null, lte: new Date(c.launchedAt.getTime() + 72 * 3600000) } },
          select: { firstOpenedAt: true },
          take: 50000,
        })
        : [],
    ])
    const progress = Object.fromEntries(SEND_STATUSES.map(s => [s, 0]))
    for (const r of byStatus) progress[r.status] = r._count._all
    const hourly = []
    if (c.launchedAt) {
      const buckets = new Array(72).fill(0)
      for (const o of opens) {
        const h = Math.floor((o.firstOpenedAt.getTime() - c.launchedAt.getTime()) / 3600000)
        if (h >= 0 && h < 72) buckets[h]++
      }
      let last = 0
      buckets.forEach((v, i) => { if (v) last = i })
      for (let i = 0; i <= Math.max(last, 23); i++) hourly.push({ hour: i, opens: buckets[i] })
    }
    const pending = progress.held + progress.queued + progress.sending
    const ab = c.subjectB != null ? await dispatcher.variantStats(c.id) : null
    const { html, text, blocks, ...campaign } = c
    res.json({
      campaign,
      progress,
      pending,
      capacity: pending && ['sending', 'paused'].includes(c.status) ? await capacityInfo(ctx.projectId, 0) : null,
      links,
      hourly,
      ab,
      resendOf: c.resendOfId ? await prisma.mailingCampaign.findUnique({ where: { id: c.resendOfId }, select: { id: true, name: true } }) : null,
      nonOpeners: c.status === 'sent' ? await countNonOpeners(c.id) : null,
    })
  } catch (err) { next(err) }
}

/** GET .../recipients?status=&q=&page= */
async function recipients(req, res, next) {
  try {
    const ctx = await resolveCtx(req, res)
    if (!ctx) return
    const c = await findCampaign(ctx, req, res)
    if (!c) return
    const page = Math.max(1, Number(req.query.page) || 1)
    const pageSize = 50
    const where = { campaignId: c.id }
    const f = req.query.filter
    if (SEND_STATUSES.includes(f)) where.status = f
    else if (f === 'opened') where.firstOpenedAt = { not: null }
    else if (f === 'clicked') where.firstClickedAt = { not: null }
    else if (f === 'unsubscribed') where.unsubscribedAt = { not: null }
    const q = String(req.query.q || '').trim().toLowerCase()
    if (q) where.email = { contains: q, mode: 'insensitive' }
    const [items, total] = await Promise.all([
      prisma.mailingSend.findMany({
        where, orderBy: { id: 'asc' }, skip: (page - 1) * pageSize, take: pageSize,
        select: {
          id: true, contactId: true, email: true, status: true, sentAt: true, deliveredAt: true, firstOpenedAt: true, openCount: true,
          firstClickedAt: true, clickCount: true, bouncedAt: true, bounceType: true, unsubscribedAt: true, errorMsg: true, attempts: true, variant: true,
        },
      }),
      prisma.mailingSend.count({ where }),
    ])
    res.json({ items, total, page, pageSize })
  } catch (err) { next(err) }
}

module.exports = {
  listCampaigns, createCampaign, getCampaign, updateCampaign, duplicateCampaign, deleteCampaign,
  previewCampaign, audiencePreview, sendTestCampaign, launch, pause, resume, cancel, unschedule, resendNonOpeners,
  stats, recipients,
}
