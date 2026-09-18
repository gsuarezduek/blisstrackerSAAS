const router = require('express').Router()
const { auth } = require('../middleware/auth')
const { resolveWorkspace } = require('../middleware/workspace')
const { requireFeatureFlag } = require('../lib/featureFlags')
const { moduleAccessGuard } = require('../lib/moduleAccess')

const googleAuth = require('../controllers/googleCalendarAuth.controller')

// SIN AUTH — el callback OAuth de Google no lleva Authorization header (mismo
// patrón que marketing.routes.js con sus callbacks de Google/Meta/TikTok/LinkedIn).
router.get('/google/callback', googleAuth.handleCallback)

// Todo el resto del módulo Calendario requiere: autenticación + workspace + feature
// flag `calendario` habilitado + acceso al módulo (default abierto a todo el
// workspace, configurable por rol — ver backend/src/lib/moduleAccess.js). Mismo
// patrón que contenido.routes.js/ventas.routes.js.
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

// Conexión personal con Google Calendar (push de eventos agendados) — ver
// googleCalendarAuth.controller.js / googleCalendarSync.service.js.
router.get   ('/google/auth-url',              googleAuth.getAuthUrl)
router.get   ('/google/status',                googleAuth.getStatus)
router.delete('/google',                       googleAuth.disconnect)

module.exports = router
