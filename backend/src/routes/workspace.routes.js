const express = require('express')
const router  = require('express').Router()
const multer  = require('multer')
const { auth, optionalAuth } = require('../middleware/auth')
const { resolveWorkspace, workspaceAdminOnly } = require('../middleware/workspace')
const registration = require('../controllers/workspace/registration.controller')
const invitations = require('../controllers/workspace/invitations.controller')
const members = require('../controllers/workspace/members.controller')
const settings = require('../controllers/workspace/settings.controller')
const deletion = require('../controllers/workspace/deletion.controller')
const ff = require('../controllers/featureFlags.controller')
const ma = require('../controllers/moduleAccess.controller')

const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 5 * 1024 * 1024 }, // 5 MB máximo
})

// Rutas públicas (sin auth) — createWorkspace usa optionalAuth: si quien pega ya
// tiene sesión, crea un workspace ADICIONAL para ese usuario sin pedirle contraseña.
router.post('/',          optionalAuth, registration.createWorkspace)
router.get('/check-slug', registration.checkSlug)
router.get('/info',       registration.getInfo)

// Rutas públicas de invitaciones
router.get('/invitations/:token', invitations.getInvitation)
router.post('/join',              invitations.joinWorkspace)

// Rutas autenticadas SIN workspace (solo auth)
router.get('/mine', auth, registration.getMine)

// Rutas autenticadas + workspace
router.use(auth)
router.use(resolveWorkspace)

router.get('/current', settings.getCurrent)
router.patch('/current', workspaceAdminOnly, settings.updateCurrent)

router.get('/current/members', members.listMembers)
router.post('/current/members', workspaceAdminOnly, members.addMember)
router.put('/current/members/:userId', workspaceAdminOnly, members.updateMember)
router.get('/current/members/:userId/pending-tasks', workspaceAdminOnly, members.listMemberPendingTasks)
router.patch('/current/members/:userId/toggle-active', workspaceAdminOnly, members.toggleMemberActive)

router.get('/current/invitations',       workspaceAdminOnly, invitations.listInvitations)
router.post('/current/invitations',      workspaceAdminOnly, invitations.inviteMember)
router.delete('/current/invitations/:id', workspaceAdminOnly, invitations.cancelInvitation)

router.get('/current/deletion-request',    workspaceAdminOnly, deletion.getDeletionRequest)
router.post('/current/deletion-request',   workspaceAdminOnly, deletion.scheduleDeletion)
router.delete('/current/deletion-request', workspaceAdminOnly, deletion.cancelDeletion)

// Branding: logo y banner
router.post('/current/logo',   workspaceAdminOnly, upload.single('image'), settings.uploadLogo)
router.delete('/current/logo', workspaceAdminOnly, settings.deleteLogo)
router.post('/current/banner',   workspaceAdminOnly, upload.single('image'), settings.uploadBanner)
router.delete('/current/banner', workspaceAdminOnly, settings.deleteBanner)

// Feature flags: gestión de opt-out por parte del workspace admin
router.get('/current/features',          workspaceAdminOnly, ff.listWorkspaceFeatures)
router.patch('/current/features/:key',   workspaceAdminOnly, ff.toggleWorkspaceFeature)

// Acceso por rol a los módulos (rrhh/gamification/ventas/marketing/contenido/eos)
router.get('/current/module-access',        workspaceAdminOnly, ma.list)
router.patch('/current/module-access/:key', workspaceAdminOnly, ma.update)

// Token budget: presupuesto mensual de IA (requiere auth, cualquier miembro)
router.get('/current/token-budget', settings.getTokenBudgetStatus)

// Proyecto demo: crear a pedido (wizard de onboarding) / eliminar (admin u owner)
router.post('/current/demo-project',   workspaceAdminOnly, deletion.createDemoProject)
router.delete('/current/demo-project', deletion.deleteDemoProject)

// Onboarding: marcar completado/saltado el wizard (selector de módulos + tour)
router.post('/current/onboarding/complete', workspaceAdminOnly, settings.completeOnboarding)

// Onboarding: estado de "Primeros pasos" para la tarjeta persistente del Dashboard
router.get('/current/onboarding/checklist', workspaceAdminOnly, settings.getOnboardingChecklist)

module.exports = router
