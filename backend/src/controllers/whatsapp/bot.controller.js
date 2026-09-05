const prisma = require('../../lib/prisma')
const { DEFAULT_PROMPT, DEFAULT_HANDOFF_MESSAGE, generateBotReply, buildTranscript, listEscalations } = require('../../services/whatsappBot.service')
const botDocuments = require('../../services/whatsappBotDocument.service')

/**
 * GET /api/whatsapp/bot
 * Config del bot del workspace (Fase 4 del plan) — siempre devuelve algo,
 * aunque nunca se haya guardado (fila inexistente = bot deshabilitado con el
 * prompt default, para que el frontend tenga un placeholder editable).
 */
async function getBotConfig(req, res, next) {
  try {
    const config = await prisma.whatsappBotConfig.findUnique({ where: { workspaceId: req.workspace.id } })
    res.json(config || { enabled: false, onlyNewConversations: false, prompt: DEFAULT_PROMPT, blockedWords: [], escalationWords: [], examples: [], handoffMessage: DEFAULT_HANDOFF_MESSAGE })
  } catch (err) { next(err) }
}

const MAX_WORDS_PER_LIST = 50
const MAX_WORD_LENGTH = 100
const MAX_EXAMPLES = 20
const MAX_EXAMPLE_FIELD_LENGTH = 500

// Arrays de strings cargados a mano por el admin (blockedWords/escalationWords)
// — trim, descarta vacíos, corta longitud/cantidad para no permitir un abuso
// (ni un array gigante que infle el prompt de cada mensaje del bot).
function sanitizeWordList(input) {
  if (!Array.isArray(input)) return []
  return input
    .map(w => String(w || '').trim().slice(0, MAX_WORD_LENGTH))
    .filter(Boolean)
    .slice(0, MAX_WORDS_PER_LIST)
}

// Ejemplos few-shot { question, answer } — mismo criterio que sanitizeWordList:
// trim, descarta pares incompletos, corta longitud/cantidad.
function sanitizeExamples(input) {
  if (!Array.isArray(input)) return []
  return input
    .map(e => ({
      question: String(e?.question || '').trim().slice(0, MAX_EXAMPLE_FIELD_LENGTH),
      answer: String(e?.answer || '').trim().slice(0, MAX_EXAMPLE_FIELD_LENGTH),
    }))
    .filter(e => e.question && e.answer)
    .slice(0, MAX_EXAMPLES)
}

/**
 * PUT /api/whatsapp/bot  { enabled, onlyNewConversations?, prompt, blockedWords?, escalationWords?, examples?, handoffMessage? }
 * Abierto a cualquier miembro del equipo comercial (ver whatsapp.routes.js,
 * salesGuard) — es un interruptor con costo operativo real (tokens de IA por
 * cada mensaje entrante mientras esté on), pero configurarlo es operativo del
 * día a día, no una credencial sensible como conectar la cuenta.
 */
async function saveBotConfig(req, res, next) {
  try {
    const { enabled, onlyNewConversations, prompt, blockedWords, escalationWords, examples, handoffMessage } = req.body
    const data = {
      enabled: Boolean(enabled),
      onlyNewConversations: Boolean(onlyNewConversations),
      prompt: prompt?.trim() || null,
      blockedWords: sanitizeWordList(blockedWords),
      escalationWords: sanitizeWordList(escalationWords),
      examples: sanitizeExamples(examples),
      handoffMessage: handoffMessage?.trim().slice(0, 500) || null,
    }
    const config = await prisma.whatsappBotConfig.upsert({
      where: { workspaceId: req.workspace.id },
      update: data,
      create: { workspaceId: req.workspace.id, ...data },
    })
    res.json(config)
  } catch (err) { next(err) }
}

/**
 * POST /api/whatsapp/bot/test  { config: {prompt, blockedWords?, escalationWords?, examples?, handoffMessage?}, messages: [{role, text}] }
 * Playground de prueba: corre `generateBotReply` con la config del FORMULARIO
 * (no la guardada en DB) contra una transcripción armada en el frontend, sin
 * persistir nada ni mandar nada por WhatsApp real — para poder iterar el
 * prompt/reglas antes de "Guardar". Sigue gastando tokens reales (respeta el
 * presupuesto del workspace vía createMessage/assertTokenBudget).
 */
async function testBotConfig(req, res, next) {
  try {
    const { config, messages } = req.body
    if (!config || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Falta config o messages' })
    }
    const safeConfig = {
      prompt: config.prompt || null,
      blockedWords: sanitizeWordList(config.blockedWords),
      escalationWords: sanitizeWordList(config.escalationWords),
      examples: sanitizeExamples(config.examples),
      handoffMessage: config.handoffMessage || null,
    }
    const history = messages.map(m => ({
      direction: m.role === 'cliente' ? 'in' : 'out',
      content: String(m.text || '').slice(0, 2000),
      senderType: m.role === 'cliente' ? 'contact' : 'bot',
    }))
    const transcript = buildTranscript(history)
    const lastClientMessage = [...history].reverse().find(m => m.direction === 'in')?.content || ''

    const result = await generateBotReply({
      workspaceId: req.workspace.id, config: safeConfig, transcript, contact: null, lastClientMessage,
    })
    if (!result?.replyText) return res.status(502).json({ error: 'No se pudo generar una respuesta de prueba (revisá el presupuesto de IA del workspace).' })
    res.json(result)
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message, code: err.code })
    next(err)
  }
}

/** GET /api/whatsapp/bot/documents — lista la base de conocimiento del bot. */
async function listBotDocuments(req, res, next) {
  try {
    res.json(await botDocuments.listDocuments(req.workspace.id))
  } catch (err) { next(err) }
}

/**
 * POST /api/whatsapp/bot/documents — sube un PDF/DOCX/TXT como contexto del
 * bot (multipart, campo "file" — mismo middleware `uploadFile` que /media,
 * ver whatsapp.routes.js). Extrae el texto una sola vez acá, no en cada mensaje.
 */
async function uploadBotDocument(req, res, next) {
  try {
    if (!req.file) return res.status(400).json({ error: 'Archivo requerido' })
    const doc = await botDocuments.uploadDocument({
      workspaceId: req.workspace.id,
      uploadedById: req.user.userId,
      buffer: req.file.buffer,
      originalName: req.file.originalname,
    })
    res.status(201).json(doc)
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message })
    next(err)
  }
}

/** DELETE /api/whatsapp/bot/documents/:id */
async function deleteBotDocument(req, res, next) {
  try {
    const doc = await botDocuments.deleteDocument(req.workspace.id, req.params.id)
    if (!doc) return res.status(404).json({ error: 'Documento no encontrado' })
    res.json({ ok: true })
  } catch (err) { next(err) }
}

/**
 * GET /api/whatsapp/bot/escalations — panel de calidad: últimos casos donde
 * el bot pasó una conversación a un humano (baja confianza, escalationWords
 * del cliente, o blockedWords persistentes), para revisar patrones reales y
 * ajustar prompt/reglas en base a eso.
 */
async function listBotEscalations(req, res, next) {
  try {
    res.json(await listEscalations(req.workspace.id))
  } catch (err) { next(err) }
}

module.exports = {
  getBotConfig, saveBotConfig, testBotConfig,
  listBotDocuments, uploadBotDocument, deleteBotDocument, listBotEscalations,
}
