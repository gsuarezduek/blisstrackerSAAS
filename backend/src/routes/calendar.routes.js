const router = require('express').Router()
const { auth } = require('../middleware/auth')
const { resolveWorkspace } = require('../middleware/workspace')
const { requireFeatureFlag } = require('../lib/featureFlags')
const { moduleAccessGuard } = require('../lib/moduleAccess')

// Todo el módulo Calendario requiere: autenticación + workspace + feature flag
// `calendario` habilitado + acceso al módulo (default abierto a todo el workspace,
// configurable por rol — ver backend/src/lib/moduleAccess.js). Mismo patrón que
// contenido.routes.js/ventas.routes.js.
router.use(auth)
router.use(resolveWorkspace)
router.use(requireFeatureFlag('calendario'))
router.use(moduleAccessGuard('calendario'))

const calendar = require('../controllers/calendar.controller')

router.get   ('/events',                       calendar.listEvents)
router.post  ('/events',                       calendar.createEvent)
router.get   ('/events/:id',                   calendar.getEvent)
router.patch ('/events/:id',                   calendar.updateEvent)
router.delete('/events/:id',                   calendar.deleteEvent)
router.post  ('/events/:id/respond',           calendar.respondEvent)
router.post  ('/events/:id/start-meeting',     calendar.startMeetingFromEvent)

router.get   ('/availability',                 calendar.getAvailability)
router.post  ('/availability/common-free-slots', calendar.commonFreeSlots)

module.exports = router
