const router = require('express').Router()
const { loginHistory, lastLogins, userSummary, updateVacationDays } = require('../controllers/rrhh.controller')
const { auth, adminOnly } = require('../middleware/auth')

router.use(auth, adminOnly)
router.get('/logins',                    loginHistory)
router.get('/last-logins',               lastLogins)
router.get('/user-summary/:id',          userSummary)
router.patch('/vacation-days/:id',       updateVacationDays)

module.exports = router
