const router = require('express').Router()
const multer = require('multer')
const {
  listChannels, createChannel, updateChannel, updateChannelPrivacy, deleteChannel,
  listMessages, listPinned, searchMessages, sendMessage, sendMessageWithMedia, editMessage, deleteMessage, togglePin, toggleReaction,
  markRead, searchGifs, trendingGifs,
} = require('../controllers/chat.controller')
const { auth } = require('../middleware/auth')
const { resolveWorkspace, workspaceAdminOnly } = require('../middleware/workspace')

// Adjuntos del chat: mismo margen que ContentAsset (multer con un tope algo más
// generoso que el límite real de 10MB del controller, para que el error legible
// salga de ahí — ver ATTACHMENT_MAX_BYTES en chat.controller.js).
const ATTACHMENT_MULTER_MAX_MB = 12
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: ATTACHMENT_MULTER_MAX_MB * 1024 * 1024 } })

// Corre multer y traduce sus errores a respuestas claras (sin esto, exceder el
// límite cae en el handler global → 500). Mismo patrón que whatsapp.routes.js.
function uploadFile(req, res, next) {
  upload.single('file')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: `El archivo supera el máximo de ${ATTACHMENT_MULTER_MAX_MB} MB.` })
      }
      return res.status(400).json({ error: `No se pudo subir el archivo: ${err.message}` })
    }
    if (err) return next(err)
    next()
  })
}

router.use(auth)
router.use(resolveWorkspace)

// Canales: ver/participar es abierto a cualquier miembro activo del workspace
// (mismo criterio "equipo = etiqueta, no barrera" del acceso a proyectos), salvo
// que el canal puntual sea privado (isPrivate) — ahí solo entran admin/owner
// (chequeado dentro de cada controller, no acá, porque depende del canal).
// Crear/editar/eliminar es solo admin/owner, y solo aplica a canales custom
// (los de #general/proyecto se administran solos — ver chat.controller.js).
// El candado de privacidad, en cambio, es admin/owner sobre CUALQUIER canal.
router.get('/channels',           listChannels)
router.post('/channels',          workspaceAdminOnly, createChannel)
router.patch('/channels/:id',     workspaceAdminOnly, updateChannel)
router.patch('/channels/:id/privacy', workspaceAdminOnly, updateChannelPrivacy)
router.delete('/channels/:id',    workspaceAdminOnly, deleteChannel)

router.get('/channels/:id/messages',  listMessages)
router.get('/channels/:id/pinned',    listPinned)
router.get('/channels/:id/search',    searchMessages)
router.post('/channels/:id/messages', sendMessage)
router.post('/channels/:id/messages/media', uploadFile, sendMessageWithMedia)
router.post('/channels/:id/read',     markRead)

router.patch('/messages/:messageId',  editMessage)
router.delete('/messages/:messageId', deleteMessage)
router.patch('/messages/:messageId/pin', togglePin)
router.post('/messages/:messageId/reactions', toggleReaction)

router.get('/gifs/search',    searchGifs)
router.get('/gifs/trending',  trendingGifs)

module.exports = router
