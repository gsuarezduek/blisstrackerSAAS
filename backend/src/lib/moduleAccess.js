/**
 * Único punto de la lógica "¿este usuario puede ver el módulo X del workspace?".
 * Generaliza a 4 módulos (gamification/ventas/marketing/contenido) el mecanismo
 * que antes era exclusivo de Ventas (Workspace.salesRoleNames): un miembro accede
 * si es admin/owner, o si el módulo está abierto a todo el workspace
 * (`allMembers`), o si su teamRole está en la lista configurada.
 * Independiente del feature-flag catalog (backend/src/lib/featureFlags.js) —
 * ese decide si SuperAdmin habilitó el módulo para el workspace; esto decide
 * quién DENTRO del workspace lo ve. Configurable desde Preferencias.
 *
 * RRHH y EOS NO usan este mecanismo — quedan estrictamente admin-only
 * (`workspaceAdminOnly`/`AdminRoute`, sin acceso configurable por rol), decisión
 * explícita: son datos sensibles (legajos, horarios, evaluaciones de personas)
 * que no deben poder abrirse a otros roles por error de configuración.
 */

const MODULE_KEYS = ['gamification', 'ventas', 'marketing', 'contenido']

// allMembers por defecto de cada módulo cuando el workspace no configuró nada.
const MODULE_ACCESS_DEFAULTS = {
  gamification: { allMembers: false },
  ventas:       { allMembers: false },
  marketing:    { allMembers: true },
  contenido:    { allMembers: true },
}

/**
 * Config efectiva de un módulo para un workspace: lo guardado en
 * Workspace.moduleAccess[key] si existe, si no el default del catálogo.
 * @param {{ moduleAccess?: any } | null} workspace
 * @param {string} key
 * @returns {{ allMembers: boolean, roles: string[] }}
 */
function resolveModuleAccess(workspace, key) {
  const stored = workspace?.moduleAccess?.[key]
  const def = MODULE_ACCESS_DEFAULTS[key] || { allMembers: false }
  if (!stored) return { allMembers: def.allMembers, roles: [] }
  return {
    allMembers: !!stored.allMembers,
    roles: Array.isArray(stored.roles) ? stored.roles : [],
  }
}

/**
 * ¿El usuario de este request puede ver el módulo `key`? Admin/owner siempre
 * puede. Requiere `resolveWorkspace` corrido antes (usa req.workspace/req.workspaceMember).
 * @param {import('express').Request} req
 * @param {string} key
 * @returns {boolean}
 */
function hasModuleAccess(req, key) {
  const m = req.workspaceMember
  if (!m) return false
  if (m.role === 'admin' || m.role === 'owner') return true
  const { allMembers, roles } = resolveModuleAccess(req.workspace, key)
  if (allMembers) return true
  return !!m.teamRole && roles.includes(m.teamRole)
}

/**
 * Middleware: bloquea el acceso a un router/ruta si el usuario no tiene acceso
 * al módulo `key` (ver hasModuleAccess). Debe montarse después de `resolveWorkspace`.
 */
function moduleAccessGuard(key) {
  return (req, res, next) => {
    if (!hasModuleAccess(req, key)) {
      return res.status(403).json({ error: 'No tenés acceso a esta sección' })
    }
    next()
  }
}

/**
 * Mapa { gamification: bool, ventas: bool, ... } con el acceso del usuario actual
 * a los 4 módulos configurables — para exponer en GET /auth/me.
 * @param {import('express').Request} req
 */
function getAllModuleAccess(req) {
  return Object.fromEntries(MODULE_KEYS.map(key => [key, hasModuleAccess(req, key)]))
}

module.exports = {
  MODULE_KEYS, MODULE_ACCESS_DEFAULTS,
  resolveModuleAccess, hasModuleAccess, moduleAccessGuard, getAllModuleAccess,
}
