const prisma = require('./prisma')

// Admin/owner del workspace actual (o super admin).
function isAdmin(req) {
  const m = req.workspaceMember
  return req.user?.isSuperAdmin || m?.role === 'admin' || m?.role === 'owner'
}

// Escritura sobre un proyecto: admin/owner del workspace, o miembro del equipo
// del proyecto (ProjectMember). Mismo criterio en saveInfo/saveSituation/saveLinks,
// briefs, meetings y el portal de cliente.
async function canWrite(req, projectId) {
  if (isAdmin(req)) return true
  const member = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId: req.user.userId } },
  })
  return !!member
}

module.exports = { isAdmin, canWrite }
