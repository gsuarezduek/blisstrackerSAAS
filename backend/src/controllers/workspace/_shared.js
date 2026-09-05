const VALID_MEMBER_ROLES = ['owner', 'admin', 'member']

// Valida que `role` sea un rol de workspace válido y que, si se está asignando
// 'owner', quien hace el pedido sea owner — evita que un admin se auto-promueva
// o promueva a otro a owner. `role === undefined` (sin cambios) no valida nada.
function assertValidMemberRoleAssignment(req, role) {
  if (role === undefined) return null
  if (!VALID_MEMBER_ROLES.includes(role)) {
    return { status: 400, error: 'Rol de workspace inválido' }
  }
  if (role === 'owner' && req.workspaceMember?.role !== 'owner') {
    return { status: 403, error: 'Solo un owner puede asignar el rol de owner' }
  }
  return null
}

module.exports = { assertValidMemberRoleAssignment }
