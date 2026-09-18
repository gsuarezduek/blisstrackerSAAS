const prisma = require('./prisma')

/**
 * Destinatarios internos de un aviso sobre un proyecto: admins/owners activos
 * del workspace + miembros del equipo del proyecto (o solo estos últimos si
 * `includeAdmins:false`). Extraído de notifyReportFeedback
 * (monthlyReport.controller.js) para no triplicar el mismo cálculo — lo
 * consumen el feedback de informes, el login del cliente al portal y las
 * decisiones del cliente sobre piezas de Contenido (aprobó / pidió cambios,
 * `includeAdmins:false` — ese aviso es del equipo del proyecto, no de
 * cualquier admin del workspace ajeno a él).
 *
 * @returns {Promise<{ userIds: number[], emails: string[] }>}
 */
async function getProjectNotifyRecipients(projectId, workspaceId, { includeAdmins = true } = {}) {
  const [activeMembers, projMembers] = await Promise.all([
    prisma.workspaceMember.findMany({
      where:  { workspaceId, active: true },
      select: { userId: true, role: true, user: { select: { email: true } } },
    }),
    prisma.projectMember.findMany({ where: { projectId }, select: { userId: true } }),
  ])

  const projMemberIds = new Set(projMembers.map(p => p.userId))
  const userIds = new Set()
  const emails  = new Set()
  for (const m of activeMembers) {
    const isAdmin      = includeAdmins && (m.role === 'admin' || m.role === 'owner')
    const isProjMember = projMemberIds.has(m.userId)
    if (isAdmin || isProjMember) {
      userIds.add(m.userId)
      if (m.user?.email) emails.add(m.user.email)
    }
  }
  return { userIds: [...userIds], emails: [...emails] }
}

module.exports = { getProjectNotifyRecipients }
