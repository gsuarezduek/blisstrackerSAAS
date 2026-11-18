// Formulario público de suscripción + doble opt-in.
//
// La suscripción llega desde la web del cliente (un form HTML o un fetch). Reglas:
//   - Con doble opt-in (default) el contacto queda `pending` y recibe un mail para
//     confirmar; recién al confirmar pasa a `subscribed` con su consentimiento.
//   - Un contacto que se había dado de baja SIEMPRE pasa por confirmación, aunque
//     la base no pida doble opt-in: si no, cualquiera podría re-suscribir a otra
//     persona escribiendo su email en el form.
//   - Rebotados y quejas se ignoran en silencio.
//   - La respuesta es la misma exista o no el email (no se filtra quién está).
const crypto = require('crypto')
const prisma = require('../../lib/prisma')
const { normalizeEmail } = require('../../lib/normalizeEmail')
const { getProvider } = require('./providers')
const { readCredentials, formatFrom, frontendBase } = require('./config')
const { escHtml } = require('./render')
const { EMAIL_RE, cleanName, addMemberships } = require('./importer')

const RESEND_CONFIRM_MINS = 10
const CONFIRM_TTL_DAYS = 7

function confirmUrl(token) {
  return `${frontendBase()}/confirmar-suscripcion/${token}`
}

function confirmationEmail({ config, listName, token }) {
  const brand = /^#[0-9a-fA-F]{6}$/.test(config.brandColor || '') ? config.brandColor : '#E67A1F'
  const sender = config.fromName || config.fromEmail
  const url = confirmUrl(token)
  const font = 'Helvetica, Arial, sans-serif'
  const html = '<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>' +
    '<body style="margin:0;padding:0;background:#f3f4f6">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f3f4f6"><tr><td align="center" style="padding:24px 12px">' +
    '<table role="presentation" width="520" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:520px;background:#ffffff;border-radius:10px">' +
    `<tr><td style="padding:32px 32px 8px;font-family:${font}">` +
    `<h1 style="margin:0 0 12px;font-size:22px;color:#111827">Confirmá tu suscripción</h1>` +
    `<p style="margin:0 0 20px;font-size:16px;line-height:1.55;color:#1f2937">Pediste recibir las novedades de <b>${escHtml(sender)}</b>${listName ? ` (${escHtml(listName)})` : ''}. Para empezar a recibirlas, confirmá tu email:</p>` +
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-radius:6px;background:${brand}">` +
    `<a href="${escHtml(url)}" style="display:inline-block;padding:12px 26px;font-family:${font};font-size:16px;font-weight:bold;color:#ffffff;text-decoration:none">Confirmar suscripción</a></td></tr></table>` +
    `<p style="margin:20px 0 24px;font-size:13px;line-height:1.5;color:#6b7280">Si no fuiste vos, ignorá este mail: sin confirmar no vas a recibir nada.</p>` +
    '</td></tr></table>' +
    (config.postalAddress ? `<p style="margin:14px 0 0;font-family:${font};font-size:12px;color:#6b7280">${escHtml(sender)} · ${escHtml(config.postalAddress)}</p>` : '') +
    '</td></tr></table></body></html>'
  const text = `Confirmá tu suscripción\n\nPediste recibir las novedades de ${sender}. Para confirmar, abrí este link:\n${url}\n\nSi no fuiste vos, ignorá este mail.\n`
  return { subject: `Confirmá tu suscripción a ${sender}`, html, text }
}

async function sendConfirmation({ config, contact, listName }) {
  const creds = readCredentials(config)
  if (!creds || config.status !== 'active') throw Object.assign(new Error('El remitente de este proyecto no está configurado'), { status: 503 })
  const { subject, html, text } = confirmationEmail({ config, listName, token: contact.confirmToken })
  const [r] = await getProvider(config.provider).sendBatch(creds, [{
    from: formatFrom(config), replyTo: config.replyTo || undefined, to: contact.email, subject, html, text, headers: {},
  }])
  if (!r?.ok) throw Object.assign(new Error(r?.error || 'No se pudo enviar el mail de confirmación'), { status: 502 })
}

function newConfirmToken() {
  return crypto.randomBytes(18).toString('base64url')
}

/**
 * @returns {{ status: 'pending'|'subscribed', redirect: string|null }}
 *   `status` es lo que se le dice a la persona; nunca depende de si ya existía.
 */
