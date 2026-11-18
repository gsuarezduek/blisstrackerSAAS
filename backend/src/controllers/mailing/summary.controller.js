// Vista de Mailing sin proyecto elegido ("Todos los proyectos"): las campañas
// recientes de cada cuenta, para ver de un vistazo qué está saliendo.
const prisma = require('../../lib/prisma')
const { isAdmin } = require('../../lib/projectAccess')
const { MARKETING_PROJECT_WHERE } = require('../../lib/projectModules')

/** GET /api/marketing/summary/mailing */
async function getMailingSummary(req, res, next) {
  try {
    // Mismo criterio de privacidad que el gate por proyecto: un proyecto privado
    // solo aparece para admin/owner o su equipo.
    const privacy = isAdmin(req)
      ? {}
      : { OR: [{ isPrivate: false }, { members: { some: { userId: req.user.userId } } }] }
    const campaigns = await prisma.mailingCampaign.findMany({
      where: {
        workspaceId: req.workspace.id,
        project: { active: true, ...MARKETING_PROJECT_WHERE, ...privacy },
      },
      orderBy: [{ updatedAt: 'desc' }],
      take: 30,
      select: {
        id: true, name: true, status: true, subject: true, scheduledAt: true, launchedAt: true, finishedAt: true,
        recipients: true, sentCount: true, openCount: true, clickCount: true, bounceCount: true, unsubscribeCount: true,
        updatedAt: true, project: { select: { id: true, name: true } },
      },
    })
    res.json({ campaigns })
  } catch (err) { next(err) }
}

module.exports = { getMailingSummary }
