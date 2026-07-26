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

module.exports = { isGrantedBySuperAdmin, isFlagEnabledForWorkspace }
