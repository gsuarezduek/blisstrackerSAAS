const prisma = require('../../lib/prisma')
const { encrypt } = require('../../lib/encryption')

function publicAccount(account) {
  if (!account) return null
  // Nunca devolver accessToken/webhookSecret al frontend — mismo criterio que
  // ProjectIntegration (nunca expone el token, solo estado/metadata).
  const { accessToken, webhookSecret, ...rest } = account
  return { ...rest, hasAccessToken: Boolean(accessToken), hasWebhookSecret: Boolean(webhookSecret) }
}

/**
 * POST /api/whatsapp/account
 * Conecta el número de WhatsApp del workspace pegando las credenciales
 * obtenidas del dashboard del BSP (hoy: Chakra) — mismo patrón que el "Token
 * de Business Manager" ya usado para Meta Ads/Instagram/Facebook, no un
 * redirect OAuth, porque el embedded signup multi-tenant de Chakra no está
 * confirmado (ver Fase 1 del plan de WhatsApp).
 */
async function connectAccount(req, res, next) {
  try {
    const { id, wabaId, phoneNumberId, displayPhoneNumber, pluginId, accessToken, webhookSecret } = req.body
    // pluginId es obligatorio para poder enviar mensajes: el endpoint de envío
    // de Chakra lo requiere como parte de la URL (ver lib/whatsappProvider/chakra.js
    // messagesUrl), confirmado contra su documentación real — sin esto se puede
    // conectar y recibir, pero no responder.
    if (!phoneNumberId || !pluginId) {
      return res.status(400).json({ error: 'phoneNumberId y pluginId son obligatorios' })
    }

    // Editar (viene `id`) identifica la fila por su PK, no por phoneNumberId —
    // así se puede corregir un phoneNumberId cargado mal (ej. el número en
    // formato legible en vez del ID técnico) sin crear una fila duplicada.
    // Conectar por primera vez sigue buscando por phoneNumberId (evita
    // duplicar si se reenvía el mismo alta dos veces).
    const existing = id
      ? await prisma.whatsappAccount.findFirst({ where: { id: Number(id), workspaceId: req.workspace.id } })
      : await prisma.whatsappAccount.findUnique({
          where: { workspaceId_phoneNumberId: { workspaceId: req.workspace.id, phoneNumberId } },
        })
    if (id && !existing) return res.status(404).json({ error: 'Cuenta no encontrada' })
    // accessToken solo es obligatorio para conectar por primera vez — al editar
    // una cuenta ya conectada dejarlo vacío conserva el token cifrado que ya
    // había, no lo pisa con vacío.
    if (!existing && !accessToken) {
      return res.status(400).json({ error: 'accessToken es obligatorio para conectar por primera vez' })
    }

    const baseData = {
      wabaId: wabaId || null,
      phoneNumberId,
      displayPhoneNumber: displayPhoneNumber || null,
      pluginId,
      status: 'active',
      connectedById: req.user.userId,
      connectedAt: new Date(),
    }

    const account = existing
      ? await prisma.whatsappAccount.update({
          where: { id: existing.id },
          data: {
            ...baseData,
            ...(accessToken ? { accessToken: encrypt(accessToken) } : {}),
            ...(webhookSecret ? { webhookSecret: encrypt(webhookSecret) } : {}),
          },
        })
      : await prisma.whatsappAccount.create({
          data: {
            workspaceId: req.workspace.id,
            ...baseData,
            accessToken: encrypt(accessToken),
            webhookSecret: webhookSecret ? encrypt(webhookSecret) : null,
          },
        })

    res.status(201).json(publicAccount(account))
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'Ese wabaId o phoneNumberId ya está conectado en otro workspace' })
    }
    next(err)
  }
}

/** GET /api/whatsapp/account */
async function getAccount(req, res, next) {
  try {
    const account = await prisma.whatsappAccount.findFirst({ where: { workspaceId: req.workspace.id } })
    res.json(publicAccount(account))
  } catch (err) { next(err) }
}

/** DELETE /api/whatsapp/account */
async function disconnectAccount(req, res, next) {
  try {
    const account = await prisma.whatsappAccount.findFirst({ where: { workspaceId: req.workspace.id } })
    if (!account) return res.status(404).json({ error: 'No hay ninguna cuenta conectada' })
    await prisma.whatsappAccount.delete({ where: { id: account.id } })
    res.json({ ok: true })
  } catch (err) { next(err) }
}

module.exports = { connectAccount, getAccount, disconnectAccount }
