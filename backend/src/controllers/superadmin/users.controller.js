const prisma = require('../../lib/prisma')

/**
 * GET /api/superadmin/users
 * Lista global de usuarios con búsqueda y paginación.
 * Query: ?search=&limit=50&offset=0&status=all|active|inactive|orphan
 */
async function listUsers(req, res, next) {
  try {
    const { search = '', status = 'all' } = req.query
    const limit  = Math.min(Number(req.query.limit)  || 50, 200)
    const offset = Math.max(Number(req.query.offset) || 0, 0)

    const where = search.trim()
      ? {
          OR: [
            { email: { contains: search.trim(), mode: 'insensitive' } },
            { name:  { contains: search.trim(), mode: 'insensitive' } },
          ],
        }
      : {}

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        select: {
          id:           true,
          name:         true,
          email:        true,
          avatar:       true,
          isSuperAdmin: true,
          createdAt:    true,
          workspaceMembers: {
            select: {
              active:              true,
              role:                true,
              dailyInsightEnabled: true,
              workspace:           { select: { id: true, name: true, slug: true } },
            },
          },
          loginEvents: {
            select:  { loginAt: true },
            orderBy: { loginAt: 'desc' },
            take:    1,
          },
        },
      }),
      prisma.user.count({ where }),
    ])

    const rows = users.map(u => {
      const totalMemberships  = u.workspaceMembers.length
      const activeMemberships = u.workspaceMembers.filter(m => m.active).length
      const lastLoginAt       = u.loginEvents[0]?.loginAt ?? null

      let dailyInsightStatus = 'none'
      if (totalMemberships > 0) {
        const onCount = u.workspaceMembers.filter(m => m.dailyInsightEnabled).length
        if (onCount === totalMemberships)      dailyInsightStatus = 'on'
        else if (onCount === 0)                dailyInsightStatus = 'off'
        else                                   dailyInsightStatus = 'mixed'
      }

      return {
        id:                 u.id,
        name:               u.name,
        email:              u.email,
        avatar:             u.avatar,
        isSuperAdmin:       u.isSuperAdmin,
        createdAt:          u.createdAt,
        totalMemberships,
        activeMemberships,
        lastLoginAt,
        dailyInsightStatus,
        workspaces: u.workspaceMembers.map(m => ({
          id:                  m.workspace.id,
          name:                m.workspace.name,
          slug:                m.workspace.slug,
          role:                m.role,
          active:              m.active,
          dailyInsightEnabled: m.dailyInsightEnabled,
        })),
      }
    })

    const filtered = rows.filter(u => {
      if (status === 'active')   return u.activeMemberships > 0
      if (status === 'inactive') return u.totalMemberships > 0 && u.activeMemberships === 0
      if (status === 'orphan')   return u.totalMemberships === 0
      return true
    })

    res.json({ users: filtered, total })
  } catch (err) { next(err) }
}

/**
 * PATCH /api/superadmin/users/:id/toggle-active
 * Body: { active: boolean }
 * Si active === false: desactiva todas las memberships del usuario (kill switch global).
 * Si active === true:  reactiva todas las memberships del usuario.
 * Nunca aplica a memberships dentro de un workspace cancelado/suspendido.
 */
async function toggleUserActive(req, res, next) {
  try {
    const userId = Number(req.params.id)
    const active = Boolean(req.body.active)

    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' })

    const result = await prisma.workspaceMember.updateMany({
      where: { userId },
      data:  { active },
    })

    res.json({ userId, active, affectedMemberships: result.count })
  } catch (err) { next(err) }
}

/**
 * PATCH /api/superadmin/users/:id/toggle-daily-insight
 * Body: { enabled: boolean }
 * Aplica el cambio a TODAS las memberships del usuario (en todos sus workspaces).
 * Si enabled === false, también desactiva insightMemoryEnabled y taskQualityEnabled
 * (subordinados al master toggle, ver Preferences.jsx).
 */
async function toggleUserDailyInsight(req, res, next) {
  try {
    const userId  = Number(req.params.id)
    const enabled = Boolean(req.body.enabled)

    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' })

    const data = enabled
      ? { dailyInsightEnabled: true }
      : { dailyInsightEnabled: false, insightMemoryEnabled: false, taskQualityEnabled: false }

    const result = await prisma.workspaceMember.updateMany({
      where: { userId },
      data,
    })

    res.json({ userId, enabled, affectedMemberships: result.count })
  } catch (err) { next(err) }
}

/**
 * PATCH /api/superadmin/users/:id/toggle-superadmin
 * Body: { isSuperAdmin: boolean }
 * Otorga o revoca el acceso global a /superadmin. Un super admin no puede
 * quitarse el flag a sí mismo (evita quedarse sin acceso sin que quede otro
 * super admin activo para revertirlo).
 */
async function toggleUserSuperAdmin(req, res, next) {
  try {
    const userId       = Number(req.params.id)
    const isSuperAdmin = Boolean(req.body.isSuperAdmin)

    if (userId === req.user.userId && !isSuperAdmin) {
      return res.status(400).json({ error: 'No podés quitarte a vos mismo el acceso de Super Admin.' })
    }

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } })
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' })

    const updated = await prisma.user.update({
      where: { id: userId },
      data:  { isSuperAdmin },
      select: { id: true, isSuperAdmin: true },
    })

    res.json(updated)
  } catch (err) { next(err) }
}

module.exports = { listUsers, toggleUserActive, toggleUserDailyInsight, toggleUserSuperAdmin }
