// Motor de envío de Mailing.
//
// Lanzar una campaña congela todo lo que se va a mandar: el HTML/texto con los
// links numerados, y una fila MailingSend por destinatario (la audiencia se
// resuelve en ese momento). Después, un cron por minuto (`dispatchTick`) va
// tomando envíos en cola respetando, por proyecto:
//   - la ventana horaria (en la tz del workspace),
//   - el tope diario (MailingDailyUsage, con techo global de plataforma),
//   - el ritmo del proveedor (PER_TICK).
// Lo que no entra hoy queda en cola y sale al día siguiente. No hay cola externa:
// la tabla ES la cola, y el cron corre con lease en DB (lib/cronLock.js).
const crypto = require('crypto')
const prisma = require('../../lib/prisma')
const { todayString } = require('../../utils/dates')
const { getSetting } = require('../../lib/platformSettings')
const { getProvider } = require('./providers')
const { readCredentials, formatFrom, backendBase } = require('./config')
const { renderCampaignHtml, renderCampaignText, prepareTracking, personalize } = require('./render')
const { resolveAudience } = require('./audience')
const { inSendWindow } = require('./schedule')
const { enabledWorkspaceIds } = require('../../lib/featureFlags')

const MAX_ATTEMPTS = 3
const BACKOFF_MINS = [5, 30, 120]
const STUCK_SENDING_MINS = 15
const CREATE_CHUNK = 1000

function newToken() {
  return crypto.randomBytes(18).toString('base64url')
}

function brandOf(config) {
  return config?.brandColor || null
}

/** HTML/texto de la campaña con los placeholders de tracking. */
function buildSnapshot(campaign, config) {
  const base = {
    subject: campaign.subject,
    preheader: campaign.preheader,
    blocks: campaign.blocks,
    brandColor: brandOf(config),
    senderName: config?.fromName || '',
    postalAddress: config?.postalAddress || '',
  }
  const { html, links } = prepareTracking(renderCampaignHtml(base))
  return { html, text: renderCampaignText(base), links }
}

/** URLs públicas de un envío (pixel, clic, baja). */
function trackingUrls(token) {
  const api = `${backendBase()}/api/public/mailing`
  return {
    open_url: `${api}/o/${token}.gif`,
    unsub_url: `${frontendBase()}/baja/${token}`,
    one_click: `${api}/u/${token}`,
    click: i => `${api}/c/${token}/${i}`,
  }
}

// La página de baja vive en la SPA (dominio raíz). En desarrollo, FRONTEND_URL.
function frontendBase() {
  if (process.env.NODE_ENV !== 'production' && process.env.FRONTEND_URL) return process.env.FRONTEND_URL.replace(/\/$/, '')
  return `https://${process.env.APP_DOMAIN || 'blisstracker.app'}`
}

function listUnsubscribeHeaders(urls, config) {
  const mailto = config.replyTo || config.fromEmail
  return {
    'List-Unsubscribe': `<${urls.one_click}>${mailto ? `, <mailto:${mailto}?subject=baja>` : ''}`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  }
}

/** Arma el mensaje final para un destinatario. */
function buildMessage({ campaign, config, contact, token, tracking = true }) {
  const urls = tracking ? trackingUrls(token) : { open_url: '', unsub_url: '#', click: null }
  const system = tracking
    ? { open_url: urls.open_url, unsub_url: urls.unsub_url, click: urls.click }
    : { open_url: '', unsub_url: '#', click: null }
  let html = personalize(campaign.html, { contact, system })
  // En una prueba no hay links numerados que resolver: se reemplazan por los reales.
  if (!tracking && campaign.links) {
    html = html.replace(/\{\{__click:(\d+)\}\}/g, (_, i) => campaign.links[Number(i)] || '#')
  }
  return {
    from: formatFrom(config),
    replyTo: config.replyTo || undefined,
    to: contact.email,
    subject: personalize(campaign.subject, { contact }, { html: false }),
    html,
    text: personalize(campaign.text, { contact, system }, { html: false }),
    headers: tracking ? listUnsubscribeHeaders(urls, config) : {},
  }
}

/**
 * Valida que una campaña esté lista para salir. Devuelve la lista de problemas
 * (vacía = lista). Se usa al lanzar, al programar y para la UI.
 */
