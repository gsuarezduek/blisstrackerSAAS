const router = require('express').Router()
const { getDailyInsight, refreshDailyInsight, saveFeedback } = require('../controllers/insights.controller')
const { auth } = require('../middleware/auth')

router.get('/',          auth, getDailyInsight)
router.post('/refresh',  auth, refreshDailyInsight)
router.post('/feedback', auth, saveFeedback)

module.exports = router
