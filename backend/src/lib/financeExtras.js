/**
 * Pagos al equipo de un Extra (FinanceExtraTeamPayout). Cada pago es un egreso
 * real (FinanceMovement) — el monto pagado se lee SIEMPRE de los egresos vivos
 * (deletedAt null), así editar/borrar/restaurar el egreso desde Egresos se
 * refleja solo, sin duplicar el monto en la fila del pago.
 */
const { toDecimal } = require('./financeMoney')

/** Suma de lo pagado al equipo (egresos vivos) — `payouts` con `movement` incluido. */
function teamPaidAmount(payouts) {
  return (payouts || [])
    .filter(p => p.movement && !p.movement.deletedAt)
    .reduce((s, p) => s.plus(toDecimal(p.movement.amount)), toDecimal(0))
}

/**
 * Recalcula FinanceExtra.teamPaid (lo usa la regla "Pagar al equipo" de
 * Pendientes) a partir de los pagos registrados. Se identifica el extra por
 * `extraId` o por el `movementId` de uno de sus pagos — con un movimiento que
 * no es un pago al equipo no hace nada (así se puede llamar sin chequear antes).
 * Un extra SIN pagos registrados no se toca (conserva el teamPaid manual legacy).
 */
async function recomputeTeamPaid(tx, { extraId, movementId }) {
  let id = extraId
  if (!id && movementId) {
    const payout = await tx.financeExtraTeamPayout.findUnique({ where: { movementId }, select: { extraId: true } })
    id = payout?.extraId
  }
  if (!id) return
  const extra = await tx.financeExtra.findUnique({
    where: { id },
    select: { teamAmount: true, teamPayouts: { include: { movement: { select: { amount: true, deletedAt: true } } } } },
  })
  if (!extra || extra.teamPayouts.length === 0) return
  const teamAmount = toDecimal(extra.teamAmount)
  const teamPaid = teamAmount.greaterThan(0) && teamPaidAmount(extra.teamPayouts).greaterThanOrEqualTo(teamAmount)
  await tx.financeExtra.update({ where: { id }, data: { teamPaid } })
}

module.exports = { teamPaidAmount, recomputeTeamPaid }
