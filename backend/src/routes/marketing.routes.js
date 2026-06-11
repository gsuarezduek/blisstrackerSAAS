const express = require('express')
const multer  = require('multer')
const router  = express.Router()
const { auth }             = require('../middleware/auth')
const { resolveWorkspace } = require('../middleware/workspace')

const uploadBanner = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } })
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
const linkedinIntegrations = require('../controllers/integrations.linkedin.controller')
const linkedin             = require('../controllers/linkedin.controller')
const metaAds           = require('../controllers/metaAds.controller')
const googleAds         = require('../controllers/googleAds.controller')
const monthlyReport     = require('../controllers/monthlyReport.controller')
const cannibalization   = require('../controllers/cannibalization.controller')
const competitors       = require('../controllers/competitors.controller')
const adsSnapshot       = require('../controllers/adsSnapshot.controller')
const summary           = require('../controllers/marketingSummary.controller')
const objectives        = require('../controllers/marketingObjectives.controller')

// ─── SIN AUTH — Los callbacks OAuth no llevan Authorization header ────────────
router.get('/integrations/google/callback',    integrations.handleCallback)
router.get('/integrations/meta/callback',      metaIntegrations.handleMetaCallback)
router.get('/integrations/meta-ads/callback',  metaIntegrations.handleMetaAdsCallback)
router.get('/integrations/tiktok/callback',    tiktokIntegrations.handleTikTokCallback)
router.get('/integrations/linkedin/callback',  linkedinIntegrations.handleLinkedinCallback)

// ─── CON AUTH — todo lo demás requiere usuario autenticado y workspace ─────────
router.use(auth, resolveWorkspace)

// GEO
router.post('/geo/audit',                    geo.runAudit)
router.get('/geo/audits',                    geo.listAudits)
router.get('/geo/audits/:id',                geo.getAudit)
router.delete('/geo/audits/:id',             geo.deleteAudit)
router.get('/geo/audits/:id/llms-txt',       geo.generateLlmsTxt)
router.post('/geo/audits/:id/schema',        geo.generateSchemaOrg)

// Integraciones: OAuth + gestión
router.get('/integrations/google/auth-url',                    integrations.getAuthUrl)
router.get('/integrations/meta/auth-url',                      metaIntegrations.getMetaAuthUrl)
router.get('/integrations/meta-ads/auth-url',                  metaIntegrations.getMetaAdsAuthUrl)
router.post('/projects/:id/integrations/instagram/connect-token',  metaIntegrations.connectInstagramToken)
router.post('/projects/:id/integrations/instagram/connect-scrape', instagram.connectScrape)
router.post('/projects/:id/integrations/meta-ads/connect-token',   metaIntegrations.connectMetaAdsToken)
router.post('/projects/:id/integrations/connect-existing',    integrations.connectExisting)
router.get('/projects/:id/integrations',                      integrations.listIntegrations)
router.patch('/projects/:id/integrations/:type',              integrations.updateIntegration)
router.delete('/projects/:id/integrations/:type',             integrations.disconnect)

// Datos en tiempo real de integraciones
router.get('/projects/:id/analytics',                      analytics.getAnalyticsData)
router.get('/projects/:id/ads',                            analytics.getAdsData)
router.get('/projects/:id/ai-traffic',                     analytics.getAiTrafficData)
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
router.post('/projects/:id/instagram/scrape/refresh', instagram.refreshScrape)
router.get('/projects/:id/instagram',            instagram.getMetrics)

// Competidores (RRSS) — scraping de cuentas de la competencia
router.get('/projects/:id/competitors',                  competitors.listCompetitors)
router.post('/projects/:id/competitors',                 competitors.addCompetitor)
router.get('/projects/:id/competitors/:cid/history',     competitors.getCompetitorHistory)
router.post('/projects/:id/competitors/:cid/refresh',    competitors.refreshCompetitor)
router.delete('/projects/:id/competitors/:cid',          competitors.deleteCompetitor)

// TikTok
router.get('/integrations/tiktok/auth-url',              tiktokIntegrations.getTikTokAuthUrl)
router.get('/projects/:id/tiktok/snapshots',              tiktok.getSnapshots)
router.post('/projects/:id/tiktok/snapshots',             tiktok.saveSnapshot)
router.get('/projects/:id/tiktok/followers',              tiktok.getFollowerLog)
router.get('/projects/:id/tiktok',                        tiktok.getMetrics)

// LinkedIn
router.get('/integrations/linkedin/auth-url',            linkedinIntegrations.getLinkedinAuthUrl)
router.get('/projects/:id/linkedin/orgs',                linkedin.listOrganizations)
router.get('/projects/:id/linkedin/snapshots',           linkedin.getSnapshots)
router.post('/projects/:id/linkedin/snapshots',          linkedin.saveSnapshot)
router.get('/projects/:id/linkedin/followers',           linkedin.getFollowerLog)
router.get('/projects/:id/linkedin',                     linkedin.getMetrics)

