const router = require('express').Router()
const multer  = require('multer')
const { auth } = require('../middleware/auth')
const { resolveWorkspace } = require('../middleware/workspace')
const { requireFeatureFlag } = require('../lib/featureFlags')

// Fallback multipart (solo imagen, sin R2 configurado) — memoryStorage, nunca
// disco, mismo patrón que avatares/logo/banner. El límite de tamaño real de
// imagen (15MB) lo valida el controller; acá el límite de multer es apenas
// más generoso para que el error legible salga del controller, no de multer.
const uploadFallback = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } })

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

const content  = require('../controllers/content.controller')
const assets   = require('../controllers/contentAssets.controller')
const comments = require('../controllers/contentComments.controller')

// Piezas. La lectura queda abierta a cualquier miembro activo; las mutaciones
// validan canWrite() adentro del handler.
router.get   ('/projects/:id/pieces',               content.listPieces)
router.post  ('/projects/:id/pieces',               content.createPiece)
router.get   ('/projects/:id/pieces/:pid',           content.getPiece)
router.patch ('/projects/:id/pieces/:pid',           content.updatePiece)
router.delete('/projects/:id/pieces/:pid',           content.deletePiece)
router.patch ('/projects/:id/pieces/:pid/position',  content.movePiece)
router.get   ('/projects/:id/pieces/:pid/history',   content.getHistory)
router.post  ('/projects/:id/pieces/:pid/send-to-dashboard', content.sendToDashboard)

router.get   ('/projects/:id/summary',     content.getSummary)
router.post  ('/projects/:id/request-approval', content.requestApproval)

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

module.exports = router
