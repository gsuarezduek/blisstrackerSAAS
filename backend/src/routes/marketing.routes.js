const express = require('express')
const router  = express.Router()
const { auth }             = require('../middleware/auth')
const { resolveWorkspace } = require('../middleware/workspace')
const geo          = require('../controllers/geo.controller')
const integrations = require('../controllers/integrations.controller')
const analytics    = require('../controllers/analytics.controller')

// ─── SIN AUTH — El callback de Google no lleva Authorization header ───────────
router.get('/integrations/google/callback', integrations.handleCallback)

// ─── CON AUTH — todo lo demás requiere usuario autenticado y workspace ─────────
router.use(auth, resolveWorkspace)

// GEO
router.post('/geo/audit',      geo.runAudit)
router.get('/geo/audits',      geo.listAudits)
router.get('/geo/audits/:id',  geo.getAudit)

// Integraciones: OAuth + gestión
router.get('/integrations/google/auth-url',           integrations.getAuthUrl)
router.get('/projects/:id/integrations',              integrations.listIntegrations)
router.patch('/projects/:id/integrations/:type',      integrations.updateIntegration)
router.delete('/projects/:id/integrations/:type',     integrations.disconnect)

// Datos de integraciones
router.get('/projects/:id/analytics',                 analytics.getAnalyticsData)
router.get('/projects/:id/ads',                       analytics.getAdsData)

module.exports = router