function readinessProblems(campaign, config) {
  const problems = []
  if (!config || !readCredentials(config)) problems.push('Falta configurar el proveedor de envío (Mailing → Configuración).')
  else if (config.status !== 'active') problems.push('La configuración de envío no está verificada.')
  if (!config?.fromEmail) problems.push('Falta el email del remitente.')
  if (!config?.postalAddress) problems.push('Falta la dirección postal del remitente (va al pie de cada mail).')
  if (!campaign.subject?.trim()) problems.push('Falta el asunto.')
  if (!Array.isArray(campaign.blocks) || campaign.blocks.length === 0) problems.push('El mail no tiene contenido.')
  if (!Array.isArray(campaign.includeListIds) || campaign.includeListIds.length === 0) problems.push('Elegí al menos una base de destinatarios.')
  return problems
}

/**
 * Congela la campaña y encola un envío por destinatario. Idempotente frente a dos
 * clics seguidos: solo pasa de draft/scheduled a sending una vez.
 * @returns {{ recipients }} o lanza con status 4xx.
 */
async function launchCampaign(campaignId) {
  const campaign = await prisma.mailingCampaign.findUnique({ where: { id: campaignId } })
  if (!campaign) throw Object.assign(new Error('Campaña no encontrada'), { status: 404 })
  if (!['draft', 'scheduled'].includes(campaign.status)) {
    throw Object.assign(new Error('La campaña ya fue lanzada'), { status: 409 })
  }
  const config = await prisma.mailingConfig.findUnique({ where: { projectId: campaign.projectId } })
  const problems = readinessProblems(campaign, config)
  if (problems.length) throw Object.assign(new Error(problems[0]), { status: 400, problems })

  const audience = await resolveAudience(campaign.projectId, campaign.includeListIds, campaign.excludeListIds)
  if (!audience.length) throw Object.assign(new Error('La audiencia está vacía: no hay contactos suscriptos en las bases elegidas.'), { status: 400 })

  const snap = buildSnapshot(campaign, config)
  const now = new Date()

  await prisma.$transaction(async tx => {
    const claimed = await tx.mailingCampaign.updateMany({
      where: { id: campaign.id, status: { in: ['draft', 'scheduled'] } },
      data: {
        status: 'sending', launchedAt: now, html: snap.html, text: snap.text,
        recipients: audience.length,
      },
    })
    if (claimed.count !== 1) throw Object.assign(new Error('La campaña ya fue lanzada'), { status: 409 })
    if (snap.links.length) {
      await tx.mailingLink.createMany({ data: snap.links.map((url, idx) => ({ campaignId: campaign.id, idx, url })) })
    }
    for (let i = 0; i < audience.length; i += CREATE_CHUNK) {
      await tx.mailingSend.createMany({
        data: audience.slice(i, i + CREATE_CHUNK).map(c => ({
          campaignId: campaign.id, projectId: campaign.projectId, contactId: c.id, email: c.email, token: newToken(),
        })),
      })
    }
  }, { timeout: 120000 })

  return { recipients: audience.length }
}

/** Envío de prueba: no consume el tope, no cuenta en métricas, sin tracking. */
async function sendTest(campaign, config, emails) {
  const snap = buildSnapshot(campaign, config)
  const creds = readCredentials(config)
  if (!creds) throw Object.assign(new Error('Falta configurar el proveedor de envío.'), { status: 400 })
  const provider = getProvider(config.provider)
  const c = { ...campaign, html: snap.html, text: snap.text, links: snap.links, subject: `[Prueba] ${campaign.subject || ''}` }
  const messages = emails.map(email => buildMessage({
    campaign: c, config, tracking: false,
    contact: { email, firstName: 'Nombre', lastName: 'Apellido', fields: {} },
  }))
  return provider.sendBatch(creds, messages)
}

// ─── Tick del cron ───────────────────────────────────────────────────────────

async function launchDueScheduled(now, enabled) {
  const due = await prisma.mailingCampaign.findMany({
    where: { status: 'scheduled', scheduledAt: { lte: now } },
    select: { id: true, workspaceId: true },
    take: 20,
  })
  for (const { id, workspaceId } of due) {
    if (!(await enabled()).has(workspaceId)) continue
    try {
      await launchCampaign(id)
    } catch (err) {
      // Una programada que no puede salir (config caída, audiencia vacía) vuelve a
      // borrador con el motivo, en vez de reintentar cada minuto para siempre.
      console.error(`[mailing] no se pudo lanzar la campaña programada ${id}:`, err.message)
      await prisma.mailingCampaign.updateMany({ where: { id, status: 'scheduled' }, data: { status: 'draft', scheduledAt: null } })
    }
  }
}

