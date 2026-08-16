const prisma = require('./prisma')

/**
 * Destinatarios internos de un aviso sobre un proyecto: admins/owners activos
 * del workspace + miembros del equipo del proyecto. Extraído de
 * notifyReportFeedback (monthlyReport.controller.js) para no triplicar el
 * mismo cálculo — lo consumen el feedback de informes y las decisiones del
 * cliente sobre piezas de Contenido (aprobó / pidió cambios).
 *
 * @returns {Promise<{ userIds: number[], emails: string[] }>}
 */
async function getProjectNotifyRecipients(projectId, workspaceId) {
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
    const isAdmin      = m.role === 'admin' || m.role === 'owner'
    const isProjMember = projMemberIds.has(m.userId)
    if (isAdmin || isProjMember) {
      userIds.add(m.userId)
      if (m.user?.email) emails.add(m.user.email)
    }
  }
  return { userIds: [...userIds], emails: [...emails] }
}

module.exports = { getProjectNotifyRecipients }
