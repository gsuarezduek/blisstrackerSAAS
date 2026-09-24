/**
 * Único punto de la lógica "¿este usuario puede ver el módulo X del workspace?".
 * Generaliza a 5 módulos (ventas/marketing/contenido/rrhh/calendario) el mecanismo que antes era
 * exclusivo de Ventas (Workspace.salesRoleNames): un miembro accede si es
 * admin/owner, o si el módulo está abierto a todo el workspace (`allMembers`),
 * o si alguno de sus roles (principal o adicionales) está en la lista configurada (`roles`), o si fue agregado
 * individualmente por userId (`userIds`, aunque su rol no esté en la lista).
 * Independiente del feature-flag catalog (backend/src/lib/featureFlags.js) —
 * ese decide si SuperAdmin habilitó el módulo para el workspace; esto decide
 * quién DENTRO del workspace lo ve. Configurable desde Preferencias.
 *
 * RRHH SÍ usa este mecanismo (decisión explícita, a diferencia de EOS y
 * Gamification que siguen estrictamente admin-only): implica que Legajos/Ingresos
 * — datos sensibles como DNI, salud, contacto de emergencia, cuenta bancaria —
 * quedan visibles para cualquier rol al que el admin le dé acceso al módulo, no
 * solo para admins. Por eso su default es `allMembers: false` (opt-in explícito
 * por rol), igual que Ventas.
 *
 * EOS y Gamification siguen sin este mecanismo — quedan estrictamente admin-only
 * (`workspaceAdminOnly`/`AdminRoute`, sin acceso configurable por rol), decisión
 * explícita: datos sensibles (EOS: evaluaciones de personas) o funciones de
 * gestión (Gamification: crear/editar juegos y puntajes del equipo) que no deben
 * poder abrirse a otros roles por error de configuración.
 */

const MODULE_KEYS = ['ventas', 'marketing', 'contenido', 'rrhh', 'calendario']

// allMembers por defecto de cada módulo cuando el workspace no configuró nada.
const MODULE_ACCESS_DEFAULTS = {
  ventas:       { allMembers: false },
  marketing:    { allMembers: true },
  contenido:    { allMembers: true },
  rrhh:         { allMembers: false },
  // Todos necesitan ver/agendar su propia disponibilidad — mismo default que
  // marketing/contenido, no admin-only.
  calendario:   { allMembers: true },
}

/**
 * Config efectiva de un módulo para un workspace: lo guardado en
 * Workspace.moduleAccess[key] si existe, si no el default del catálogo.
 * @param {{ moduleAccess?: any } | null} workspace
 * @param {string} key
 * @returns {{ allMembers: boolean, roles: string[], userIds: number[] }}
 */
function resolveModuleAccess(workspace, key) {
  const stored = workspace?.moduleAccess?.[key]
  const def = MODULE_ACCESS_DEFAULTS[key] || { allMembers: false }
  if (!stored) return { allMembers: def.allMembers, roles: [], userIds: [] }
  return {
    allMembers: !!stored.allMembers,
    roles: Array.isArray(stored.roles) ? stored.roles : [],
    userIds: Array.isArray(stored.userIds) ? stored.userIds.filter(Number.isInteger) : [],
  }
}

/**
 * Todos los roles de equipo de un miembro: el principal (teamRole) + los adicionales
 * (extraTeamRoles), sin duplicados ni vacíos.
 * @param {{ teamRole?: string|null, extraTeamRoles?: any } | null} member
 * @returns {string[]}
 */
function memberRoleNames(member) {
  const extra = Array.isArray(member?.extraTeamRoles) ? member.extraTeamRoles : []
  return [...new Set([member?.teamRole, ...extra].filter(r => typeof r === 'string' && r))]
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
  const { allMembers, roles, userIds } = resolveModuleAccess(req.workspace, key)
  if (allMembers) return true
  const userId = m.userId ?? req.user?.userId
  if (userId != null && userIds.includes(userId)) return true
  return memberRoleNames(m).some(r => roles.includes(r))
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
 * Mapa { ventas: bool, marketing: bool, contenido: bool, rrhh: bool } con el
 * acceso del usuario actual a los módulos configurables — para exponer en GET /auth/me.
 * @param {import('express').Request} req
 */
function getAllModuleAccess(req) {
  return Object.fromEntries(MODULE_KEYS.map(key => [key, hasModuleAccess(req, key)]))
}

module.exports = {
  MODULE_KEYS, MODULE_ACCESS_DEFAULTS,
  resolveModuleAccess, hasModuleAccess, memberRoleNames, moduleAccessGuard, getAllModuleAccess,
}
