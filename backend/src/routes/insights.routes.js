const router = require('express').Router()
const { getDailyInsight, refreshDailyInsight, saveFeedback } = require('../controllers/insights.controller')
const { auth } = require('../middleware/auth')
const { resolveWorkspace } = require('../middleware/workspace')

router.use(auth)
router.use(resolveWorkspace)

router.get('/',          getDailyInsight)
router.post('/refresh',  refreshDailyInsight)
router.post('/feedback', saveFeedback)

module.exports = router
