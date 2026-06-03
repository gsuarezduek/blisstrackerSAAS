const prisma = require('../lib/prisma')

// Métodos HTTP de solo lectura — nunca se bloquean por billing.
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

// Base paths exentos del bloqueo de escritura en past_due:
//  - /api/billing → el workspace tiene que poder pagar para salir de past_due
//  - /api/profile → gestión de cuenta propia (password, preferencias), no es "trabajo del producto"
const PAST_DUE_WRITE_EXEMPT = new Set(['/api/billing', '/api/profile'])

/**
 * Resuelve el workspace a partir del header X-Workspace (slug).
 * Inyecta req.workspace y req.workspaceMember.
 *
 * Debe montarse DESPUÉS del middleware `auth` (requiere req.user.userId).
 */
async function resolveWorkspace(req, res, next) {
  const slug = req.headers['x-workspace']
  if (!slug) {
    return res.status(400).json({ error: 'Header X-Workspace requerido' })
  }

  try {
    const workspace = await prisma.workspace.findUnique({
      where: { slug },
    })

    if (!workspace) {
      return res.status(404).json({ error: 'Workspace no encontrado' })
    }

    if (workspace.status === 'suspended' || workspace.status === 'cancelled') {
      return res.status(402).json({ error: 'Workspace suspendido. Verificá el estado de tu suscripción.' })
    }

    // Pago vencido (past_due): se permite leer y pagar, pero se bloquea toda
    // escritura del producto para forzar la activación del plan Pro.
    // Exentos: métodos de lectura, billing/profile y staff (super admins).
    if (
      workspace.status === 'past_due' &&
      !SAFE_METHODS.has(req.method) &&
      !PAST_DUE_WRITE_EXEMPT.has(req.baseUrl) &&
      !req.user?.isSuperAdmin
    ) {
      return res.status(402).json({
        error: 'Tu workspace tiene un pago pendiente. Activá el plan Pro para seguir trabajando.',
        code:  'BILLING_PAST_DUE',
      })
    }

    // Super admins pueden acceder a cualquier workspace.
    // Si además son miembros, cargamos sus datos de miembro (para isAdmin, teamRole, etc.)
    if (req.user?.isSuperAdmin) {
      req.workspace = workspace
      const superMember = await prisma.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId: workspace.id, userId: req.user.userId } },
      })
      req.workspaceMember = superMember ?? null
      return next()
    }

    const member = await prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId: workspace.id,
          userId: req.user.userId,
        },
      },
    })

    if (!member || !member.active) {
      return res.status(403).json({ error: 'No sos miembro de este workspace' })
    }

    req.workspace = workspace
    req.workspaceMember = member
    next()
  } catch (err) {
    next(err)
  }
}

/**
 * Requiere que el miembro tenga role "admin" u "owner" en el workspace actual.
 * Debe ir después de resolveWorkspace.
 */
function workspaceAdminOnly(req, res, next) {
  const member = req.workspaceMember
  // Super admins siempre tienen acceso
  if (req.user?.isSuperAdmin) return next()

  if (!member || (member.role !== 'admin' && member.role !== 'owner')) {
    return res.status(403).json({ error: 'Se requieren permisos de administrador' })
  }
  next()
}

module.exports = { resolveWorkspace, workspaceAdminOnly }
