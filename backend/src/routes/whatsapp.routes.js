const router = require('express').Router()
const multer  = require('multer')
const { auth } = require('../middleware/auth')
const { resolveWorkspace, salesGuard, workspaceAdminOnly } = require('../middleware/workspace')
const { requireFeatureFlag } = require('../lib/featureFlags')

const whatsapp = require('../controllers/whatsapp.controller')

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
router.get('/account',    whatsapp.getAccount)
router.post('/account',   workspaceAdminOnly, whatsapp.connectAccount)
router.delete('/account', workspaceAdminOnly, whatsapp.disconnectAccount)

router.get('/conversations',                 whatsapp.listConversations)
router.get('/conversations/:id/messages',    whatsapp.getMessages)
router.post('/conversations/:id/messages',   whatsapp.sendMessage)
router.post('/conversations/:id/media',      uploadFile, whatsapp.sendMedia)
router.post('/conversations/:id/read',       whatsapp.markRead)
router.patch('/conversations/:id/assign',    whatsapp.assignConversation)
router.patch('/conversations/:id/contact',   whatsapp.linkContact)
router.post('/conversations/:id/contact',    whatsapp.createContactFromConversation)
router.patch('/conversations/:id/bot',       whatsapp.toggleConversationBot)
router.post('/conversations/:id/reopen',     whatsapp.reopenConversation)

// Bot (Fase 4): la config es workspace-wide y tiene costo operativo real
// (tokens de IA por cada mensaje entrante) — solo admin/owner la edita, igual
// que conectar/desconectar la cuenta.
router.get('/bot',  whatsapp.getBotConfig)
router.put('/bot',  workspaceAdminOnly, whatsapp.saveBotConfig)

// Plantillas (Fase 5): catálogo de solo lectura de nuestro lado — sincronizar
// desde Chakra (con costo/aprobación real de Meta detrás) queda para admin,
// leerlas para elegir una y reabrir es operativo del día a día.
router.get('/templates',       whatsapp.listTemplates)
router.post('/templates/sync', workspaceAdminOnly, whatsapp.syncTemplates)

module.exports = router
