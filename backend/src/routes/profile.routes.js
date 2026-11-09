const router = require('express').Router()
const multer  = require('multer')
const { getProfile, updateProfile, changePassword, requestEmailChange, googleLinkToken, disconnectGoogle, updateAvatar, uploadAvatarImage, deleteAvatarImage, updatePreferences, sendTestWeeklyEmail } = require('../controllers/profile.controller')
const mfa = require('../controllers/mfa.controller')
const { auth, rejectImpersonation } = require('../middleware/auth')
const { resolveWorkspace } = require('../middleware/workspace')

const AVATAR_MAX_MB = 2
const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: AVATAR_MAX_MB * 1024 * 1024 },
})

// Corre multer y traduce sus errores a respuestas claras (sin esto, exceder el
// límite cae en el handler global → 500). Mismo patrón que superadmin.routes.js.
function uploadImage(req, res, next) {
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

router.use(auth)
router.use(resolveWorkspace)

router.get('/',                     getProfile)
router.patch('/',                   rejectImpersonation, updateProfile)
router.patch('/avatar',             rejectImpersonation, updateAvatar)
router.post('/avatar/upload',       rejectImpersonation, uploadImage, uploadAvatarImage)
router.delete('/avatar/upload',     rejectImpersonation, deleteAvatarImage)
router.patch('/preferences',        updatePreferences)
router.post('/weekly-email/send',   sendTestWeeklyEmail)
router.post('/change-password',     rejectImpersonation, changePassword)

// Segundo factor (2FA) — autoadministración, ver mfa.controller.js
router.get('/mfa',                  rejectImpersonation, mfa.status)
router.post('/mfa/setup',           rejectImpersonation, mfa.setup)
router.post('/mfa/confirm',         rejectImpersonation, mfa.confirm)
router.post('/mfa/disable',         rejectImpersonation, mfa.disable)
router.post('/mfa/recovery-codes',  rejectImpersonation, mfa.regenerateRecoveryCodes)
router.post('/change-email',        rejectImpersonation, requestEmailChange)
router.post('/google-link-token',   rejectImpersonation, googleLinkToken)
router.delete('/connect-google',    rejectImpersonation, disconnectGoogle)

module.exports = router
