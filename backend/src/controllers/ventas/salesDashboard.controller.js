const prisma = require('../../lib/prisma')
const { todayString } = require('../../utils/dates')

// Rango [inicio, finExclusivo) del mes en curso, anclado al mes local del workspace.
// Usa límites UTC del mes (skew de horas en el borde, irrelevante para tarjetas de dashboard).
function currentMonthRange(tz) {
  const [y, m] = todayString(tz).slice(0, 7).split('-').map(Number)
  return { start: new Date(Date.UTC(y, m - 1, 1)), end: new Date(Date.UTC(y, m, 1)) }
}

// GET /api/ventas/dashboard
async function getDashboard(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const tz = req.workspace.timezone
    const { start, end } = currentMonthRange(tz)
    const todayStr = todayString(tz)

    const [totalLeads, proposalsThisMonth, inProposal, wonThisMonth, lostThisMonth, actions] = await Promise.all([
      prisma.lead.count({ where: { workspaceId } }),
      prisma.proposal.count({ where: { workspaceId, createdAt: { gte: start, lt: end } } }),
      prisma.lead.count({ where: { workspaceId, status: 'propuesta' } }),
      prisma.lead.count({ where: { workspaceId, wonAt:  { gte: start, lt: end } } }),
      prisma.lead.count({ where: { workspaceId, lostAt: { gte: start, lt: end } } }),
      // Próximas acciones pendientes de todo el equipo (no solo las propias), de leads
      // no terminales (ganado/perdido no cuentan).
      prisma.leadAction.findMany({
        where: { workspaceId, status: 'pending', dueAt: { not: null }, lead: { status: { notIn: ['ganado', 'perdido'] } } },
        select: {
          id: true, title: true, dueAt: true,
          lead:  { select: { id: true, title: true, company: { select: { name: true } } } },
          owner: { select: { id: true, name: true, avatar: true } },
        },
        orderBy: { dueAt: 'asc' },
      }),
    ])

    // Bucketea "hoy" vs "vencidas" comparando la fecha (en TZ del workspace) contra hoy.
    const actionsToday = []
    const actionsOverdue = []
    for (const a of actions) {
      const d = a.dueAt.toLocaleDateString('en-CA', { timeZone: tz })
      const item = {
        id: a.lead.id,
        title: a.lead.title || a.lead.company?.name || 'Lead',
        actionTitle: a.title,
        dueAt: a.dueAt,
        owner: a.owner,
      }
      if (d < todayStr) actionsOverdue.push(item)
      else if (d === todayStr) actionsToday.push(item)
    }

    res.json({
      cards: {
        totalLeads,
        proposalsThisMonth,
        inProposal,
        wonThisMonth,
        lostThisMonth,
        actionsTodayCount: actionsToday.length,
        actionsOverdueCount: actionsOverdue.length,
      },
      actionsToday,
      actionsOverdue,
    })
  } catch (err) { next(err) }
}

// GET /api/ventas/team
// Responsables comerciales asignables: miembros activos admin/owner o con teamRole en salesRoleNames.
async function getTeam(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const raw = req.workspace.salesRoleNames
    const salesRoles = Array.isArray(raw) ? raw : (() => { try { return JSON.parse(raw || '[]') } catch { return [] } })()

    const members = await prisma.workspaceMember.findMany({
      where: { workspaceId, active: true },
      select: {
        role: true, teamRole: true,
        user: { select: { id: true, name: true, avatar: true } },
      },
      orderBy: { user: { name: 'asc' } },
    })

    const team = members
      .filter(m => ['admin', 'owner'].includes(m.role) || salesRoles.includes(m.teamRole))
      .map(m => ({ id: m.user.id, name: m.user.name, avatar: m.user.avatar, teamRole: m.teamRole, role: m.role }))

    res.json(team)
  } catch (err) { next(err) }
}

module.exports = { getDashboard, getTeam }
