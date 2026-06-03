const express = require('express')
const multer  = require('multer')
const router  = express.Router()
const { auth } = require('../middleware/auth')
const c     = require('../controllers/superadmin.controller')
const ann   = require('../controllers/announcements.controller')
const av    = require('../controllers/avatars.controller')
const ff    = require('../controllers/featureFlags.controller')
const legal = require('../controllers/legal.controller')
const ps    = require('../controllers/platformSettings.controller')

const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 2 * 1024 * 1024 }, // 2MB
})

function superAdminOnly(req, res, next) {
  if (!req.user?.isSuperAdmin) {
    return res.status(403).json({ error: 'Acceso restringido a super administradores' })
  }
  next()
}

router.use(auth)
router.use(superAdminOnly)

router.get('/stats',                    c.getStats)
router.get('/billing',                  c.getBillingOverview)
router.get('/payments',                 c.listPayments)
router.get('/workspaces',               c.listWorkspaces)
router.get('/workspaces/:id',                  c.getWorkspace)
router.patch('/workspaces/:id/status',         c.updateWorkspaceStatus)
router.patch('/workspaces/:id/token-limit',    c.updateTokenLimit)
router.post('/impersonate',             c.impersonate)
router.get('/feedback',                 c.listFeedback)
router.put('/feedback/:id/read',        c.markFeedbackRead)
router.get('/email-logs',               c.listEmailLogs)
router.get('/ai-tokens',                c.getAiTokenStats)
router.get('/conversion-funnel',        c.getConversionFunnel)
router.get('/metrics',                  c.getMetrics)

// Usuarios (lista global cross-workspace)
router.get('/users',                    c.listUsers)
router.patch('/users/:id/toggle-active',        c.toggleUserActive)
router.patch('/users/:id/toggle-daily-insight', c.toggleUserDailyInsight)

// Configuración global de la plataforma
router.get('/settings',                 ps.listSettings)
router.put('/settings',                 ps.updateSettings)
router.get('/settings/log',             ps.listLog)
router.get('/settings/cleanup-preview', ps.previewCleanup)
router.post('/settings/cleanup-now',    ps.runCleanup)

// Anuncios
router.get('/announcements',              ann.listAll)
router.post('/announcements',             ann.create)
router.patch('/announcements/:id',        ann.update)
router.patch('/announcements/:id/toggle', ann.toggle)
router.delete('/announcements/:id',       ann.remove)

// Feature Flags
router.get('/feature-flags',         ff.list)
router.post('/feature-flags',        ff.create)
router.patch('/feature-flags/:id',   ff.update)
router.delete('/feature-flags/:id',  ff.remove)

// Documentos legales
router.get('/legal/:key',  legal.getDocument)
router.put('/legal/:key',  legal.upsertDocument)

// Avatares
router.get('/avatars',                      av.listAll)
router.post('/avatars',                     upload.single('image'), av.upload)
router.patch('/avatars/reorder',            av.reorder)
router.patch('/avatars/:id',                av.update)
router.patch('/avatars/:id/toggle',         av.toggle)
router.delete('/avatars/:id',               av.remove)

module.exports = router
