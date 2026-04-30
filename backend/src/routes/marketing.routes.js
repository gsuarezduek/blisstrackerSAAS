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
const keywords          = require('../controllers/keywordTracking.controller')
const healthScore       = require('../controllers/healthScore.controller')
const metaIntegrations  = require('../controllers/integrations.meta.controller')
const instagram         = require('../controllers/instagram.controller')
const tiktokIntegrations = require('../controllers/integrations.tiktok.controller')
const tiktok             = require('../controllers/tiktok.controller')
const metaAds           = require('../controllers/metaAds.controller')
const googleAds         = require('../controllers/googleAds.controller')

// ─── SIN AUTH — Los callbacks OAuth no llevan Authorization header ────────────
router.get('/integrations/google/callback',    integrations.handleCallback)
router.get('/integrations/meta/callback',      metaIntegrations.handleMetaCallback)
router.get('/integrations/meta-ads/callback',  metaIntegrations.handleMetaAdsCallback)
router.get('/integrations/tiktok/callback',    tiktokIntegrations.handleTikTokCallback)

// ─── CON AUTH — todo lo demás requiere usuario autenticado y workspace ─────────
router.use(auth, resolveWorkspace)

// GEO
router.post('/geo/audit',                    geo.runAudit)
router.get('/geo/audits',                    geo.listAudits)
router.get('/geo/audits/:id',                geo.getAudit)
router.get('/geo/audits/:id/llms-txt',       geo.generateLlmsTxt)
router.post('/geo/audits/:id/schema',        geo.generateSchemaOrg)

// Integraciones: OAuth + gestión
router.get('/integrations/google/auth-url',                    integrations.getAuthUrl)
router.get('/integrations/meta/auth-url',                      metaIntegrations.getMetaAuthUrl)
router.get('/integrations/meta-ads/auth-url',                  metaIntegrations.getMetaAdsAuthUrl)
router.post('/projects/:id/integrations/connect-existing',    integrations.connectExisting)
router.get('/projects/:id/integrations',                      integrations.listIntegrations)
router.patch('/projects/:id/integrations/:type',              integrations.updateIntegration)
router.delete('/projects/:id/integrations/:type',             integrations.disconnect)

// Datos en tiempo real de integraciones
router.get('/projects/:id/analytics',                      analytics.getAnalyticsData)
router.get('/projects/:id/ads',                            analytics.getAdsData)
router.get('/projects/:id/search-console',                 searchConsole.getSearchConsoleData)
router.get('/projects/:id/search-console/query-pages',     searchConsole.getQueryPages)
router.get('/projects/:id/health-score',                   healthScore.getHealthScore)

// Meta Ads
router.get('/projects/:id/meta-ads',    metaAds.getMetaAdsData)

// Google Ads
router.get('/projects/:id/google-ads',  googleAds.getGoogleAdsData)

// Instagram
router.get('/projects/:id/instagram/snapshots',  instagram.getSnapshots)
router.post('/projects/:id/instagram/snapshots', instagram.saveSnapshot)
router.get('/projects/:id/instagram/followers',  instagram.getFollowerLog)
router.get('/projects/:id/instagram',            instagram.getMetrics)

// TikTok
router.get('/integrations/tiktok/auth-url',              tiktokIntegrations.getTikTokAuthUrl)
router.get('/projects/:id/tiktok/snapshots',              tiktok.getSnapshots)
router.post('/projects/:id/tiktok/snapshots',             tiktok.saveSnapshot)
router.get('/projects/:id/tiktok/followers',              tiktok.getFollowerLog)
router.get('/projects/:id/tiktok',                        tiktok.getMetrics)

// Snapshots mensuales + Insights IA
router.get('/projects/:id/snapshots',             analyticsSnapshot.getSnapshot)
router.post('/projects/:id/snapshots',            analyticsSnapshot.saveSnapshot)
router.get('/projects/:id/insights/:month',       analyticsSnapshot.getInsight)
router.post('/projects/:id/insights/:month',      analyticsSnapshot.createInsight)

// PageSpeed Insights
router.post('/projects/:id/pagespeed',            pageSpeed.runAnalysis)
router.get('/projects/:id/pagespeed',             pageSpeed.listResults)
router.get('/projects/:id/pagespeed/:resultId',   pageSpeed.getResult)

// Keywords Tracking — rutas estáticas ANTES de las dinámicas /:kwId
router.get('/projects/:id/keywords/suggest',         keywords.suggestKeywords)
router.get('/projects/:id/keywords/heatmap',         keywords.getHeatmap)
router.get('/projects/:id/keywords',                 keywords.listKeywords)
router.post('/projects/:id/keywords',                keywords.addKeyword)
router.delete('/projects/:id/keywords/:kwId',        keywords.removeKeyword)
router.get('/projects/:id/keywords/:kwId/history',   keywords.getHistory)
router.post('/projects/:id/keywords/:kwId/analysis', keywords.generateAnalysis)

module.exports = router