async function subscribe({ formToken, body }) {
  const list = await prisma.mailingList.findUnique({
    where: { publicFormToken: String(formToken || '') },
    select: { id: true, name: true, projectId: true, workspaceId: true, doubleOptIn: true, formSuccessUrl: true },
  })
  if (!list) throw Object.assign(new Error('Este formulario ya no está activo'), { status: 404 })
  const status = list.doubleOptIn ? 'pending' : 'subscribed'
  const reply = { status, redirect: list.formSuccessUrl || null }

  // Honeypot: un bot completa todos los campos; una persona no ve este.
  if (body?.website || body?._hp) return reply

  const email = normalizeEmail(String(body?.email || ''))
  if (!EMAIL_RE.test(email || '')) throw Object.assign(new Error('Ingresá un email válido'), { status: 400 })
  const firstName = cleanName(body?.nombre ?? body?.firstName)
  const lastName = cleanName(body?.apellido ?? body?.lastName)

  const config = await prisma.mailingConfig.findUnique({ where: { projectId: list.projectId } })
  let contact = await prisma.mailingContact.findUnique({ where: { projectId_email: { projectId: list.projectId, email } } })
  if (contact && ['bounced', 'complained'].includes(contact.status)) return reply

  const now = new Date()
  const needsConfirm = list.doubleOptIn || contact?.status === 'unsubscribed'
  if (needsConfirm && !(config?.status === 'active' && readCredentials(config))) {
    throw Object.assign(new Error('La suscripción no está disponible en este momento'), { status: 503 })
  }

  if (!contact) {
    contact = await prisma.mailingContact.create({
      data: {
        workspaceId: list.workspaceId, projectId: list.projectId, email, firstName, lastName,
        source: 'form', status: needsConfirm ? 'pending' : 'subscribed',
        ...(needsConfirm ? {} : { consentAt: now, consentSource: 'form' }),
      },
    })
  } else {
    const data = {}
    if (!contact.firstName && firstName) data.firstName = firstName
    if (!contact.lastName && lastName) data.lastName = lastName
    if (Object.keys(data).length) contact = await prisma.mailingContact.update({ where: { id: contact.id }, data })
  }
  await addMemberships([contact.id], [list.id])

  if (contact.status === 'subscribed' || !needsConfirm) return reply

  // Pendiente o dado de baja: mandar (o reenviar) la confirmación, con freno
  // para que el form no se pueda usar para bombardear una casilla ajena.
  if (contact.confirmSentAt && now - contact.confirmSentAt < RESEND_CONFIRM_MINS * 60000) return { ...reply, status: 'pending' }
  contact = await prisma.mailingContact.update({
    where: { id: contact.id },
    data: { confirmToken: newConfirmToken(), confirmSentAt: now },
  })
  await sendConfirmation({ config, contact, listName: list.name })
  return { ...reply, status: 'pending' }
}

async function findByConfirmToken(token) {
  if (typeof token !== 'string' || token.length < 10 || token.length > 64) return null
  const c = await prisma.mailingContact.findUnique({
    where: { confirmToken: token },
    select: { id: true, email: true, status: true, confirmSentAt: true, projectId: true },
  })
  if (!c) return null
  const expired = !c.confirmSentAt || Date.now() - c.confirmSentAt.getTime() > CONFIRM_TTL_DAYS * 86400000
  return { ...c, expired }
}

async function confirm(token) {
  const c = await findByConfirmToken(token)
  if (!c) throw Object.assign(new Error('El link de confirmación no es válido o ya se usó.'), { status: 404 })
  if (c.expired) throw Object.assign(new Error('El link de confirmación venció. Volvé a suscribirte desde el formulario.'), { status: 410 })
  if (['bounced', 'complained'].includes(c.status)) throw Object.assign(new Error('No pudimos confirmar esta suscripción.'), { status: 409 })
  await prisma.mailingContact.update({
    where: { id: c.id },
    data: {
      status: 'subscribed', consentAt: new Date(), consentSource: 'form_double_optin',
      confirmToken: null, unsubscribedAt: null, unsubscribeReason: null,
    },
  })
  return c
}

module.exports = { subscribe, confirm, findByConfirmToken, confirmationEmail, confirmUrl, RESEND_CONFIRM_MINS }
