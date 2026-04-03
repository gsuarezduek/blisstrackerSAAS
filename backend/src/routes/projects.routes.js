const router = require('express').Router()
const { list, listAll, create, update, projectTasks, projectCompletedHistory, saveLinks } = require('../controllers/projects.controller')
const { auth, adminOnly } = require('../middleware/auth')

router.get('/', auth, list)                              // active only — for task creation
router.get('/all', auth, adminOnly, listAll)             // admin: all including inactive
router.get('/:id/tasks', auth, projectTasks)             // tareas activas + completadas esta semana
router.get('/:id/completed', auth, projectCompletedHistory) // historial paginado de completadas
router.post('/', auth, adminOnly, create)
router.put('/:id', auth, adminOnly, update)
router.put('/:id/links', auth, adminOnly, saveLinks)

module.exports = router
