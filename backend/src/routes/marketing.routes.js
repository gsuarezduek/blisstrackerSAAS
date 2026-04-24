const express = require('express')
const router  = express.Router()
const { auth }             = require('../middleware/auth')
const { resolveWorkspace } = require('../middleware/workspace')
const geo               = require('../controllers/geo.controller')
const integrations      = require('../controllers/integrations.controller')
const analytics         = require('../controllers/analytics.controller')
const searchConsole     = require('../controllers/searchConsole.controller')
const analyticsSnapshot = require('../controllers/analyticsSnapshot.controller')
const pageSpeed         = require('../controllers/pageSpeed.controller')

// ─── SIN AUTH — El callback de Google no lleva Authorization header ───────────
router.get('/integrations/google/callback', integrations.handleCallback)

// ─── CON AUTH — todo lo demás requiere usuario autenticado y workspace ─────────
router.use(auth, resolveWorkspace)

// GEO
router.post('/geo/audit',      geo.runAudit)
router.get('/geo/audits',      geo.listAudits)
router.get('/geo/audits/:id',  geo.getAudit)

// Integraciones: OAuth + gestión
router.get('/integrations/google/auth-url',                    integrations.getAuthUrl)
router.post('/projects/:id/integrations/connect-existing',    integrations.connectExisting)
router.get('/projects/:id/integrations',                      integrations.listIntegrations)
router.patch('/projects/:id/integrations/:type',              integrations.updateIntegration)
router.delete('/projects/:id/integrations/:type',             integrations.disconnect)

// Datos en tiempo real de integraciones
router.get('/projects/:id/analytics',       analytics.getAnalyticsData)
router.get('/projects/:id/ads',             analytics.getAdsData)
router.get('/projects/:id/search-console',  searchConsole.getSearchConsoleData)

// Snapshots mensuales + Insights IA
router.get('/projects/:id/snapshots',             analyticsSnapshot.getSnapshot)
router.post('/projects/:id/snapshots',            analyticsSnapshot.saveSnapshot)
router.get('/projects/:id/insights/:month',       analyticsSnapshot.getInsight)
router.post('/projects/:id/insights/:month',      analyticsSnapshot.createInsight)

// PageSpeed Insights
router.post('/projects/:id/pagespeed',            pageSpeed.runAnalysis)
router.get('/projects/:id/pagespeed',             pageSpeed.listResults)
router.get('/projects/:id/pagespeed/:resultId',   pageSpeed.getResult)

module.exports = router
