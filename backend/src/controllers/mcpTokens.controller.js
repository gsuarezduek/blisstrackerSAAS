const crypto = require('crypto')
const prisma = require('../lib/prisma')
const { generateToken } = require('../lib/mcpTokens')
const { assertPublicUrl } = require('../lib/safeUrl')
const { encrypt } = require('../lib/encryption')
const { DEFAULT_MODEL } = require('../services/agentWake.service')

// Autoadministración de tokens de McpToken desde el propio perfil del usuario
// (Preferencias → Agentes IA) — a diferencia de backend/scripts/mcp-*-token.js
// (uso interno/ops), acá cada usuario gestiona SOLO sus propios tokens en el
// workspace actual (req.user.userId + req.workspace.id), sin pasar por un admin.

// `webhookSecret` SÍ viaja: sin verlo no se puede verificar la firma del otro lado, y
// quien lee esto es el dueño del token (que ya tiene el Bearer, bastante más sensible).
const TOKEN_SELECT = {
  id: true, label: true, createdAt: true, lastUsedAt: true, revokedAt: true, workReminderMins: true,
  webhookUrl: true, webhookSecret: true, webhookLastAt: true, webhookLastStatus: true,
  wakeEnabled: true, wakeLastAt: true, wakeLastStatus: true,
  // Intentos rechazados que SÍ se pueden atribuir a este token (ver
  // services/mcpAuthFailure.service.js): un conector que quedó apuntando a un token
  // revocado. Los rechazos por un valor que no coincide con ningún hash son anónimos
  // y no cuelgan de ninguna fila, así que no aparecen acá.
  authFailures: {
    select: { attempts: true, firstAt: true, lastAt: true, ip: true, userAgent: true },
    orderBy: { lastAt: 'desc' },
    take: 1,
  },
}

// Opciones del recordatorio de "registrá en qué estás trabajando" (ver mcp/workReminder.js).
const WORK_REMINDER_OPTIONS = [0, 15, 30, 60, 120, 240]

async function listMine(req, res, next) {
  try {
    const tokens = await prisma.mcpToken.findMany({
      where: { userId: req.user.userId, workspaceId: req.workspace.id },
      select: TOKEN_SELECT,
      orderBy: { createdAt: 'desc' },
    })
    res.json(tokens)
  } catch (err) { next(err) }
}

async function createMine(req, res, next) {
  try {
    const label = typeof req.body?.label === 'string' ? req.body.label.trim().slice(0, 120) : ''
    const { token, tokenHash } = generateToken()

    const row = await prisma.mcpToken.create({
      data: { workspaceId: req.workspace.id, userId: req.user.userId, tokenHash, label: label || null },
      select: TOKEN_SELECT,
    })

    // El valor en claro se devuelve UNA sola vez — no queda persistido (solo su hash).
    res.status(201).json({ ...row, token })
  } catch (err) { next(err) }
}

async function revokeMine(req, res, next) {
  try {
    const id = Number(req.params.id)
    const row = await prisma.mcpToken.findUnique({ where: { id } })
    if (!row || row.userId !== req.user.userId || row.workspaceId !== req.workspace.id) {
      return res.status(404).json({ error: 'Token no encontrado' })
    }
    if (!row.revokedAt) {
      await prisma.mcpToken.update({ where: { id }, data: { revokedAt: new Date() } })
    }
    res.json({ ok: true })
  } catch (err) { next(err) }
}

