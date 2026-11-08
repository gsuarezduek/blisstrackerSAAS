const prisma = require('./prisma')

// Tareas de Finanzas (Pendientes) que le tocan a UNA persona, en un rango de
// días. Manuales y generadas por reglas, el mismo criterio: fecha efectiva +
// responsable. No dependen de Workspace.financeTaskProjectId — eso solo decide
// si además existe una Task en el dashboard.
// Pospuesta: el día es postponedUntil, no la fecha original.

function wallDate(value, tz) {
  return new Date(value).toLocaleDateString('en-CA', { timeZone: tz })
}

function effectiveAt(row) {
  if (row.status === 'postponed') return row.postponedUntil || null
  return row.date || null
}

function shapeFinanceTask(row, tz) {
  const at = effectiveAt(row)
  return {
    id:       row.id,
    title:    row.title,
    date:     at ? wallDate(at, tz) : null,
    itemName: row.item?.name || null,
    taskId:   row.taskId || null,
  }
}

async function listOwnFinanceTasks({ workspaceId, userId, from, to, tz }) {
  const gte = new Date(`${from}T00:00:00.000Z`)
  const lt  = new Date(new Date(`${to}T00:00:00.000Z`).getTime() + 86400000)

  const rows = await prisma.financeTask.findMany({
    where: {
      workspaceId,
      responsibleId: userId,
      deletedAt: null,
      OR: [
        { status: 'open', date: { gte, lt } },
        { status: 'postponed', postponedUntil: { gte, lt } },
      ],
    },
    select: {
      id: true, title: true, status: true, date: true, postponedUntil: true, taskId: true,
      item: { select: { name: true } },
    },
    orderBy: { date: 'asc' },
  })

  return rows
    .map(row => shapeFinanceTask(row, tz))
    .filter(task => task.date && task.date >= from && task.date <= to)
}

module.exports = { wallDate, effectiveAt, shapeFinanceTask, listOwnFinanceTasks }
