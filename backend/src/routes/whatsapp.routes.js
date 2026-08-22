const router = require('express').Router()
const { auth } = require('../middleware/auth')
const { resolveWorkspace, salesGuard, workspaceAdminOnly } = require('../middleware/workspace')
const { requireFeatureFlag } = require('../lib/featureFlags')

const whatsapp = require('../controllers/whatsapp.controller')

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
router.post('/conversations/:id/read',       whatsapp.markRead)
router.patch('/conversations/:id/assign',    whatsapp.assignConversation)
router.patch('/conversations/:id/contact',   whatsapp.linkContact)
router.post('/conversations/:id/contact',    whatsapp.createContactFromConversation)

module.exports = router
