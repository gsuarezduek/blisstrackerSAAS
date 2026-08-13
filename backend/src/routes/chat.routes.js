const router = require('express').Router()
const {
  listChannels, createChannel, updateChannel, deleteChannel,
  listMessages, sendMessage, editMessage, deleteMessage,
  markRead, searchGifs, trendingGifs,
} = require('../controllers/chat.controller')
const { auth } = require('../middleware/auth')
const { resolveWorkspace, workspaceAdminOnly } = require('../middleware/workspace')

router.use(auth)
router.use(resolveWorkspace)

// Canales: ver/participar es abierto a cualquier miembro activo del workspace
// (mismo criterio "equipo = etiqueta, no barrera" del acceso a proyectos).
// Crear/editar/eliminar es solo admin/owner, y solo aplica a canales custom
// (los de #general/proyecto se administran solos — ver chat.controller.js).
router.get('/channels',           listChannels)
router.post('/channels',          workspaceAdminOnly, createChannel)
router.patch('/channels/:id',     workspaceAdminOnly, updateChannel)
router.delete('/channels/:id',    workspaceAdminOnly, deleteChannel)

router.get('/channels/:id/messages',  listMessages)
router.post('/channels/:id/messages', sendMessage)
router.post('/channels/:id/read',     markRead)

router.patch('/messages/:messageId',  editMessage)
router.delete('/messages/:messageId', deleteMessage)

router.get('/gifs/search',    searchGifs)
router.get('/gifs/trending',  trendingGifs)

module.exports = router
