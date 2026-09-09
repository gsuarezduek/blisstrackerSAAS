const prisma = require('../lib/prisma')

/**
 * Acumulación automática de vacaciones (ver Workspace.vacationAccrual* y
 * WorkspaceMember.nextVacationAccrualAt en el schema). Regla única global por
 * workspace ("+N días cada M meses"), anclada al aniversario de ingreso de cada
 * persona (WorkspaceMember.joinedAt) y NO retroactiva: nadie acumula por
 * períodos anteriores a Workspace.vacationAccrualActivatedAt.
 *
 * Corrido diario vía cron (ver index.js) — idempotente: si el cron estuvo caído
 * varios períodos, `processMemberAccrual` los aplica todos en un loop acotado.
 */

const MAX_CATCHUP_PERIODS = 24 // tope defensivo por si el cron estuvo caído mucho tiempo
const MAX_SEARCH_STEPS = 1200  // tope al buscar la primera fecha de acumulación (~100 años en mensual)

// Suma `months` meses a `date` clampeando fin de mes (31/ene +1 mes → 28/feb, no 3/mar).
function addMonthsClamped(date, months) {
  const d = new Date(date.getTime())
  const day = d.getUTCDate()
  d.setUTCMonth(d.getUTCMonth() + months)
  if (d.getUTCDate() !== day) {
    d.setUTCDate(0) // "día 0" del mes ya avanzado = último día del mes de destino real
  }
  return d
}

// Primera fecha, ancla + k*intervalMonths (k=1,2,...), que caiga en o después de `notBefore`.
function nextAccrualDate(anchorDate, intervalMonths, notBefore) {
  let k = 1
  let candidate = addMonthsClamped(anchorDate, intervalMonths * k)
  while (candidate < notBefore && k < MAX_SEARCH_STEPS) {
    k += 1
    candidate = addMonthsClamped(anchorDate, intervalMonths * k)
  }
  return candidate
}

async function processMemberAccrual(ws, member, now) {
  const activatedAt = ws.vacationAccrualActivatedAt || now

  if (!member.nextVacationAccrualAt) {
    // Primera vez que corre con la acumulación habilitada: calcula la próxima fecha
    // sin acumular todavía (así queda anclada desde el día de activación, no antes).
    const next = nextAccrualDate(member.joinedAt, ws.vacationAccrualIntervalMonths, activatedAt)
    await prisma.workspaceMember.update({
      where: { workspaceId_userId: { workspaceId: ws.id, userId: member.userId } },
      data: { nextVacationAccrualAt: next },
    })
    return
  }

  let next = member.nextVacationAccrualAt
  let vacationDays = member.vacationDays
  let periods = 0
  while (next <= now && periods < MAX_CATCHUP_PERIODS) {
    const prevDays = vacationDays
    // vacationDays es Int en el schema; vacationAccrualDays admite decimales (ej. 0.5/mes) →
    // se redondea al aplicar. El drift acumulado es despreciable para valores típicos (1-5 días).
    vacationDays = Math.round(prevDays + ws.vacationAccrualDays)
    const nextAfter = addMonthsClamped(next, ws.vacationAccrualIntervalMonths)

    await prisma.$transaction([
      prisma.workspaceMember.update({
        where: { workspaceId_userId: { workspaceId: ws.id, userId: member.userId } },
        data: { vacationDays, nextVacationAccrualAt: nextAfter },
      }),
      prisma.vacationAdjustment.create({
        data: {
          workspaceId: ws.id, userId: member.userId, adminId: null,
          prevDays, newDays: vacationDays,
          description: `Acumulación automática (+${ws.vacationAccrualDays} día${ws.vacationAccrualDays === 1 ? '' : 's'})`,
        },
      }),
    ])

    next = nextAfter
    periods += 1
  }
}

async function processWorkspaceAccrual(ws, now) {
  const members = await prisma.workspaceMember.findMany({
    where: { workspaceId: ws.id, active: true },
    select: { userId: true, joinedAt: true, vacationDays: true, nextVacationAccrualAt: true },
  })

  for (const member of members) {
    try {
      await processMemberAccrual(ws, member, now)
    } catch (err) {
      console.error(`[VacationAccrual] Error en member ${member.userId}@workspace ${ws.id}:`, err.message)
    }
  }
}

async function runVacationAccrualCheck() {
  const now = new Date()
  const workspaces = await prisma.workspace.findMany({
    where: { vacationAccrualEnabled: true, status: { in: ['active', 'trialing'] } },
    select: { id: true, vacationAccrualDays: true, vacationAccrualIntervalMonths: true, vacationAccrualActivatedAt: true },
  })

  for (const ws of workspaces) {
    try {
      await processWorkspaceAccrual(ws, now)
    } catch (err) {
      console.error(`[VacationAccrual] Error en workspace ${ws.id}:`, err.message)
    }
  }
}

module.exports = { runVacationAccrualCheck, addMonthsClamped, nextAccrualDate }