// Un proceso que se cayó a mitad de un lote deja envíos en `sending`. Vuelven a
// la cola: puede duplicar el mail de alguno que sí salió, pero perderlo en
// silencio sería peor (y el proveedor ya devolvió o no el id).
async function recoverStuck(now) {
  await prisma.mailingSend.updateMany({
    where: { status: 'sending', claimedAt: { lt: new Date(now.getTime() - STUCK_SENDING_MINS * 60000) }, sentAt: null },
    data: { status: 'queued' },
  })
}

async function dailyCap(config) {
  const hard = Number(await getSetting('mailingMaxDailyPerProject').catch(() => 0)) || 0
  const own = Math.max(0, config.dailyLimit || 0)
  return hard > 0 ? Math.min(own, hard) : own
}

async function processProject(projectId, now) {
  const config = await prisma.mailingConfig.findUnique({
    where: { projectId },
    include: { workspace: { select: { timezone: true } } },
  })
  if (!config || config.status !== 'active') return { skipped: 'config' }
  const creds = readCredentials(config)
  if (!creds) return { skipped: 'config' }

  const tz = config.workspace?.timezone || 'America/Argentina/Buenos_Aires'
  if (!inSendWindow(now, tz, config.sendWindowStart, config.sendWindowEnd)) return { skipped: 'window' }

  const date = todayString(tz)
  const usage = await prisma.mailingDailyUsage.findUnique({ where: { projectId_date: { projectId, date } } })
  const remaining = (await dailyCap(config)) - (usage?.count || 0)
  if (remaining <= 0) return { skipped: 'cap' }

  const provider = getProvider(config.provider)
  const take = Math.min(remaining, provider.PER_TICK)

  const candidates = await prisma.mailingSend.findMany({
    where: {
      projectId, status: 'queued',
      OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
      campaign: { status: 'sending' },
    },
    orderBy: [{ campaign: { launchedAt: 'asc' } }, { id: 'asc' }],
    take,
    select: { id: true },
  })
  if (!candidates.length) return { sent: 0 }
  const ids = candidates.map(c => c.id)
  await prisma.mailingSend.updateMany({ where: { id: { in: ids }, status: 'queued' }, data: { status: 'sending', claimedAt: now } })
  const sends = await prisma.mailingSend.findMany({
    where: { id: { in: ids }, status: 'sending' },
    include: { contact: { select: { email: true, firstName: true, lastName: true, fields: true, status: true } } },
    orderBy: { id: 'asc' },
  })

  // Re-chequeo: alguien pudo darse de baja (o rebotar en otra campaña) mientras
  // esperaba en la cola.
  const ready = []
  const dropped = []
  for (const s of sends) {
    if (!s.contact || s.contact.status !== 'subscribed') dropped.push(s.id)
    else ready.push(s)
  }
  if (dropped.length) {
    await prisma.mailingSend.updateMany({ where: { id: { in: dropped } }, data: { status: 'cancelled', errorMsg: 'El contacto se dio de baja o fue suprimido antes del envío' } })
  }
  if (!ready.length) return { sent: 0 }

  const campaignIds = [...new Set(ready.map(s => s.campaignId))]
  const campaigns = new Map((await prisma.mailingCampaign.findMany({
    where: { id: { in: campaignIds } },
    select: { id: true, subject: true, html: true, text: true },
  })).map(c => [c.id, c]))

  const messages = ready.map(s => buildMessage({
    campaign: campaigns.get(s.campaignId), config, token: s.token,
    contact: { ...s.contact, email: s.email },
  }))

  let results
  try {
    results = await provider.sendBatch(creds, messages)
  } catch (err) {
    results = ready.map(() => ({ ok: false, error: err.message, retryable: true }))
  }

  // Credencial rechazada: la config queda inválida y los envíos vuelven a la cola
  // SIN gastar intento — no es culpa de esos destinatarios.
  if (results.some(r => r.fatal)) {
    const msg = results.find(r => r.fatal).error
    await prisma.mailingConfig.update({ where: { id: config.id }, data: { status: 'invalid', lastError: String(msg).slice(0, 500) } })
    await prisma.mailingSend.updateMany({ where: { id: { in: ready.map(s => s.id) }, status: 'sending' }, data: { status: 'queued' } })
    return { sent: 0, fatal: msg }
  }

  const sentByCampaign = new Map()
  const failedByCampaign = new Map()
  const ops = []
  ready.forEach((s, i) => {
    const r = results[i] || { ok: false, error: 'Sin respuesta del proveedor', retryable: true }
    const attempts = s.attempts + 1
    if (r.ok) {
      sentByCampaign.set(s.campaignId, (sentByCampaign.get(s.campaignId) || 0) + 1)
      ops.push(prisma.mailingSend.update({
        where: { id: s.id },
        data: { status: 'sent', sentAt: now, providerMessageId: r.messageId, attempts, errorMsg: null, nextAttemptAt: null },
      }))
    } else if (r.retryable && attempts < MAX_ATTEMPTS) {
      ops.push(prisma.mailingSend.update({
        where: { id: s.id },
        data: { status: 'queued', attempts, errorMsg: String(r.error || '').slice(0, 500), nextAttemptAt: new Date(now.getTime() + BACKOFF_MINS[attempts - 1] * 60000) },
      }))
    } else {
      failedByCampaign.set(s.campaignId, (failedByCampaign.get(s.campaignId) || 0) + 1)
      ops.push(prisma.mailingSend.update({
        where: { id: s.id },
        data: { status: 'failed', attempts, errorMsg: String(r.error || '').slice(0, 500) },
      }))
    }
  })
  const sentTotal = [...sentByCampaign.values()].reduce((a, b) => a + b, 0)
  for (const [id, n] of sentByCampaign) ops.push(prisma.mailingCampaign.update({ where: { id }, data: { sentCount: { increment: n } } }))
  for (const [id, n] of failedByCampaign) ops.push(prisma.mailingCampaign.update({ where: { id }, data: { failedCount: { increment: n } } }))
  if (sentTotal) {
    ops.push(prisma.mailingDailyUsage.upsert({
      where: { projectId_date: { projectId, date } },
      create: { projectId, date, count: sentTotal },
      update: { count: { increment: sentTotal } },
    }))
  }
  await prisma.$transaction(ops)
  return { sent: sentTotal }
}

