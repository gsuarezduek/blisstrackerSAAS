const prisma = require('../lib/prisma')

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

    // Super admins pueden acceder a cualquier workspace sin ser miembros
    if (req.user?.isSuperAdmin) {
      req.workspace = workspace
      req.workspaceMember = null
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
