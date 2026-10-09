const prisma = require('../../lib/prisma')
const { createMessage } = require('../../lib/claude')
const { parseAIJson } = require('../../utils/parseAIJson')
const { fmtAuditMoney, fmtAuditDate } = require('../../lib/financeAudit')
const { getOpenTasks } = require('./tasks.controller')

const COOLDOWN_MS = 60 * 60 * 1000 // 1h, mismo criterio que el insight diario

// GET /api/finanzas/ai-summary — sección 4.6 "Resumen de la semana" (cacheado).
async function getSummary(req, res, next) {
  try {
    const summary = await prisma.financeAiSummary.findUnique({ where: { workspaceId: req.workspace.id } })
    res.json(summary ? { content: summary.content, generatedAt: summary.generatedAt } : null)
  } catch (err) { next(err) }
}

// POST /api/finanzas/ai-summary/refresh — regenera (cooldown 1h).
async function refreshSummary(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const existing = await prisma.financeAiSummary.findUnique({ where: { workspaceId } })
    if (existing) {
      const elapsedMs = Date.now() - new Date(existing.generatedAt).getTime()
      if (elapsedMs < COOLDOWN_MS) {
        const waitMins = Math.ceil((COOLDOWN_MS - elapsedMs) / 60000)
        return res.status(429).json({ error: `Esperá ${waitMins} minuto(s) para regenerar el resumen.`, waitMins })
      }
    }

    const tasks = await getOpenTasks(workspaceId)
    if (tasks.length === 0) {
      const content = 'No hay pendientes abiertos esta semana.'
      const summary = await prisma.financeAiSummary.upsert({
        where: { workspaceId }, update: { content, generatedAt: new Date() }, create: { workspaceId, content, generatedAt: new Date() },
      })
      return res.json({ content: summary.content, generatedAt: summary.generatedAt })
    }

    // Datos ya calculados por reglas — la IA SOLO redacta, nunca calcula ni
    // inventa números (sección 4.6 del spec).
    const tasksBlock = tasks.map(t => {
      const parts = [`- ${t.title}`]
      if (t.amount != null) parts.push(`(${fmtAuditMoney(t.amount)})`)
      if (t.date) parts.push(`· fecha: ${fmtAuditDate(t.date)}`)
      return parts.join(' ')
    }).join('\n')

    const msg = await createMessage({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      system: 'Sos un asistente financiero que redacta un resumen semanal corto para el dueño de una agencia. ÚNICAMENTE usás los datos que te pasan (títulos, montos, fechas) — nunca calculás totales ni inventás números. Priorizá lo más urgente primero (vencido > por vencer > el resto). Español rioplatense, tono directo y breve (2-4 oraciones), sin bullets ni markdown. Devolvé SOLO un objeto JSON válido: {"resumen": "..."}',
      messages: [{ role: 'user', content: `Pendientes de Finanzas de esta semana:\n${tasksBlock}` }],
    }, { workspaceId, source: 'finance_pendientes_summary', userId: req.user.userId })

    const textBlock = msg.content.find(b => b.type === 'text')
    let content
    try {
      content = parseAIJson(textBlock.text).resumen
    } catch {
      content = textBlock.text.trim() // fallback: texto crudo si no vino como JSON
    }

    const summary = await prisma.financeAiSummary.upsert({
      where: { workspaceId }, update: { content, generatedAt: new Date() }, create: { workspaceId, content, generatedAt: new Date() },
    })
    res.json({ content: summary.content, generatedAt: summary.generatedAt })
  } catch (err) { next(err) }
}

module.exports = { getSummary, refreshSummary }
