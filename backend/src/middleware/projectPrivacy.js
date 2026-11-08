const prisma = require('../lib/prisma')
const { resolveProjectId } = require('../controllers/projects/_shared')
const { canWrite } = require('../lib/projectAccess')
const { isProjectModuleEnabled, PROJECT_MODULE_LABEL } = require('../lib/projectModules')

// Núcleo del gate: si el proyecto es privado, solo su equipo (ProjectMember) o
// admin/owner pasan — el resto recibe 403 antes de llegar al controller. Para
// un proyecto NO privado no cambia nada (sigue "equipo = etiqueta, no barrera"
// como siempre). Ver concepto "Proyectos privados" en CLAUDE.md.
//
// `moduleKey` suma el segundo gate, el de módulos por proyecto (ver concepto
// "Secciones por proyecto (Marketing, Contenido, Briefs)"): un proyecto con el módulo apagado no
// existe para ese router. Va en la MISMA query que la privacidad para no pagar
// dos lecturas del proyecto por request.
async function checkAccess(req, res, next, idParam, moduleKey = null) {
  try {
    const workspaceId = req.workspace.id
    const projectId = await resolveProjectId(idParam, workspaceId)
    if (!projectId) return res.status(404).json({ error: 'Proyecto no encontrado' })
    const project = await prisma.project.findUnique({
      where:  { id: projectId },
      select: { isPrivate: true, marketingEnabled: true, contenidoEnabled: true },
    })
    if (!project) return res.status(404).json({ error: 'Proyecto no encontrado' })
    if (project.isPrivate && !(await canWrite(req, projectId))) {
      return res.status(403).json({ error: 'Este proyecto es privado: no formás parte del equipo', code: 'PROJECT_PRIVATE' })
    }
    // 404 y no 403: desde esta sección, un proyecto con el módulo apagado es
    // indistinguible de uno que no existe — tampoco aparece en su selector.
    if (moduleKey && !isProjectModuleEnabled(project, moduleKey)) {
      return res.status(404).json({
        error: `Este proyecto no tiene ${PROJECT_MODULE_LABEL[moduleKey]} habilitado`,
        code:  'PROJECT_MODULE_DISABLED',
      })
    }
    req.project = { id: projectId, ...project }
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

// Las dos variantes de arriba + el gate de módulo por proyecto, para los routers
// que son de un módulo entero: `router.param('id', requireProjectModuleParam('contenido'))`
// y `router.use('/projects/:id', requireProjectModulePrefix('marketing'))`.
function requireProjectModuleParam(moduleKey) {
  return (req, res, next, idParam) => checkAccess(req, res, next, idParam, moduleKey)
}

function requireProjectModulePrefix(moduleKey) {
  return (req, res, next) => checkAccess(req, res, next, req.params.id, moduleKey)
}

module.exports = {
  requireProjectAccess,
  requireProjectAccessPrefix,
  requireProjectModuleParam,
  requireProjectModulePrefix,
}
