const router = require('express').Router()
const { auth } = require('../middleware/auth')
const { resolveWorkspace } = require('../middleware/workspace')
const { requireFeatureFlag } = require('../lib/featureFlags')

// Todo el módulo Contenido requiere: autenticación + workspace + que el feature
// flag `contenido` esté habilitado para el workspace.
//
// El permiso de escritura NO se resuelve acá sino dentro de cada handler, con
// canWrite(req, projectId) de lib/projectAccess.js: la lectura queda abierta a
// cualquier miembro activo del workspace (criterio "equipo = etiqueta, no
// barrera" que ya usan proyectos, reuniones y chat), y solo las mutaciones
// exigen ser admin/owner o miembro del proyecto.
router.use(auth)
router.use(resolveWorkspace)
router.use(requireFeatureFlag('contenido'))

const content = require('../controllers/content.controller')

// Piezas. La lectura queda abierta a cualquier miembro activo; las mutaciones
// validan canWrite() adentro del handler.
router.get   ('/projects/:id/pieces',      content.listPieces)
router.post  ('/projects/:id/pieces',      content.createPiece)
router.get   ('/projects/:id/pieces/:pid', content.getPiece)
router.patch ('/projects/:id/pieces/:pid', content.updatePiece)
router.delete('/projects/:id/pieces/:pid', content.deletePiece)

router.get   ('/projects/:id/summary',     content.getSummary)

// Comentarios y assets se montan en F3–F4.

module.exports = router