// PATCH /api/mcp-tokens/:id — config de ese agente. Campos independientes, se manda
// solo el que cambia:
//   { workReminderMins } — cada cuánto se le recuerda registrar en qué trabaja (0 = nunca)
//   { webhookUrl }       — a dónde avisarle cuando hay una novedad ('' o null = sin webhook)
//   { wakeEnabled }      — si el backend lo invoca por la API del proveedor
async function updateMine(req, res, next) {
  try {
    const id = Number(req.params.id)
    const row = await prisma.mcpToken.findUnique({ where: { id } })
    if (!row || row.userId !== req.user.userId || row.workspaceId !== req.workspace.id) {
      return res.status(404).json({ error: 'Token no encontrado' })
    }

    const data = {}

    if (req.body?.workReminderMins !== undefined) {
      const mins = Number(req.body.workReminderMins)
      if (!WORK_REMINDER_OPTIONS.includes(mins)) {
        return res.status(400).json({ error: `workReminderMins tiene que ser uno de: ${WORK_REMINDER_OPTIONS.join(', ')}` })
      }
      data.workReminderMins = mins
    }

    if (req.body?.webhookUrl !== undefined) {
      const raw = typeof req.body.webhookUrl === 'string' ? req.body.webhookUrl.trim() : ''
      if (!raw) {
        // Sacar el webhook se lleva el secret: si mañana se configura otra URL, es otro
        // receptor y tiene que ser otro secret.
        Object.assign(data, { webhookUrl: null, webhookSecret: null, webhookLastAt: null, webhookLastStatus: null })
      } else {
        // Se valida acá y de nuevo al enviar (una IP puede cambiar entre una cosa y la
        // otra — SSRF por DNS rebinding, ver agentWebhook.service.js).
        try {
          await assertPublicUrl(raw)
        } catch (e) {
          return res.status(400).json({ error: `URL no permitida: ${e.message}` })
        }
        data.webhookUrl = raw
        // El secret se genera una vez y se conserva al cambiar de URL dentro del mismo
        // receptor: si se regenerara, habría que ir a actualizarlo del otro lado.
        if (!row.webhookSecret) data.webhookSecret = crypto.randomBytes(32).toString('hex')
      }
    }

    if (req.body?.wakeEnabled !== undefined) data.wakeEnabled = !!req.body.wakeEnabled

    if (!Object.keys(data).length) return res.status(400).json({ error: 'Nada que actualizar' })

    const updated = await prisma.mcpToken.update({ where: { id }, data, select: TOKEN_SELECT })
    res.json(updated)
  } catch (err) { next(err) }
}

// ─── Despertador: config del workspace ───────────────────────────────────────
// La API key del proveedor (hoy xAI) la paga el workspace, así que vive en Workspace y
// la toca solo un admin/owner — a diferencia del resto de esta pantalla, que es
// self-service. Nunca se devuelve: solo si está puesta o no.

async function getWakeConfig(req, res, next) {
  try {
    const ws = await prisma.workspace.findUnique({
      where: { id: req.workspace.id },
      select: { agentWakeApiKey: true, agentWakeModel: true },
    })
    res.json({
      configured: !!ws?.agentWakeApiKey,
      model: ws?.agentWakeModel || DEFAULT_MODEL,
      defaultModel: DEFAULT_MODEL,
      canEdit: ['admin', 'owner'].includes(req.workspaceMember?.role),
    })
  } catch (err) { next(err) }
}

// PUT /api/mcp-tokens/wake-config  { apiKey?, model? } — apiKey '' borra la guardada.
async function saveWakeConfig(req, res, next) {
  try {
    const data = {}
    if (req.body?.apiKey !== undefined) {
      const raw = typeof req.body.apiKey === 'string' ? req.body.apiKey.trim() : ''
      // Cifrada con AES-256-GCM, mismo mecanismo que los tokens de ProjectIntegration y
      // las credenciales de ProjectAccess: en claro no queda en la DB.
      data.agentWakeApiKey = raw ? encrypt(raw) : null
    }
    if (req.body?.model !== undefined) {
      const m = typeof req.body.model === 'string' ? req.body.model.trim().slice(0, 80) : ''
      data.agentWakeModel = m || null
    }
    if (!Object.keys(data).length) return res.status(400).json({ error: 'Nada que actualizar' })

    await prisma.workspace.update({ where: { id: req.workspace.id }, data })
    // Apagar la key deja a los agentes con `wakeEnabled` sin forma de arrancar: el
    // despertador lo registra en `wakeLastStatus` la próxima vez que haya una novedad.
    res.json({ ok: true })
  } catch (err) { next(err) }
}

module.exports = { listMine, createMine, revokeMine, updateMine, getWakeConfig, saveWakeConfig, WORK_REMINDER_OPTIONS }
