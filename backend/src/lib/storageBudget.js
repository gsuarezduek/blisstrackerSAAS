const prisma = require('./prisma')
const { getSettings } = require('./platformSettings')
const { computeWorkspaceStorageUsage } = require('../services/workspaceStorage.service')

const MB = 1024 * 1024

/**
 * Presupuesto de almacenamiento del workspace — mirror de `tokenBudget.js`,
 * pero sin `assert`/`has`: a diferencia de los tokens de IA, esto NO bloquea
 * nada. Las cuotas que efectivamente bloquean subidas son
 * `contentStorageMaxMbPerWorkspace`/`projectFilesMaxMbPerWorkspace` (chequeadas
 * en cada `assertWithinQuota` de sus controllers respectivos) — este budget es
 * puramente informativo/de alerta (SuperAdmin + Preferencias → Global del
 * workspace admin).
 * @returns {Promise<{ usedBytes: number, limitBytes: number, pct: number, exceeded: boolean, status: 'ok'|'warning'|'critical'|'exceeded', breakdown: object }>}
 */
async function getStorageBudget(workspaceId) {
  const [ws, settings, usage] = await Promise.all([
    prisma.workspace.findUnique({
      where:  { id: workspaceId },
      select: { storageLimitMb: true },
    }),
    getSettings(['defaultStorageLimitMb', 'storageWarningPct', 'storageCriticalPct']),
    computeWorkspaceStorageUsage(workspaceId),
  ])

  const limitMb    = ws?.storageLimitMb ?? settings.defaultStorageLimitMb
  const limitBytes = limitMb * MB
  const usedBytes  = usage.total
  const pct        = limitBytes > 0 ? Math.min(100, Math.round((usedBytes / limitBytes) * 100)) : 0

  let status = 'ok'
  if (limitBytes > 0 && usedBytes >= limitBytes)  status = 'exceeded'
  else if (pct >= settings.storageCriticalPct)    status = 'critical'
  else if (pct >= settings.storageWarningPct)     status = 'warning'

  return {
    usedBytes,
    limitBytes,
    pct,
    exceeded: limitBytes > 0 && usedBytes >= limitBytes,
    status,
    breakdown: usage,
  }
}

module.exports = { getStorageBudget }
