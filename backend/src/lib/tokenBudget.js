const prisma = require('./prisma')

/**
 * Devuelve el inicio del mes actual en UTC.
 */
function startOfCurrentMonth() {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), 1)
}

/**
 * Devuelve cuántos tokens consumió el workspace en el mes actual.
 */
async function getMonthlyTokenUsed(workspaceId) {
  const agg = await prisma.aiTokenLog.aggregate({
    where: { workspaceId, createdAt: { gte: startOfCurrentMonth() } },
    _sum:  { inputTokens: true, outputTokens: true },
  })
  return (agg._sum.inputTokens ?? 0) + (agg._sum.outputTokens ?? 0)
}

/**
 * Comprueba el presupuesto mensual del workspace.
 * @returns {{ used: number, limit: number, pct: number, exceeded: boolean, status: 'ok'|'warning'|'critical'|'exceeded' }}
 */
async function getTokenBudget(workspaceId) {
  const ws = await prisma.workspace.findUnique({
    where:  { id: workspaceId },
    select: { monthlyTokenLimit: true },
  })
  const limit = ws?.monthlyTokenLimit ?? 1000000
  const used  = await getMonthlyTokenUsed(workspaceId)
  const pct   = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0

  let status = 'ok'
  if (used >= limit)           status = 'exceeded'
  else if (pct >= 95)          status = 'critical'
  else if (pct >= 90)          status = 'warning'

  return { used, limit, pct, exceeded: used >= limit, status }
}

/**
 * Para controladores HTTP: lanza un error 429 si el workspace superó su límite mensual.
 * No lanza si monthlyTokenLimit === 0 (ilimitado).
 */
async function assertTokenBudget(workspaceId) {
  const ws = await prisma.workspace.findUnique({
    where:  { id: workspaceId },
    select: { monthlyTokenLimit: true },
  })
  if (!ws || ws.monthlyTokenLimit === 0) return // 0 = ilimitado
  const used = await getMonthlyTokenUsed(workspaceId)
  if (used >= ws.monthlyTokenLimit) {
    const err = new Error('Límite mensual de tokens de IA alcanzado para este workspace.')
    err.status = 429
    err.code   = 'TOKEN_BUDGET_EXCEEDED'
    throw err
  }
}

/**
 * Para servicios en background (cron): retorna false si el workspace superó su límite.
 */
async function hasTokenBudget(workspaceId) {
  try {
    await assertTokenBudget(workspaceId)
    return true
  } catch (err) {
    if (err.code === 'TOKEN_BUDGET_EXCEEDED') return false
    throw err
  }
}

module.exports = { getTokenBudget, getMonthlyTokenUsed, assertTokenBudget, hasTokenBudget, startOfCurrentMonth }
