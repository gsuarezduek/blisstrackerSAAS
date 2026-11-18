// Lo que pasa con un mail después de salir: aperturas y clics (tracking propio),
// bajas (link del pie y one-click de Gmail/Yahoo) y entregas/rebotes/quejas
// (webhooks del proveedor). Cada función actualiza el MailingSend y, cuando es la
// PRIMERA vez para ese destinatario, el contador desnormalizado de la campaña.
//
// "Primera vez" se resuelve con un updateMany condicional (`where firstX: null`):
// dos requests simultáneos (Gmail suele pedir el pixel dos veces) no cuentan doble.
const prisma = require('../../lib/prisma')

async function findSendByToken(token) {
  if (typeof token !== 'string' || token.length < 10 || token.length > 64) return null
  return prisma.mailingSend.findUnique({
    where: { token },
    select: { id: true, campaignId: true, contactId: true, projectId: true, status: true },
  })
}

async function markFirst(sendId, field, now) {
  const r = await prisma.mailingSend.updateMany({ where: { id: sendId, [field]: null }, data: { [field]: now } })
  return r.count === 1
}

async function bumpCampaign(campaignId, field) {
  await prisma.mailingCampaign.update({ where: { id: campaignId }, data: { [field]: { increment: 1 } } })
}

async function recordOpen(token) {
  const send = await findSendByToken(token)
  if (!send) return
  const now = new Date()
  if (await markFirst(send.id, 'firstOpenedAt', now)) await bumpCampaign(send.campaignId, 'openCount')
  await prisma.mailingSend.update({ where: { id: send.id }, data: { openCount: { increment: 1 } } })
}

/**
 * Registra el clic y devuelve la URL de destino (de MailingLink, nunca del
 * request). null si el token o el índice no existen.
 */
async function recordClick(token, idx) {
  const send = await findSendByToken(token)
  const i = Number(idx)
  if (!send || !Number.isInteger(i) || i < 0) return null
  const link = await prisma.mailingLink.findUnique({
    where: { campaignId_idx: { campaignId: send.campaignId, idx: i } },
    select: { id: true, url: true },
  })
  if (!link) return null

  const now = new Date()
  try {
    const created = await prisma.mailingClick.createMany({ data: [{ sendId: send.id, linkId: link.id }], skipDuplicates: true })
    await prisma.mailingLink.update({
      where: { id: link.id },
      data: { clickCount: { increment: 1 }, ...(created.count ? { uniqueClicks: { increment: 1 } } : {}) },
    })
    if (await markFirst(send.id, 'firstClickedAt', now)) await bumpCampaign(send.campaignId, 'clickCount')
    // Un clic implica que lo abrió, aunque el cliente de mail haya bloqueado imágenes.
    if (await markFirst(send.id, 'firstOpenedAt', now)) await bumpCampaign(send.campaignId, 'openCount')
    await prisma.mailingSend.update({ where: { id: send.id }, data: { clickCount: { increment: 1 } } })
  } catch (err) {
    // El tracking nunca puede romper el redirect: la persona quiere llegar al link.
    console.error('[mailing] error registrando clic:', err.message)
  }
  return link.url
}

const SUPPRESSED = ['unsubscribed', 'bounced', 'complained']

async function unsubscribe(token, { reason } = {}) {
  const send = await findSendByToken(token)
  if (!send) return null
  const now = new Date()
  if (send.contactId) {
    // Un rebotado o una queja ya están suprimidos: no se "degradan" a baja.
    await prisma.mailingContact.updateMany({
      where: { id: send.contactId, status: { notIn: SUPPRESSED } },
      data: { status: 'unsubscribed', unsubscribedAt: now, unsubscribeReason: reason ? String(reason).slice(0, 300) : null },
    })
  }
  if (await markFirst(send.id, 'unsubscribedAt', now)) await bumpCampaign(send.campaignId, 'unsubscribeCount')
  return send
}

/**
 * Evento de un proveedor (webhook). `type`: delivered | bounced | complained.
 * Rebote duro y queja SUPRIMEN al contacto en el proyecto: volver a mandarle a
 * una dirección que no existe o a alguien que marcó spam es lo que más castiga la
 * reputación del dominio. Un rebote temporal (casilla llena) solo se anota.
 */
async function applyProviderEvent({ projectId, messageId, type, bounceType }) {
  if (!messageId) return false
  const send = await prisma.mailingSend.findFirst({
    where: { projectId, providerMessageId: messageId },
    select: { id: true, campaignId: true, contactId: true },
  })
  if (!send) return false
  const now = new Date()

  if (type === 'delivered') {
    if (await markFirst(send.id, 'deliveredAt', now)) {
      await prisma.mailingSend.updateMany({ where: { id: send.id, status: 'sent' }, data: { status: 'delivered' } })
      await bumpCampaign(send.campaignId, 'deliveredCount')
    }
    return true
  }

  if (type === 'bounced') {
    const hard = !bounceType || /permanent|hard|undetermined/i.test(bounceType)
    if (!hard) {
      await prisma.mailingSend.update({ where: { id: send.id }, data: { bounceType: String(bounceType).slice(0, 60) } })
      return true
    }
    if (await markFirst(send.id, 'bouncedAt', now)) {
      await prisma.mailingSend.update({ where: { id: send.id }, data: { status: 'bounced', bounceType: bounceType ? String(bounceType).slice(0, 60) : 'hard' } })
      await bumpCampaign(send.campaignId, 'bounceCount')
      if (send.contactId) {
        await prisma.mailingContact.updateMany({
          where: { id: send.contactId, status: { in: ['subscribed', 'pending'] } },
          data: { status: 'bounced', bouncedAt: now },
        })
      }
    }
    return true
  }

  if (type === 'complained') {
    if (await markFirst(send.id, 'complainedAt', now)) {
      await prisma.mailingSend.update({ where: { id: send.id }, data: { status: 'complained' } })
      await bumpCampaign(send.campaignId, 'complaintCount')
      if (send.contactId) {
        await prisma.mailingContact.updateMany({
          where: { id: send.contactId, status: { not: 'complained' } },
          data: { status: 'complained', unsubscribedAt: now },
        })
      }
    }
    return true
  }
  return false
}

module.exports = { recordOpen, recordClick, unsubscribe, applyProviderEvent, findSendByToken, SUPPRESSED }