// Snapshots mensuales + Insights IA
router.get('/projects/:id/snapshots',             analyticsSnapshot.getSnapshot)
router.post('/projects/:id/snapshots',            analyticsSnapshot.saveSnapshot)
router.get('/projects/:id/insights/:month',       analyticsSnapshot.getInsight)
router.post('/projects/:id/insights/:month',      analyticsSnapshot.createInsight)

// PageSpeed Insights
router.post('/projects/:id/pagespeed',            pageSpeed.runAnalysis)
router.get('/projects/:id/pagespeed',             pageSpeed.listResults)
router.get('/projects/:id/pagespeed/:resultId',   pageSpeed.getResult)

// Informes mensuales
router.get('/projects/:id/reports',                                            monthlyReport.listReports)
router.get('/projects/:id/report-sections',                                    monthlyReport.getSectionsStatus)
router.get('/projects/:id/reports/:month',                                     monthlyReport.getReport)
router.patch('/projects/:id/reports/:month',                                   monthlyReport.updateReport)
router.post('/projects/:id/reports/:month/regenerate',                         monthlyReport.regenerateReport)
router.post('/projects/:id/reports/:month/banner', uploadBanner.single('image'), monthlyReport.uploadReportBanner)
router.delete('/projects/:id/reports/:month/banner',                           monthlyReport.deleteReportBanner)

// Objetivos de marketing (estructurados, persistentes por proyecto)
router.get('/projects/:id/objectives/progress',   objectives.getObjectivesProgress)
router.get('/projects/:id/objectives',            objectives.listObjectives)
router.post('/projects/:id/objectives',           objectives.createObjective)
router.patch('/projects/:id/objectives/:oid',     objectives.updateObjective)
router.delete('/projects/:id/objectives/:oid',    objectives.deleteObjective)

// Canibalización SEO
router.post('/projects/:id/cannibal',         cannibalization.runAnalysis)
router.get('/projects/:id/cannibal',          cannibalization.listReports)
router.get('/projects/:id/cannibal/:rid',     cannibalization.getReport)
router.delete('/projects/:id/cannibal/:rid',  cannibalization.deleteReport)

// SEO — Snapshots mensuales + Análisis IA (Google Search Console)
router.get('/projects/:id/seo/snapshot/:month',  searchConsole.getSeoSnapshot)
router.post('/projects/:id/seo/snapshots',        searchConsole.saveSeoSnapshot)
router.get('/projects/:id/seo/ai-insights',       searchConsole.getSeoAiInsights)
router.post('/projects/:id/seo/ai-insights',      searchConsole.createSeoAiInsights)

// SEO — Domain Rating (Ahrefs, endpoint free sin API key)
router.get('/projects/:id/domain-rating',          searchConsole.getDomainRating)
router.post('/projects/:id/domain-rating/refresh', searchConsole.refreshDomainRating)

// Keywords Tracking — rutas estáticas ANTES de las dinámicas /:kwId
router.get('/projects/:id/keywords/suggest',              keywords.suggestKeywords)
router.get('/projects/:id/keywords/heatmap',              keywords.getHeatmap)
router.get('/projects/:id/keywords/history-batch',        keywords.getHistoryBatch)
router.get('/projects/:id/keywords/serp-batch',           keywords.getSerpBatch)
router.get('/projects/:id/keywords',                      keywords.listKeywords)
router.post('/projects/:id/keywords',                     keywords.addKeyword)
router.delete('/projects/:id/keywords/:kwId',             keywords.removeKeyword)
router.get('/projects/:id/keywords/:kwId/history',        keywords.getHistory)
router.post('/projects/:id/keywords/:kwId/analysis',      keywords.generateAnalysis)
router.get('/projects/:id/keywords/:kwId/serp',           keywords.getSerpSnapshot)
router.post('/projects/:id/keywords/:kwId/serp/refresh',  keywords.refreshSerpSnapshot)

// Ads Snapshots por proyecto
router.post('/projects/:id/ads-snapshots',  adsSnapshot.saveSnapshot)
router.get('/projects/:id/ads-snapshots',   adsSnapshot.listSnapshots)

// Vistas cross-proyecto (sin proyecto seleccionado)
router.get('/summary/analytics',   summary.getAnalyticsSummary)
router.post('/summary/analytics/refresh', summary.refreshAnalyticsSummary)
router.get('/summary/performance', summary.getPerformanceSummary)
router.get('/summary/instagram',   summary.getInstagramSummary)
router.get('/summary/tiktok',      summary.getTikTokSummary)
router.get('/summary/linkedin',    summary.getLinkedinSummary)
router.get('/summary/ads',         summary.getAdsSummary)
router.get('/summary/reports',     summary.getReportsSummary)
router.get('/summary/seo',         summary.getSeoSummary)

module.exports = router
