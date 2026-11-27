const prisma = require('../lib/prisma')
const { emitTo } = require('../lib/socket')

// Salud del webhook de WhatsApp: detectar que Chakra dejó de mandar eventos.
//
// Los mensajes nuevos llegan SOLO por el webhook, y cuando Chakra deja de mandarlo
// nadie avisa: `WhatsappAccount.status` se pone en 'active' al conectar y nada lo
// vuelve a tocar. Pasó el 16/11/2026: 9 días sin mensajes con la cuenta
// "conectada", hasta que se sacó y se volvió a agregar el teléfono en Chakra.
//
// Estados (`WhatsappAccount.webhookHealth`), de menos a más grave:
//  - ok
//  - silent: no llega nada hace más de un día y, para el tráfico habitual de la
//    cuenta, ya deberían haber entrado varios mensajes. Es una sospecha.
//  - unconfirmed: mandamos mensajes (persona, bot, agente o automatización) a 2+
//    chats distintos y no llegó ningún evento después: Meta confirma cada envío
//    por el mismo webhook en segundos, así que es casi seguro que está caído.
//  - bad_signature: llegan eventos pero con firma inválida y se rechazan (se
//    cambió el Webhook Secret en Chakra y acá quedó el viejo). Lo marca el webhook.
//
// Quién cambia qué:
//  - El webhook, con cada evento válido, actualiza `lastWebhookAt` y vuelve a 'ok'.
//    Es la ÚNICA forma de salir de un estado malo: la prueba de que anda es que
//    llegue algo.
//  - El cron (`checkAllWebhookHealth`, cada 15 min) solo empeora el estado, nunca
//    lo mejora, y avisa en la campana a los admins una vez por episodio.

const MIN = 60 * 1000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

const RANK = { ok: 0, silent: 1, unconfirmed: 2, bad_signature: 3 }

// No escribir en la DB por cada evento: con la cuenta sana alcanza con refrescar
// `lastWebhookAt` una vez por minuto (las señales miran horas, no segundos).
const ALIVE_WRITE_EVERY_MS = MIN
// Margen para que llegue la confirmación de un envío antes de sospechar.
const UNCONFIRMED_GRACE_MS = 20 * MIN
const UNCONFIRMED_MIN_CHATS = 2
const SILENT_MIN_MS = DAY
const SILENT_BASELINE_DAYS = 14
const SILENT_MIN_EXPECTED = 5
// Una firma inválida aislada puede ser alguien probando el endpoint; avisar recién
// si persiste (un evento válido la limpia antes).
const BAD_SIGNATURE_NOTIFY_AFTER_MS = 15 * MIN

function healthPayload(account) {
  return {
    accountId: account.id,
    webhookHealth: account.webhookHealth,
    webhookHealthSince: account.webhookHealthSince,
    lastWebhookAt: account.lastWebhookAt,
  }
}

/**
 * Llegó un evento con firma válida. Best-effort: nunca rompe el webhook.
 * `account` es la fila completa que ya leyó el webhook.
 */
async function markWebhookAlive(account, now = new Date()) {
  try {
    const wasUnhealthy = Boolean(account.webhookHealth) && account.webhookHealth !== 'ok'
    const fresh = account.lastWebhookAt && (now - new Date(account.lastWebhookAt)) < ALIVE_WRITE_EVERY_MS
    if (!wasUnhealthy && fresh) return

    const updated = await prisma.whatsappAccount.update({
      where: { id: account.id },
      data: {
        lastWebhookAt: now,
        ...(wasUnhealthy ? { webhookHealth: 'ok', webhookHealthSince: null } : {}),
      },
    })
    if (!wasUnhealthy) return

    emitTo(`workspace:${account.workspaceId}`, 'whatsapp:health', healthPayload(updated))
    // El aviso de la campana ya no aplica: volvió a andar.
    await prisma.notification.updateMany({
      where: { workspaceId: account.workspaceId, type: 'WHATSAPP_CONNECTION', read: false },
      data: { read: true },
    })
  } catch (err) {
    console.error('[WhatsApp Health] Error marcando el webhook como vivo:', err.message)
  }
}

/** Llegó un evento con firma inválida (se rechazó). Best-effort. */
async function markBadSignature(account, now = new Date()) {
  try {
    if (account.webhookHealth === 'bad_signature') return
    const updated = await prisma.whatsappAccount.update({
      where: { id: account.id },
      data: { webhookHealth: 'bad_signature', webhookHealthSince: now },
    })
    emitTo(`workspace:${account.workspaceId}`, 'whatsapp:health', healthPayload(updated))
  } catch (err) {
    console.error('[WhatsApp Health] Error marcando firma inválida:', err.message)
  }
}

/**
 * Qué dicen las señales sobre la cuenta ahora. No mira el estado guardado salvo
 * bad_signature (esa la decide el webhook, acá no hay forma de verla).
 */
