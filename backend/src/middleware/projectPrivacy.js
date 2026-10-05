const prisma = require('../lib/prisma')
const { resolveProjectId } = require('../controllers/projects/_shared')
const { canWrite } = require('../lib/projectAccess')

// Gate reusable como `router.param('id', requireProjectAccess)` en cualquier router
// cuyas rutas usen `:id` para un Project (projects.routes.js, contenido.routes.js).
// Si el proyecto es privado, solo su equipo (ProjectMember) o admin/owner pasan —
// el resto recibe 403 antes de llegar al controller. Para un proyecto NO privado no
// cambia nada (sigue "equipo = etiqueta, no barrera" como siempre).
// Ver concepto "Proyectos privados" en CLAUDE.md.
async function requireProjectAccess(req, res, next, idParam) {
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

module.exports = { requireProjectAccess }
