/**
 * Único punto de la lógica "¿este feature flag está habilitado para este workspace?".
 * Combina el grant de SuperAdmin (enabledGlobally o enabledWorkspaceIds) con el
 * opt-out del propio workspace (Workspace.disabledFeatureKeys). Antes esta cuenta
 * estaba duplicada inline en checkFlag/listWorkspaceFeatures/toggleWorkspaceFeature
 * (featureFlags.controller.js) y en getOnboardingChecklist (workspace.controller.js).
 */

/**
 * ¿SuperAdmin le dio acceso a este flag a este workspace? (enabledGlobally o
 * enabledWorkspaceIds). No mira el opt-out del propio workspace — eso es
 * `isFlagEnabledForWorkspace`. Se usa donde hace falta distinguir "no tiene
 * acceso" (403 al togglear, se excluye del listado) de "tiene acceso pero lo apagó".
 * @param {{ key: string, enabledGlobally: boolean, enabledWorkspaceIds: string } | null} flag
 * @param {number} workspaceId
 * @returns {boolean}
 */
function isGrantedBySuperAdmin(flag, workspaceId) {
  if (!flag) return false
  const ids = JSON.parse(flag.enabledWorkspaceIds || '[]')
  return flag.enabledGlobally || ids.includes(workspaceId)
}

/**
 * ¿El flag está activo para este workspace ahora mismo? Grant de SuperAdmin
 * Y no está en el opt-out del workspace.
 * @param {{ key: string, enabledGlobally: boolean, enabledWorkspaceIds: string } | null} flag
 * @param {number} workspaceId
 * @param {string[]} disabledKeys - Workspace.disabledFeatureKeys ya parseado
 * @returns {boolean}
 */
function isFlagEnabledForWorkspace(flag, workspaceId, disabledKeys) {
  return isGrantedBySuperAdmin(flag, workspaceId) && !disabledKeys.includes(flag.key)
}

/**
 * Middleware: bloquea el acceso a un router completo si el workspace actual no
 * tiene el feature flag `key` habilitado (grant de SuperAdmin + sin opt-out).
 * Debe montarse después de `resolveWorkspace`. Super admins siempre pasan.
 */
function requireFeatureFlag(key) {
  return async (req, res, next) => {
    try {
      if (req.user?.isSuperAdmin) return next()
      const prisma = require('./prisma')
      const flag = await prisma.featureFlag.findUnique({ where: { key } })
      const disabledKeys = JSON.parse(req.workspace?.disabledFeatureKeys ?? '[]')
      if (!isFlagEnabledForWorkspace(flag, req.workspace?.id, disabledKeys)) {
        return res.status(403).json({ error: 'Este módulo no está habilitado para el workspace', code: 'FEATURE_NOT_ENABLED' })
      }
      next()
    } catch (err) { next(err) }
  }
}

/**
 * Set de workspaceIds (activos o en trial) que tienen el flag `key` habilitado
 * ahora mismo (grant de SuperAdmin + sin opt-out). Para usar en crons que iteran
 * todos los workspaces con datos de un módulo — sin esto, un workspace sin el
 * flag (o que hizo opt-out) sigue generando trabajo/costo real cada mes.
 * Mismo patrón que `ventasEnabledWorkspaceIds` en salesReminders.service.js.
 * @param {string} key
 * @returns {Promise<Set<number>>}
 */
async function enabledWorkspaceIds(key) {
  const prisma = require('./prisma')
  const flag = await prisma.featureFlag.findUnique({ where: { key } })
  if (!flag) return new Set()
  const ids = JSON.parse(flag.enabledWorkspaceIds || '[]')
  const all = await prisma.workspace.findMany({
    where: { status: { in: ['active', 'trialing'] } },
    select: { id: true, disabledFeatureKeys: true },
  })
  const enabled = new Set()
  for (const w of all) {
    const disabled = JSON.parse(w.disabledFeatureKeys || '[]')
    if ((flag.enabledGlobally || ids.includes(w.id)) && !disabled.includes(key)) enabled.add(w.id)
  }
  return enabled
}

module.exports = { isGrantedBySuperAdmin, isFlagEnabledForWorkspace, requireFeatureFlag, enabledWorkspaceIds }
