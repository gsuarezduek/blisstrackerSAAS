const { teamPaidAmount, recomputeTeamPaid } = require('../../src/lib/financeExtras')

function payout(amount, deletedAt = null) {
  return { movement: { amount: String(amount), deletedAt } }
}

function fakeTx({ payoutByMovement = null, extra = null } = {}) {
  return {
    financeExtraTeamPayout: { findUnique: jest.fn().mockResolvedValue(payoutByMovement) },
    financeExtra: {
      findUnique: jest.fn().mockResolvedValue(extra),
      update: jest.fn().mockResolvedValue({}),
    },
  }
}

describe('teamPaidAmount', () => {
  it('suma solo los egresos vivos (sin deletedAt), con decimales exactos', () => {
    const total = teamPaidAmount([payout('1000.10'), payout('250.25'), payout('999', new Date())])
    expect(total.toString()).toBe('1250.35')
  })

  it('sin pagos da 0', () => {
    expect(teamPaidAmount([]).toString()).toBe('0')
    expect(teamPaidAmount(undefined).toString()).toBe('0')
  })
})

describe('recomputeTeamPaid', () => {
  it('marca el equipo como pagado cuando lo pagado cubre la parte del equipo', async () => {
    const tx = fakeTx({ extra: { teamAmount: '1500', teamPayouts: [payout('1000'), payout('500')] } })
    await recomputeTeamPaid(tx, { extraId: 7 })
    expect(tx.financeExtra.update).toHaveBeenCalledWith({ where: { id: 7 }, data: { teamPaid: true } })
  })

  it('vuelve a "sin pagar" si se borró uno de los egresos', async () => {
    const tx = fakeTx({ extra: { teamAmount: '1500', teamPayouts: [payout('1000'), payout('500', new Date())] } })
    await recomputeTeamPaid(tx, { extraId: 7 })
    expect(tx.financeExtra.update).toHaveBeenCalledWith({ where: { id: 7 }, data: { teamPaid: false } })
  })

  it('resuelve el extra a partir del movimiento del pago', async () => {
    const tx = fakeTx({ payoutByMovement: { extraId: 3 }, extra: { teamAmount: '100', teamPayouts: [payout('100')] } })
    await recomputeTeamPaid(tx, { movementId: 55 })
    expect(tx.financeExtraTeamPayout.findUnique).toHaveBeenCalledWith({ where: { movementId: 55 }, select: { extraId: true } })
    expect(tx.financeExtra.update).toHaveBeenCalledWith({ where: { id: 3 }, data: { teamPaid: true } })
  })

  it('no hace nada si el movimiento no es un pago al equipo', async () => {
    const tx = fakeTx({ payoutByMovement: null })
    await recomputeTeamPaid(tx, { movementId: 55 })
    expect(tx.financeExtra.findUnique).not.toHaveBeenCalled()
    expect(tx.financeExtra.update).not.toHaveBeenCalled()
  })

  it('no toca un extra sin pagos registrados (conserva el "pagado" manual)', async () => {
    const tx = fakeTx({ extra: { teamAmount: '100', teamPayouts: [] } })
    await recomputeTeamPaid(tx, { extraId: 7 })
    expect(tx.financeExtra.update).not.toHaveBeenCalled()
  })
})
