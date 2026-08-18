const router = require('express').Router()
const multer  = require('multer')
const { getProfile, updateProfile, changePassword, requestEmailChange, googleLinkToken, disconnectGoogle, updateAvatar, uploadAvatarImage, deleteAvatarImage, updatePreferences, sendTestWeeklyEmail } = require('../controllers/profile.controller')
const { auth } = require('../middleware/auth')
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
router.patch('/',                   updateProfile)
router.patch('/avatar',             updateAvatar)
router.post('/avatar/upload',       uploadImage, uploadAvatarImage)
router.delete('/avatar/upload',     deleteAvatarImage)
router.patch('/preferences',        updatePreferences)
router.post('/weekly-email/send',   sendTestWeeklyEmail)
router.post('/change-password',     changePassword)
router.post('/change-email',        requestEmailChange)
router.post('/google-link-token',   googleLinkToken)
router.delete('/connect-google',    disconnectGoogle)

module.exports = router
