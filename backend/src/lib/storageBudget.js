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

/**
 * Resuelve el límite efectivo (MB) de UNA categoría de storage (Archivos/
 * Contenido/Chat) para un workspace: su override puntual si lo tiene seteado
 * (0 incluido = ilimitado para ese workspace), si no el default global de
 * PlatformSetting. Comparte la resolución `override ?? global` que usan los
 * 3 `assertWithinQuota`/`assertAttachmentQuota` que SÍ bloquean subidas —
 * a diferencia de `getStorageBudget()` de arriba, que es solo informativo.
 * @param {number} workspaceId
 * @param {'projectFilesMaxMbOverride'|'contentStorageMaxMbOverride'|'chatAttachmentMaxMbOverride'} overrideField
 * @param {string} settingKey
 * @returns {Promise<number>} MB (0 = ilimitado)
 */
async function getEffectiveCategoryLimitMb(workspaceId, overrideField, settingKey) {
  const [ws, settings] = await Promise.all([
    prisma.workspace.findUnique({ where: { id: workspaceId }, select: { [overrideField]: true } }),
    getSettings([settingKey]),
  ])
  const override = ws?.[overrideField]
  return override === null || override === undefined ? settings[settingKey] : override
}

module.exports = { getStorageBudget, getEffectiveCategoryLimitMb }
