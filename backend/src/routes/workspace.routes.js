const express = require('express')
const router  = require('express').Router()
const multer  = require('multer')
const { auth } = require('../middleware/auth')
const { resolveWorkspace, workspaceAdminOnly } = require('../middleware/workspace')
const c  = require('../controllers/workspace.controller')
const ff = require('../controllers/featureFlags.controller')

const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 5 * 1024 * 1024 }, // 5 MB máximo
})

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
router.get('/current/members/:userId/pending-tasks', workspaceAdminOnly, c.listMemberPendingTasks)
router.patch('/current/members/:userId/toggle-active', workspaceAdminOnly, c.toggleMemberActive)

router.get('/current/invitations',       workspaceAdminOnly, c.listInvitations)
router.post('/current/invitations',      workspaceAdminOnly, c.inviteMember)
router.delete('/current/invitations/:id', workspaceAdminOnly, c.cancelInvitation)

router.get('/current/deletion-request',    workspaceAdminOnly, c.getDeletionRequest)
router.post('/current/deletion-request',   workspaceAdminOnly, c.scheduleDeletion)
router.delete('/current/deletion-request', workspaceAdminOnly, c.cancelDeletion)

// Branding: logo y banner
router.post('/current/logo',   workspaceAdminOnly, upload.single('image'), c.uploadLogo)
router.delete('/current/logo', workspaceAdminOnly, c.deleteLogo)
router.post('/current/banner',   workspaceAdminOnly, upload.single('image'), c.uploadBanner)
router.delete('/current/banner', workspaceAdminOnly, c.deleteBanner)

// Feature flags: gestión de opt-out por parte del workspace admin
router.get('/current/features',          workspaceAdminOnly, ff.listWorkspaceFeatures)
router.patch('/current/features/:key',   workspaceAdminOnly, ff.toggleWorkspaceFeature)

// Token budget: presupuesto mensual de IA (requiere auth, cualquier miembro)
router.get('/current/token-budget', c.getTokenBudgetStatus)

// Eliminar proyecto demo (admin u owner)
router.delete('/current/demo-project', c.deleteDemoProject)

// Onboarding: marcar completado/saltado el wizard (selector de módulos + tour)
router.post('/current/onboarding/complete', workspaceAdminOnly, c.completeOnboarding)

// Onboarding: estado de "Primeros pasos" para la tarjeta persistente del Dashboard
router.get('/current/onboarding/checklist', workspaceAdminOnly, c.getOnboardingChecklist)

module.exports = router
