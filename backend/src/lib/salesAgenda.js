const prisma = require('./prisma')

// Próximas acciones de Ventas que le tocan a UNA persona, en un rango de días.
// No dependen de Workspace.salesTasksProjectId: esa config solo decide si además
// se crea una Task. Acá la acción se ve igual, con o sin tarea.
// `dueAt` se guarda a mediodía UTC (parseDate); el día de pared sale en la tz
// del workspace, el mismo criterio que WorkDay.date.

const CLOSED_LEAD_STATUSES = ['ganado', 'perdido']

function actionDate(dueAt, tz) {
  return new Date(dueAt).toLocaleDateString('en-CA', { timeZone: tz })
}

function shapeSalesAction(row, tz) {
  return {
    id:          row.id,
    title:       row.title,
    date:        actionDate(row.dueAt, tz),
    leadId:      row.lead.id,
    leadTitle:   row.lead.title || null,
    companyName: row.lead.company?.name || null,
    taskId:      row.taskId || null,
  }
}

// Dueño efectivo: el de la acción, o el del lead si la acción no tiene.
async function listOwnSalesActions({ workspaceId, userId, from, to, tz }) {
  const gte = new Date(`${from}T00:00:00.000Z`)
  const lt  = new Date(new Date(`${to}T00:00:00.000Z`).getTime() + 86400000)
  const openLead = { status: { notIn: CLOSED_LEAD_STATUSES }, archived: false }

  const rows = await prisma.leadAction.findMany({
    where: {
      workspaceId,
      status: 'pending',
      dueAt:  { gte, lt },
      OR: [
        { ownerId: userId, lead: openLead },
        { ownerId: null, lead: { ...openLead, ownerId: userId } },
      ],
    },
    select: {
      id: true, title: true, dueAt: true, taskId: true,
      lead: { select: { id: true, title: true, company: { select: { name: true } } } },
    },
    orderBy: { dueAt: 'asc' },
  })

  return rows
    .map(row => shapeSalesAction(row, tz))
    .filter(action => action.date >= from && action.date <= to)
}

module.exports = { actionDate, shapeSalesAction, listOwnSalesActions, CLOSED_LEAD_STATUSES }
