const router = require('express').Router()
const { list, listAll, create, update, projectTasks } = require('../controllers/projects.controller')
const { auth, adminOnly } = require('../middleware/auth')

router.get('/', auth, list)                    // active only — for task creation
router.get('/all', auth, adminOnly, listAll)   // admin: all including inactive
router.get('/:id/tasks', auth, projectTasks)   // tareas pendientes del proyecto
router.post('/', auth, adminOnly, create)
router.put('/:id', auth, adminOnly, update)

module.exports = router
