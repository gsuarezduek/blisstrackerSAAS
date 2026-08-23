const express = require('express')
const multer  = require('multer')
const router  = express.Router()
const { auth } = require('../middleware/auth')
const prisma = require('../lib/prisma')
const c     = require('../controllers/superadmin.controller')
const ann   = require('../controllers/announcements.controller')
const av    = require('../controllers/avatars.controller')
const ff    = require('../controllers/featureFlags.controller')
const legal = require('../controllers/legal.controller')
const ps    = require('../controllers/platformSettings.controller')
const st    = require('../controllers/storage.controller')
const land  = require('../controllers/landing.controller')
const apt   = require('../controllers/apifyTokens.controller')

const AVATAR_MAX_MB = 2
const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: AVATAR_MAX_MB * 1024 * 1024 },
})

// Corre multer y traduce sus errores a respuestas claras para el usuario.
// Sin esto, exceder el límite cae en el handler global → 500 "Internal Server Error".
function uploadAvatar(req, res, next) {
  upload.single('image')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({
          error: `La imagen supera el tamaño máximo de ${AVATAR_MAX_MB} MB. Probá con una más liviana o comprimila antes de subirla.`,
        })
      }
      return res.status(400).json({ error: `No se pudo subir la imagen: ${err.message}` })
    }
    if (err) return next(err)
    next()
  })
}

// Re-valida isSuperAdmin contra la DB (no confía ciegamente en el JWT, que puede
// vivir hasta 12h): si a alguien se le revoca el flag, pierde acceso de inmediato
// en vez de recién cuando expire su token.
async function superAdminOnly(req, res, next) {
  if (!req.user?.isSuperAdmin) {
    return res.status(403).json({ error: 'Acceso restringido a super administradores' })
  }
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.userId }, select: { isSuperAdmin: true } })
    if (!user?.isSuperAdmin) {
      return res.status(403).json({ error: 'Acceso restringido a super administradores' })
    }
    next()
  } catch (err) { next(err) }
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
router.patch('/workspaces/:id/billing-exempt', c.updateWorkspaceBillingExempt)
router.post('/impersonate',             c.impersonate)
router.get('/feedback',                 c.listFeedback)
router.put('/feedback/:id/read',        c.markFeedbackRead)
router.get('/email-logs',               c.listEmailLogs)
router.get('/ai-tokens',                c.getAiTokenStats)
router.get('/whatsapp-usage',           c.getWhatsappUsageStats)
router.get('/conversion-funnel',        c.getConversionFunnel)
router.get('/metrics',                  c.getMetrics)

// Usuarios (lista global cross-workspace)
router.get('/users',                    c.listUsers)
router.patch('/users/:id/toggle-active',        c.toggleUserActive)
router.patch('/users/:id/toggle-daily-insight', c.toggleUserDailyInsight)
router.patch('/users/:id/toggle-superadmin',    c.toggleUserSuperAdmin)

// Configuración global de la plataforma
router.get('/settings',                 ps.listSettings)
router.put('/settings',                 ps.updateSettings)
router.get('/settings/log',             ps.listLog)
router.get('/settings/cleanup-preview', ps.previewCleanup)
router.post('/settings/cleanup-now',    ps.runCleanup)

// Almacenamiento (tamaño de la DB + limpieza de imágenes sociales huérfanas)
router.get('/storage',                       st.getStorage)
router.post('/storage/cleanup-orphan-images', st.cleanupOrphanImagesHandler)

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
router.post('/avatars',                     uploadAvatar, av.upload)
router.patch('/avatars/reorder',            av.reorder)
router.patch('/avatars/:id',                av.update)
router.patch('/avatars/:id/toggle',         av.toggle)
router.delete('/avatars/:id',               av.remove)

// Scraping (consumo de Apify + gestión de tokens)
router.get('/apify-tokens',              apt.listTokens)
router.post('/apify-tokens',             apt.createToken)
router.patch('/apify-tokens/reorder',    apt.reorderTokens)
router.patch('/apify-tokens/:id',        apt.updateToken)
router.patch('/apify-tokens/:id/toggle', apt.toggleToken)
router.delete('/apify-tokens/:id',       apt.deleteToken)
router.get('/apify-usage',               apt.getUsageStats)
router.get('/apify-accounts-usage',      apt.getAccountsUsage)

// Landing (hero/video + empresas que confían) — misma restricción de tamaño que avatares,
// se reusa el wrapper uploadAvatar (mismo límite 2MB, mismo campo "image", mensaje genérico).
router.get('/landing/content',                       land.getContent)
router.put('/landing/content',                       land.updateContent)
router.get('/landing/trusted-companies',             land.listAllTrustedCompanies)
router.post('/landing/trusted-companies',            uploadAvatar, land.createTrustedCompany)
router.patch('/landing/trusted-companies/reorder',   land.reorderTrustedCompanies)
router.patch('/landing/trusted-companies/:id',       land.updateTrustedCompany)
router.patch('/landing/trusted-companies/:id/toggle', land.toggleTrustedCompany)
router.delete('/landing/trusted-companies/:id',      land.deleteTrustedCompany)

module.exports = router
