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
    // Una sola query por request: el workspace + la membresía de ESTE usuario (si
    // existe), en vez de dos findUnique secuenciales. `members` viene filtrado por
    // userId (take: 1). Sin cache → la autorización (rol/active/status) siempre lee
    // el estado fresco; sólo bajamos de 2 round-trips a Postgres a 1.
    //
    // omit: NO traer los blobs pesados (logo/banner, hasta 5 MB c/u). Este query
    // corre en CADA request autenticado; arrastrarlos disparaba el egress de
    // Postgres. Quien necesita los bytes (serve de logo/banner) hace su propio
    // select explícito.
    const row = await prisma.workspace.findUnique({
      where: { slug },
      omit: { logoData: true, bannerData: true },
      include: { members: { where: { userId: req.user.userId }, take: 1 } },
    })

    if (!row) {
      return res.status(404).json({ error: 'Workspace no encontrado' })
    }

    // Separamos la membresía de los campos del workspace: `workspace` no debe
    // arrastrar la relación `members` al resto del pipeline.
    const { members, ...workspace } = row
    // En producción el include siempre trae `members` (1 query total). El fallback
    // al findUnique explícito sólo aplica si la relación no vino (defensa; nunca en prod).
    const member = members
      ? (members[0] ?? null)
      : await prisma.workspaceMember.findUnique({
          where: { workspaceId_userId: { workspaceId: workspace.id, userId: req.user.userId } },
        })

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

    // Super admins pueden acceder a cualquier workspace. Si además son miembros,
    // ya tenemos sus datos de miembro (para isAdmin, teamRole, etc.) sin query extra.
    if (req.user?.isSuperAdmin) {
      req.workspace = workspace
      req.workspaceMember = member
      return next()
    }

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

/**
 * Módulo Ventas (CRM): true si el usuario puede operar el CRM.
 * Acceden admins/owners/super admins y los miembros cuyo teamRole está en
 * Workspace.salesRoleNames (el "equipo comercial" configurable por el admin).
 * Debe usarse después de resolveWorkspace.
 */
function isSalesUser(req) {
  const m = req.workspaceMember
  if (req.user?.isSuperAdmin || m?.role === 'admin' || m?.role === 'owner') return true
  if (!m?.teamRole) return false
  const raw = req.workspace?.salesRoleNames
  const roles = Array.isArray(raw) ? raw : (() => { try { return JSON.parse(raw || '[]') } catch { return [] } })()
  return roles.includes(m.teamRole)
}

/** Requiere acceso al módulo de Ventas (equipo comercial o admin). */
function salesGuard(req, res, next) {
  if (isSalesUser(req)) return next()
  return res.status(403).json({ error: 'No tenés acceso al módulo de Ventas' })
}

module.exports = { resolveWorkspace, workspaceAdminOnly, isSalesUser, salesGuard }
