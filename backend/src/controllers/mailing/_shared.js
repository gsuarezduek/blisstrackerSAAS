// Preámbulo común de los handlers de Mailing. El proyecto ya lo resolvió (y
// validó privacidad + módulo Marketing prendido) `requireProjectModulePrefix` en
// marketing.routes.js, que deja `req.project`. Acá solo se suma el permiso de
// escritura: admin/owner o equipo del proyecto, igual que el resto de Marketing.
const { canWrite } = require('../../lib/projectAccess')
const { requestAgentId } = require('../tasks/_shared')

async function resolveCtx(req, res, { write = false } = {}) {
  const projectId = req.project?.id
  if (!projectId) {
    res.status(404).json({ error: 'Proyecto no encontrado' })
    return null
  }
  if (write && !(await canWrite(req, projectId))) {
    res.status(403).json({ error: 'Solo el equipo del proyecto o un admin puede modificar el mailing de este proyecto' })
    return null
  }
  return {
    workspaceId: req.workspace.id,
    projectId,
    userId: req.user.userId,
    agentId: requestAgentId(req),
  }
}

function intParam(v) {
  const n = Number(v)
  return Number.isInteger(n) && n > 0 ? n : null
}

// Errores con `status` (lanzados por los servicios) se responden tal cual.
function sendError(res, next, err) {
  if (err?.status && err.status < 500) {
    return res.status(err.status).json({ error: err.message, ...(err.problems ? { problems: err.problems } : {}) })
  }
  return next(err)
}

module.exports = { resolveCtx, intParam, sendError }
