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

// Filtro relacional de Prisma para listas scopeadas por `workspaceId` pero no por
// membresía (licencias, beneficios): la fila cuenta sólo si su `user` sigue siendo
// miembro ACTIVO del workspace. Desactivar a alguien lo saca de RRHH, y sus
// ausencias tienen que irse con él — sin borrar nada, para que reactivarlo las
// devuelva y su legajo (que se pide por userId) las siga mostrando.
const activeMemberUserWhere = workspaceId => ({ workspaceMembers: { some: { workspaceId, active: true } } })

module.exports = { assertActiveMember, activeMemberUserWhere }