async function evaluateAccount(account, now = new Date()) {
  if (account.webhookHealth === 'bad_signature') return 'bad_signature'

  const since = new Date(account.lastWebhookAt || account.connectedAt)

  // Señal 1: envíos nuestros sin ningún evento posterior. `app_echo` no cuenta:
  // esos mensajes llegaron POR el webhook.
  const unconfirmed = await prisma.whatsappMessage.findMany({
    where: {
      conversation: { accountId: account.id },
      direction: 'out',
      senderType: { not: 'app_echo' },
      createdAt: { gt: since, lte: new Date(now - UNCONFIRMED_GRACE_MS) },
    },
    distinct: ['conversationId'],
    select: { conversationId: true },
    take: UNCONFIRMED_MIN_CHATS,
  })
  if (unconfirmed.length >= UNCONFIRMED_MIN_CHATS) return 'unconfirmed'

  // Señal 2: silencio más largo que lo normal para esta cuenta. La base son los
  // mensajes que llegaron por el webhook en los 14 días ANTERIORES al silencio
  // (contar el silencio mismo bajaría la base y lo escondería).
  const silenceMs = now - since
  if (silenceMs >= SILENT_MIN_MS) {
    const baseline = await prisma.whatsappMessage.count({
      where: {
        conversation: { accountId: account.id },
        createdAt: { gte: new Date(since - SILENT_BASELINE_DAYS * DAY), lte: since },
        OR: [{ direction: 'in' }, { senderType: 'app_echo' }],
      },
    })
    const expected = (baseline / SILENT_BASELINE_DAYS) * (silenceMs / DAY)
    if (expected >= SILENT_MIN_EXPECTED) return 'silent'
  }

  return 'ok'
}

function notificationMessage(account, health) {
  const phone = account.displayPhoneNumber || account.phoneNumberId
  if (health === 'bad_signature') {
    return `El WhatsApp ${phone} está rechazando mensajes por firma inválida. Revisá que el Webhook Secret cargado coincida con el de Chakra.`
  }
  if (health === 'unconfirmed') {
    return `El WhatsApp ${phone} dejó de recibir mensajes: lo que se manda no recibe confirmación de entrega. Revisá la conexión del número en Chakra.`
  }
  return `El WhatsApp ${phone} no recibe mensajes hace más de lo habitual. Puede que se haya desconectado: revisá el número en Chakra.`
}

async function notifyAdmins(account, health) {
  const admins = await prisma.workspaceMember.findMany({
    where: { workspaceId: account.workspaceId, active: true, role: { in: ['admin', 'owner'] } },
    select: { userId: true },
  })
  if (admins.length === 0) return
  const message = notificationMessage(account, health)
  await prisma.notification.createMany({
    data: admins.map(({ userId }) => ({
      userId, workspaceId: account.workspaceId, type: 'WHATSAPP_CONNECTION', message,
    })),
  })
  for (const { userId } of admins) emitTo(`user:${userId}`, 'notification:new', { type: 'WHATSAPP_CONNECTION' })
}

/** Una cuenta: aplica la transición (solo hacia peor) y avisa una vez por episodio. */
async function checkAccount(account, now = new Date()) {
  const current = account.webhookHealth || 'ok'
  const evaluated = await evaluateAccount(account, now)
  let next = account
  if (RANK[evaluated] > RANK[current]) {
    next = await prisma.whatsappAccount.update({
      where: { id: account.id },
      data: {
        webhookHealth: evaluated,
        // Un episodio empieza al salir de 'ok'; empeorar dentro del mismo episodio
        // (silent → unconfirmed) no lo reinicia, así no se vuelve a avisar.
        ...(current === 'ok' ? { webhookHealthSince: now } : {}),
      },
    })
    emitTo(`workspace:${account.workspaceId}`, 'whatsapp:health', healthPayload(next))
  }

  const health = next.webhookHealth || 'ok'
  if (health === 'ok' || !next.webhookHealthSince) return health
  const since = new Date(next.webhookHealthSince)
  const alreadyNotified = next.webhookHealthNotifiedAt && new Date(next.webhookHealthNotifiedAt) >= since
  if (alreadyNotified) return health
  if (health === 'bad_signature' && (now - since) < BAD_SIGNATURE_NOTIFY_AFTER_MS) return health

  await notifyAdmins(next, health)
  await prisma.whatsappAccount.update({
    where: { id: account.id },
    data: { webhookHealthNotifiedAt: now },
  })
  return health
}

/** Cron: todas las cuentas. Cada una aislada — un error no corta las demás. */
async function checkAllWebhookHealth(now = new Date()) {
  const accounts = await prisma.whatsappAccount.findMany()
  for (const account of accounts) {
    try {
      await checkAccount(account, now)
    } catch (err) {
      console.error(`[WhatsApp Health] Error revisando la cuenta ${account.id}:`, err.message)
    }
  }
}

module.exports = {
  markWebhookAlive,
  markBadSignature,
  evaluateAccount,
  checkAccount,
  checkAllWebhookHealth,
  healthPayload,
}
