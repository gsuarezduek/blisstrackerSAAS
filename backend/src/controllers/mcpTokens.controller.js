const prisma = require('../lib/prisma')
const { generateToken } = require('../lib/mcpTokens')

// Autoadministración de tokens de McpToken desde el propio perfil del usuario
// (Preferencias → Agentes IA) — a diferencia de backend/scripts/mcp-*-token.js
// (uso interno/ops), acá cada usuario gestiona SOLO sus propios tokens en el
// workspace actual (req.user.userId + req.workspace.id), sin pasar por un admin.

const TOKEN_SELECT = { id: true, label: true, createdAt: true, lastUsedAt: true, revokedAt: true, workReminderMins: true }

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

// PATCH /api/mcp-tokens/:id  { workReminderMins } — cada cuánto se le recuerda a ese
// agente que registre en qué está trabajando (0 = nunca).
async function updateMine(req, res, next) {
  try {
    const id = Number(req.params.id)
    const row = await prisma.mcpToken.findUnique({ where: { id } })
    if (!row || row.userId !== req.user.userId || row.workspaceId !== req.workspace.id) {
      return res.status(404).json({ error: 'Token no encontrado' })
    }
    const mins = Number(req.body?.workReminderMins)
    if (!WORK_REMINDER_OPTIONS.includes(mins)) {
      return res.status(400).json({ error: `workReminderMins tiene que ser uno de: ${WORK_REMINDER_OPTIONS.join(', ')}` })
    }
    const updated = await prisma.mcpToken.update({ where: { id }, data: { workReminderMins: mins }, select: TOKEN_SELECT })
    res.json(updated)
  } catch (err) { next(err) }
}

module.exports = { listMine, createMine, revokeMine, updateMine, WORK_REMINDER_OPTIONS }
