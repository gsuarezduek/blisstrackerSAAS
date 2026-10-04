const prisma = require('./prisma')

// Admin/owner del workspace actual (según el rol real de su membership).
function isAdmin(req) {
  const m = req.workspaceMember
  return m?.role === 'admin' || m?.role === 'owner'
}

async function isProjectMember(projectId, userId) {
  const member = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
  })
  return !!member
}

// Escritura sobre un proyecto: admin/owner del workspace, o miembro del equipo
// del proyecto (ProjectMember). Mismo criterio en saveInfo/saveLinks,
// briefs, meetings y el portal de cliente. La Situación (saveSituation) es la
// excepción: la puede editar cualquier miembro del workspace.
//
// Es también el criterio de ACCESO a un proyecto privado (ver concepto
// "Proyectos privados"): admin/owner o equipo ven la ficha completa, el resto
// del workspace no — por eso lo reusan tanto las escrituras de siempre como el
// guard de lectura `requireProjectAccess` en projects.routes.js.
async function canWrite(req, projectId) {
  if (isAdmin(req)) return true
  return isProjectMember(projectId, req.user.userId)
}

module.exports = { isAdmin, canWrite, isProjectMember }
