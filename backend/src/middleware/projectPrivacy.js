const prisma = require('../lib/prisma')
const { resolveProjectId } = require('../controllers/projects/_shared')
const { canWrite } = require('../lib/projectAccess')

// Núcleo del gate: si el proyecto es privado, solo su equipo (ProjectMember) o
// admin/owner pasan — el resto recibe 403 antes de llegar al controller. Para
// un proyecto NO privado no cambia nada (sigue "equipo = etiqueta, no barrera"
// como siempre). Ver concepto "Proyectos privados" en CLAUDE.md.
async function checkAccess(req, res, next, idParam) {
  try {
    const workspaceId = req.workspace.id
    const projectId = await resolveProjectId(idParam, workspaceId)
    if (!projectId) return res.status(404).json({ error: 'Proyecto no encontrado' })
    const project = await prisma.project.findUnique({ where: { id: projectId }, select: { isPrivate: true } })
    if (!project) return res.status(404).json({ error: 'Proyecto no encontrado' })
    if (project.isPrivate && !(await canWrite(req, projectId))) {
      return res.status(403).json({ error: 'Este proyecto es privado: no formás parte del equipo', code: 'PROJECT_PRIVATE' })
    }
    req.project = { id: projectId, isPrivate: project.isPrivate }
    next()
  } catch (err) { next(err) }
}

// Para `router.param('id', requireProjectAccess)` — válido solo cuando ':id' es
// SIEMPRE un projectId en todo el router (projects.routes.js, contenido.routes.js).
// Express invoca el callback con (req, res, next, value).
function requireProjectAccess(req, res, next, idParam) {
  return checkAccess(req, res, next, idParam)
}

// Para `router.use('/projects/:id', requireProjectAccessPrefix)` — cuando el
// router reusa ':id' para OTRA cosa en otras rutas (ej. marketing.routes.js,
// donde '/geo/audits/:id' es el id de un GeoAudit, no de un Project) y por eso
// no se puede usar router.param a secas. Acá Express ya resolvió `req.params.id`
// contra el prefijo '/projects/:id' antes de llamar al middleware, así que solo
// aplica a esas rutas — el resto del router queda intacto.
function requireProjectAccessPrefix(req, res, next) {
  return checkAccess(req, res, next, req.params.id)
}

module.exports = { requireProjectAccess, requireProjectAccessPrefix }
