const prisma = require('./prisma')

// Valida que un userId sea miembro ACTIVO del workspace antes de asignarlo como
// responsable (ownerId) de algo — evita asignaciones a gente desactivada/fuera del
// workspace, que quedarían "huérfanas" sin nadie visible que las gestione.
// userId == null es válido (significa "sin asignar").
async function assertActiveMember(userId, workspaceId) {
  if (userId == null) return true
  const m = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: Number(userId) } },
    select: { active: true },
  })
  return !!m?.active
}

module.exports = { assertActiveMember }
