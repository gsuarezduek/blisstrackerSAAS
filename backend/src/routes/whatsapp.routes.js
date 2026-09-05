const router = require('express').Router()
const multer  = require('multer')
const { auth } = require('../middleware/auth')
const { resolveWorkspace, salesGuard, workspaceAdminOnly } = require('../middleware/workspace')
const { requireFeatureFlag } = require('../lib/featureFlags')

const account = require('../controllers/whatsapp/account.controller')
const conversations = require('../controllers/whatsapp/conversations.controller')
const bot = require('../controllers/whatsapp/bot.controller')
const templates = require('../controllers/whatsapp/templates.controller')
const automation = require('../controllers/whatsappAutomation.controller')

// MVP: 16MB cubre imagen/audio/video reales de WhatsApp; documentos grandes
// (Meta permite hasta 100MB) no están soportados por este endpoint todavía —
// ver nota en whatsapp.controller.js sendMedia.
const MEDIA_MAX_MB = 16
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MEDIA_MAX_MB * 1024 * 1024 } })

// Corre multer y traduce sus errores a respuestas claras (sin esto, exceder el
// límite cae en el handler global → 500). Mismo patrón que profile.routes.js.
function uploadFile(req, res, next) {
  upload.single('file')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: `El archivo supera el máximo de ${MEDIA_MAX_MB} MB.` })
      }
      return res.status(400).json({ error: `No se pudo subir el archivo: ${err.message}` })
    }
    if (err) return next(err)
    next()
  })
}

// Todo el módulo requiere: autenticación + workspace + acceso al equipo
// comercial (mismo criterio que Ventas) + el feature flag `whatsapp` propio
// (independiente de `ventas` por su costo operativo real — BSP + tokens IA).
router.use(auth)
router.use(resolveWorkspace)
router.use(salesGuard)
router.use(requireFeatureFlag('whatsapp'))

// Conectar/desconectar quedan solo para admin/owner: son credenciales sensibles
// del BSP, no una acción operativa del día a día del equipo comercial.
router.get('/account',    account.getAccount)
router.post('/account',   workspaceAdminOnly, account.connectAccount)
router.delete('/account', workspaceAdminOnly, account.disconnectAccount)

router.get('/conversations',                 conversations.listConversations)
router.get('/conversations/:id/messages',    conversations.getMessages)
router.post('/conversations/:id/messages',   conversations.sendMessage)
router.post('/conversations/:id/media',      uploadFile, conversations.sendMedia)
router.post('/conversations/:id/read',       conversations.markRead)
router.patch('/conversations/:id/assign',    conversations.assignConversation)
router.patch('/conversations/:id/contact',   conversations.linkContact)
router.post('/conversations/:id/contact',    conversations.createContactFromConversation)
router.patch('/conversations/:id/bot',       conversations.toggleConversationBot)
router.post('/conversations/:id/reopen',     templates.reopenConversation)

// Bot (Fase 4): la config es workspace-wide y tiene costo operativo real
// (tokens de IA por cada mensaje entrante), pero es una herramienta operativa
// del día a día del equipo comercial — abierta a cualquiera con salesGuard
// (admin/owner o equipo comercial), no solo admin/owner. Lo que sigue
// admin-only es conectar/desconectar la cuenta (credenciales del BSP).
router.get('/bot',  bot.getBotConfig)
router.put('/bot',  bot.saveBotConfig)
router.post('/bot/test', bot.testBotConfig)

// Base de conocimiento del bot (documentos de contexto) — mismo criterio que
// el resto de la config del bot: abierto al equipo comercial.
router.get('/bot/documents',       bot.listBotDocuments)
router.post('/bot/documents',      uploadFile, bot.uploadBotDocument)
router.delete('/bot/documents/:id', bot.deleteBotDocument)

// Panel de calidad: casos donde el bot escaló a un humano.
router.get('/bot/escalations', bot.listBotEscalations)

// Plantillas (Fase 5): catálogo de solo lectura de nuestro lado. Sincronizar
// desde Chakra tiene costo/aprobación real de Meta detrás, pero sigue siendo
// una acción operativa del equipo comercial (no una credencial sensible como
// conectar la cuenta), así que queda abierta con salesGuard igual que el bot.
router.get('/templates',       templates.listTemplates)
router.post('/templates',      templates.createTemplate)
router.post('/templates/sync', templates.syncTemplates)
router.delete('/templates/:id', templates.deleteTemplate)

// Motor de reglas de reactivación (extiende Fase 5): criterios configurables
// que reabren conversaciones vencidas solas, vía cron diario — mismo criterio
// que el bot/plantillas: abierto al equipo comercial, no solo admin/owner.
router.get('/automation-rules',              automation.listRules)
router.post('/automation-rules',             automation.createRule)
router.patch('/automation-rules/:id',        automation.updateRule)
router.delete('/automation-rules/:id',       automation.deleteRule)
router.post('/automation-rules/:id/run-now', automation.runRuleNow)

module.exports = router
