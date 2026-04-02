const router = require('express').Router()
const { list, create, update, remove, getUserTasks } = require('../controllers/users.controller')
const { auth, adminOnly } = require('../middleware/auth')

router.get('/:id/tasks', auth, getUserTasks)
router.get('/', auth, adminOnly, list)
router.post('/', auth, adminOnly, create)
router.put('/:id', auth, adminOnly, update)
router.delete('/:id', auth, adminOnly, remove)

module.exports = router
