const router = require('express').Router()
const {
  listChannels, createChannel, updateChannel, updateChannelPrivacy, deleteChannel,
  listMessages, listPinned, sendMessage, editMessage, deleteMessage, togglePin,
  markRead, searchGifs, trendingGifs,
} = require('../controllers/chat.controller')
const { auth } = require('../middleware/auth')
const { resolveWorkspace, workspaceAdminOnly } = require('../middleware/workspace')

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
router.post('/channels/:id/messages', sendMessage)
router.post('/channels/:id/read',     markRead)

router.patch('/messages/:messageId',  editMessage)
router.delete('/messages/:messageId', deleteMessage)
router.patch('/messages/:messageId/pin', togglePin)

router.get('/gifs/search',    searchGifs)
router.get('/gifs/trending',  trendingGifs)

module.exports = router