/** Campañas en `sending` sin nada pendiente pasan a `sent`. */
async function finalizeCampaigns(now) {
  const sending = await prisma.mailingCampaign.findMany({ where: { status: 'sending' }, select: { id: true } })
  if (!sending.length) return
  const pending = await prisma.mailingSend.groupBy({
    by: ['campaignId'],
    where: { campaignId: { in: sending.map(c => c.id) }, status: { in: ['queued', 'sending'] } },
    _count: { _all: true },
  })
  const withPending = new Set(pending.map(p => p.campaignId))
  const done = sending.map(c => c.id).filter(id => !withPending.has(id))
  if (done.length) {
    await prisma.mailingCampaign.updateMany({ where: { id: { in: done }, status: 'sending' }, data: { status: 'sent', finishedAt: now } })
  }
}

async function dispatchTick(now = new Date()) {
  // Los workspaces habilitados se calculan una sola vez y solo si hay trabajo:
  // sin campañas en curso el tick son dos queries indexadas. Un workspace sin el
  // flag (o suspendido / past_due, que enabledWorkspaceIds excluye) no manda nada;
  // sus envíos quedan en cola hasta que vuelva.
  let enabledCache = null
  const enabled = async () => (enabledCache ??= await enabledWorkspaceIds('mailing'))

  await launchDueScheduled(now, enabled)
  await recoverStuck(now)
  const projects = await prisma.mailingCampaign.findMany({
    where: { status: 'sending' },
    distinct: ['projectId'],
    select: { projectId: true, workspaceId: true },
  })
  for (const { projectId, workspaceId } of projects) {
    if (!(await enabled()).has(workspaceId)) continue
    try {
      await processProject(projectId, now)
    } catch (err) {
      console.error(`[mailing] error procesando el proyecto ${projectId}:`, err.message)
    }
  }
  await finalizeCampaigns(now)
}

module.exports = {
  launchCampaign, sendTest, dispatchTick, processProject, readinessProblems,
  buildSnapshot, buildMessage, trackingUrls, frontendBase, newToken,
  MAX_ATTEMPTS, BACKOFF_MINS,
}
