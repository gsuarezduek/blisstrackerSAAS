const express = require('express')
const router = express.Router()
const { auth } = require('../middleware/auth')
const { resolveWorkspace, workspaceAdminOnly } = require('../middleware/workspace')
const c = require('../controllers/workspace.controller')

// Rutas públicas (sin auth)
router.post('/',          c.createWorkspace)
router.get('/check-slug', c.checkSlug)
router.get('/info',       c.getInfo)

// Rutas públicas de invitaciones
router.get('/invitations/:token', c.getInvitation)
router.post('/join',              c.joinWorkspace)

// Rutas autenticadas SIN workspace (solo auth)
router.get('/mine', auth, c.getMine)

// Rutas autenticadas + workspace
router.use(auth)
router.use(resolveWorkspace)

router.get('/current', c.getCurrent)
router.patch('/current', workspaceAdminOnly, c.updateCurrent)

router.get('/current/members', c.listMembers)
router.post('/current/members', workspaceAdminOnly, c.addMember)
router.put('/current/members/:userId', workspaceAdminOnly, c.updateMember)
router.patch('/current/members/:userId/toggle-active', workspaceAdminOnly, c.toggleMemberActive)

router.get('/current/invitations',       workspaceAdminOnly, c.listInvitations)
router.post('/current/invitations',      workspaceAdminOnly, c.inviteMember)
router.delete('/current/invitations/:id', workspaceAdminOnly, c.cancelInvitation)

router.get('/current/deletion-request',    workspaceAdminOnly, c.getDeletionRequest)
router.post('/current/deletion-request',   workspaceAdminOnly, c.scheduleDeletion)
router.delete('/current/deletion-request', workspaceAdminOnly, c.cancelDeletion)

module.exports = router
