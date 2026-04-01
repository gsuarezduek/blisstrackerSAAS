const router = require('express').Router()
const { create, startTask, pauseTask, resumeTask, completeTask, blockTask, unblockTask, remove, setDuration } = require('../controllers/tasks.controller')
const { auth, adminOnly } = require('../middleware/auth')

router.use(auth)
router.post('/', create)
router.patch('/:id/start',    startTask)
router.patch('/:id/pause',    pauseTask)
router.patch('/:id/resume',   resumeTask)
router.patch('/:id/complete', completeTask)
router.patch('/:id/block',   blockTask)
router.patch('/:id/unblock', unblockTask)
router.delete('/:id', remove)
router.patch('/:id/duration', adminOnly, setDuration)

module.exports = router
