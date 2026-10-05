const router = require('express').Router()
const multer  = require('multer')
const { auth } = require('../middleware/auth')
const { resolveWorkspace } = require('../middleware/workspace')
const { requireFeatureFlag } = require('../lib/featureFlags')
const { moduleAccessGuard } = require('../lib/moduleAccess')
const { requireProjectAccess } = require('../middleware/projectPrivacy')

// Fallback multipart (solo imagen, sin R2 configurado) — memoryStorage, nunca
// disco, mismo patrón que avatares/logo/banner. El límite de tamaño real de
// imagen (15MB) lo valida el controller; acá el límite de multer es apenas
// más generoso para que el error legible salga del controller, no de multer.
const uploadFallback = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } })

// Todo el módulo Contenido requiere: autenticación + workspace + que el feature
// flag `contenido` esté habilitado para el workspace + acceso al módulo (por
// default abierto a todo el workspace, configurable por rol desde Preferencias
// — ver backend/src/lib/moduleAccess.js).
//
// El permiso de escritura NO se resuelve acá sino dentro de cada handler, con
// canWrite(req, projectId) de lib/projectAccess.js: la lectura queda abierta a
// cualquier miembro con acceso al módulo (criterio "equipo = etiqueta, no
// barrera" que ya usan proyectos, reuniones y chat), y solo las mutaciones
// exigen además ser admin/owner o miembro del proyecto.
//
// Excepción — proyecto privado (ver concepto "Proyectos privados"): ahí SÍ es
// una barrera, también para lectura. Mismo gate que projects.routes.js, reusado
// vía router.param('id') porque acá también ':id' es siempre el projectId.
router.use(auth)
router.use(resolveWorkspace)
router.use(requireFeatureFlag('contenido'))
router.use(moduleAccessGuard('contenido'))
router.param('id', requireProjectAccess)

// Content.controller.js se dividió en sub-controllers por responsabilidad
// (mismo patrón que controllers/tasks/ y controllers/ventas/): content/_shared.js
// tiene los helpers comunes (resolveCtx, formatPiece, loadPiece, etc.), reusados
// también por contentAssets/contentComments/contentFiles/contentPortal/clientPortal.
const pieces    = require('../controllers/content/pieces.controller')
const trash     = require('../controllers/content/trash.controller')
const kanban    = require('../controllers/content/kanban.controller')
const history   = require('../controllers/content/history.controller')
const dashboard = require('../controllers/content/dashboard.controller')
const approval  = require('../controllers/content/approval.controller')
const assets    = require('../controllers/contentAssets.controller')
const comments  = require('../controllers/contentComments.controller')
const files     = require('../controllers/contentFiles.controller')

// Piezas. La lectura queda abierta a cualquier miembro activo; las mutaciones
// validan canWrite() adentro del handler.
router.get   ('/projects/:id/pieces',               pieces.listPieces)
router.post  ('/projects/:id/pieces',               pieces.createPiece)
// Antes de '/pieces/:pid': si no, ':pid' matchea "months"/"trash" como si fueran un id.
router.get   ('/projects/:id/pieces/months',         history.listMonths)
router.get   ('/projects/:id/pieces/trash',          trash.listTrash)
router.get   ('/projects/:id/pieces/:pid',           pieces.getPiece)
router.patch ('/projects/:id/pieces/:pid',           pieces.updatePiece)
router.delete('/projects/:id/pieces/:pid',           pieces.deletePiece)
router.post  ('/projects/:id/pieces/:pid/restore',   trash.restorePiece)
router.delete('/projects/:id/pieces/:pid/purge',     trash.purgePiece)
router.patch ('/projects/:id/pieces/:pid/position',  kanban.movePiece)
router.patch ('/projects/:id/pieces/:pid/star',      kanban.starPiece)
router.get   ('/projects/:id/pieces/:pid/history',   history.getHistory)
router.post  ('/projects/:id/pieces/:pid/send-to-dashboard', dashboard.sendToDashboard)

router.get   ('/projects/:id/summary',     history.getSummary)
router.post  ('/projects/:id/request-approval', approval.requestApproval)

// Assets. presign/confirm es el camino normal (subida directa a R2); el
// multipart es el fallback sin R2 configurado (solo imagen, ver contentAssets.controller.js).
router.post  ('/projects/:id/pieces/:pid/assets/presign',        assets.presignAsset)
router.post  ('/projects/:id/pieces/:pid/assets/:aid/confirm',   assets.confirmAsset)
router.post  ('/projects/:id/pieces/:pid/assets',                uploadFallback.single('file'), assets.uploadAssetFallback)
router.post  ('/projects/:id/pieces/:pid/assets/link',           assets.createLinkAsset)
router.patch ('/projects/:id/pieces/:pid/assets/:aid',           assets.reorderAsset)
router.delete('/projects/:id/pieces/:pid/assets/:aid',           assets.deleteAsset)

// Comentarios internos + hilo con el cliente (visibility en el body). La lectura
// es abierta a cualquier miembro activo; postear exige canWrite; borrar exige
// ser el autor o admin/owner.
router.get   ('/projects/:id/pieces/:pid/comments',      comments.listComments)
router.post  ('/projects/:id/pieces/:pid/comments',      comments.addComment)
router.delete('/projects/:id/pieces/:pid/comments/:cid', comments.deleteComment)

// Vínculos con archivos de Archivos (ver contentFiles.controller.js) — la lista
// de archivos ya vinculados viaja embebida en cada pieza (`piece.files`), no
// hace falta un GET propio acá.
router.get   ('/projects/:id/files/:fileId/pieces',      files.listPiecesForFile)
router.post  ('/projects/:id/pieces/:pid/files',          files.linkFile)
router.delete('/projects/:id/pieces/:pid/files/:fileId',  files.unlinkFile)

module.exports = router
