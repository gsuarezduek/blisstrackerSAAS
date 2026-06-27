const router = require('express').Router()
const { getProfile, updateProfile, changePassword, requestEmailChange, connectGoogle, disconnectGoogle, updateAvatar, updatePreferences, sendTestWeeklyEmail } = require('../controllers/profile.controller')
const { auth } = require('../middleware/auth')
const { resolveWorkspace } = require('../middleware/workspace')

router.use(auth)
router.use(resolveWorkspace)

router.get('/',                     getProfile)
router.patch('/',                   updateProfile)
router.patch('/avatar',             updateAvatar)
router.patch('/preferences',        updatePreferences)
router.post('/weekly-email/send',   sendTestWeeklyEmail)
router.post('/change-password',     changePassword)
router.post('/change-email',        requestEmailChange)
router.post('/connect-google',      connectGoogle)
router.delete('/connect-google',    disconnectGoogle)

module.exports = router
