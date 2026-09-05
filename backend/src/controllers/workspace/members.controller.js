const bcrypt = require('bcryptjs')
const prisma = require('../../lib/prisma')
const { sendWelcomeEmail } = require('../../services/email.service')
const { syncSeatsToStripe } = require('../billing.controller')
const { reconcileWorkspaceTier } = require('../../services/billingTier.service')
const { validatePassword } = require('../../lib/passwordPolicy')
const { assertValidMemberRoleAssignment } = require('./_shared')

const MEMBER_SELECT = {
  userId: true,
  role: true,
  teamRole: true,
  active: true,
  vacationDays: true,
  workStartTime: true,
  workEndTime: true,
  joinedAt: true,
  user: {
    select: { id: true, name: true, email: true, avatar: true },
  },
}

// Valida un horario "HH:MM" (24h). Acepta null/'' (sin horario). Devuelve el valor normalizado o lanza si es inválido.
function normalizeTime(value) {
  if (value === undefined) return undefined
  if (value === null || value === '') return null
  if (typeof value !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) {
    const err = new Error('Horario inválido (formato esperado HH:MM)')
    err.status = 400
    throw err
  }
  return value
}

/**
 * GET /api/workspaces/current/members
 * Listar miembros activos del workspace.
 */
async function listMembers(req, res, next) {
  try {
    const members = await prisma.workspaceMember.findMany({
      where: { workspaceId: req.workspace.id },
      select: MEMBER_SELECT,
      orderBy: { user: { name: 'asc' } },
    })
    // Aplanar para que sea compatible con el frontend existente
    const result = members.map(m => ({
      ...m.user,
      role: m.teamRole,
      isAdmin: m.role === 'admin' || m.role === 'owner',
      memberRole: m.role,
      active: m.active,
      vacationDays: m.vacationDays,
      workStartTime: m.workStartTime,
      workEndTime: m.workEndTime,
      joinedAt: m.joinedAt,
    }))
    res.json(result)
  } catch (err) { next(err) }
}

/**
 * POST /api/workspaces/current/members
 * Invitar / agregar miembro. Crea User si no existe.
 * Body: { name, email, password, teamRole, memberRole }
 */
async function addMember(req, res, next) {
  try {
    const { name, email, password, teamRole = '', memberRole = 'member' } = req.body
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Nombre, email y contraseña son requeridos' })
    }
    const pwErr = validatePassword(password)
    if (pwErr) return res.status(400).json({ error: pwErr })
    const roleErr = assertValidMemberRoleAssignment(req, memberRole)
    if (roleErr) return res.status(roleErr.status).json({ error: roleErr.error })

    const workspaceId = req.workspace.id
    const hashed = await bcrypt.hash(password, 10)

    // Upsert del User global (puede ya existir en otro workspace)
    let user = await prisma.user.findUnique({ where: { email } })
    if (!user) {
      user = await prisma.user.create({
        data: { name, email, password: hashed },
      })
      sendWelcomeEmail(email, name, workspaceId, req.workspace.slug).catch(err =>
        console.error('[sendWelcomeEmail] Error:', err.message)
      )
    }

    // Verificar que no sea ya miembro activo
    const existing = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: user.id } },
    })
    if (existing && existing.active) {
      return res.status(409).json({ error: 'El usuario ya es miembro de este workspace' })
    }

    // Upsert del WorkspaceMember
    const member = await prisma.workspaceMember.upsert({
      where: { workspaceId_userId: { workspaceId, userId: user.id } },
      create: { workspaceId, userId: user.id, role: memberRole, teamRole, active: true },
      update: { role: memberRole, teamRole, active: true },
    })

    res.status(201).json({
      ...user,
      role: member.teamRole,
      isAdmin: member.role === 'admin' || member.role === 'owner',
      memberRole: member.role,
      active: member.active,
      vacationDays: member.vacationDays,
      workStartTime: member.workStartTime,
      workEndTime: member.workEndTime,
    })
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'Email ya registrado' })
    next(err)
  }
}

/**
 * PUT /api/workspaces/current/members/:userId
 * Editar datos de un miembro (nombre, email, teamRole, memberRole, contraseña).
 */
async function updateMember(req, res, next) {
  try {
    const userId = Number(req.params.userId)
    const { name, email, password, teamRole, memberRole, workStartTime, workEndTime } = req.body
    const workspaceId = req.workspace.id

    // Seguridad: el usuario objetivo DEBE ser miembro de este workspace. Sin esta verificación,
    // un admin podría editar nombre/email/contraseña de cualquier usuario global (otros tenants,
    // superadmins) enviando solo `password` — `userUpdates` se aplicaría sin pasar por el scope
    // de `workspaceMember` (que solo corre si hay `memberUpdates`).
    const target = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
    })
    if (!target) return res.status(404).json({ error: 'Miembro no encontrado' })

    const roleErr = assertValidMemberRoleAssignment(req, memberRole)
    if (roleErr) return res.status(roleErr.status).json({ error: roleErr.error })

    const userUpdates = {}
    if (name) userUpdates.name = name
    if (email) userUpdates.email = email
    if (password) {
      const pwErr = validatePassword(password)
      if (pwErr) return res.status(400).json({ error: pwErr })
      userUpdates.password = await bcrypt.hash(password, 10)
    }

    const memberUpdates = {}
    if (teamRole !== undefined) memberUpdates.teamRole = teamRole
    if (memberRole !== undefined) memberUpdates.role = memberRole
    const start = normalizeTime(workStartTime)
    const end = normalizeTime(workEndTime)
    if (start !== undefined) memberUpdates.workStartTime = start
    if (end !== undefined) memberUpdates.workEndTime = end

    await prisma.$transaction(async (tx) => {
      if (Object.keys(userUpdates).length > 0) {
        await tx.user.update({ where: { id: userId }, data: userUpdates })
      }
      if (Object.keys(memberUpdates).length > 0) {
        await tx.workspaceMember.update({
          where: { workspaceId_userId: { workspaceId, userId } },
          data: memberUpdates,
        })
      }
    })

    const [user, member] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, email: true, avatar: true } }),
      prisma.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId, userId } },
      }),
    ])

    res.json({
      ...user,
      role: member.teamRole,
      isAdmin: member.role === 'admin' || member.role === 'owner',
      memberRole: member.role,
      active: member.active,
      vacationDays: member.vacationDays,
      workStartTime: member.workStartTime,
      workEndTime: member.workEndTime,
    })
  } catch (err) {
    if (err.status === 400) return res.status(400).json({ error: err.message })
    if (err.code === 'P2025') return res.status(404).json({ error: 'Usuario no encontrado' })
    next(err)
  }
}

/**
 * GET /api/workspaces/current/members/:userId/pending-tasks
 * Devuelve las tareas no completadas del miembro en el workspace actual.
 * Usado antes de desactivar para decidir qué hacer (reasignar o completar).
 */
async function listMemberPendingTasks(req, res, next) {
  try {
    const userId = Number(req.params.userId)
    const workspaceId = req.workspace.id

    const tasks = await prisma.task.findMany({
      where: {
        userId,
        status: { not: 'COMPLETED' },
        project: { workspaceId },
      },
      select: {
        id: true,
        description: true,
        status: true,
        isBacklog: true,
        starred: true,
        createdAt: true,
        project: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    res.json(tasks)
  } catch (err) { next(err) }
}

/**
 * PATCH /api/workspaces/current/members/:userId/toggle-active
 * Activar / desactivar miembro.
 * Al desactivar acepta opcionalmente:
 *   - taskAction: 'reassign' | 'complete'
 *   - reassignToUserId: number (requerido si taskAction === 'reassign')
 * para manejar las tareas no completadas del usuario.
 */
async function toggleMemberActive(req, res, next) {
  try {
    const userId = Number(req.params.userId)
    const workspaceId = req.workspace.id
    const { taskAction, reassignToUserId } = req.body || {}

    const member = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
    })
    if (!member) return res.status(404).json({ error: 'Miembro no encontrado' })

    const newActive = !member.active

    // Validación: si se está desactivando y se eligió reasignar, el destino debe existir y estar activo
    if (!newActive && taskAction === 'reassign') {
      const targetId = Number(reassignToUserId)
      if (!targetId || targetId === userId) {
        return res.status(400).json({ error: 'Debe elegir un destinatario válido para reasignar las tareas' })
      }
      const target = await prisma.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId, userId: targetId } },
      })
      if (!target || !target.active) {
        return res.status(400).json({ error: 'El destinatario debe ser un miembro activo del workspace' })
      }
    }

    await prisma.$transaction(async (tx) => {
      if (!newActive) {
        // Manejar tareas no completadas del usuario en el workspace
        if (taskAction === 'complete') {
          await tx.task.updateMany({
            where: {
              userId,
              status: { not: 'COMPLETED' },
              project: { workspaceId },
            },
            data: { status: 'COMPLETED', completedAt: new Date() },
          })
        } else if (taskAction === 'reassign') {
          const targetId = Number(reassignToUserId)
          // Pausar las IN_PROGRESS antes de reasignar para no dejar la tarea activa
          // a nombre de otro usuario (que ya podría tener una IN_PROGRESS).
          await tx.task.updateMany({
            where: {
              userId,
              status: 'IN_PROGRESS',
              project: { workspaceId },
            },
            data: { status: 'PAUSED', pausedAt: new Date() },
          })
          await tx.task.updateMany({
            where: {
              userId,
              status: { not: 'COMPLETED' },
              project: { workspaceId },
            },
            data: { userId: targetId },
          })
        }

        // Al desactivar, remover de todos los proyectos del workspace
        const projectIds = (await tx.project.findMany({
          where: { workspaceId },
          select: { id: true },
        })).map(p => p.id)

        if (projectIds.length > 0) {
          await tx.projectMember.deleteMany({
            where: { userId, projectId: { in: projectIds } },
          })
        }
      }
      await tx.workspaceMember.update({
        where: { workspaceId_userId: { workspaceId, userId } },
        data: { active: newActive },
      })
    })

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, avatar: true },
    })
    const updated = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
    })

    // Sincronizar cantidad de seats en Stripe (fire-and-forget)
    syncSeatsToStripe(workspaceId).catch(err => console.error('[Workspace] Error sincronizando seats (member update):', err.message))
    // Reconciliar free tier: activar/desactivar usuarios puede cruzar el límite gratis (fire-and-forget)
    reconcileWorkspaceTier(workspaceId).catch(err => console.error('[Workspace] Error reconciliando tier (member update):', err.message))

    res.json({
      ...user,
      role: updated.teamRole,
      isAdmin: updated.role === 'admin' || updated.role === 'owner',
      active: updated.active,
      vacationDays: updated.vacationDays,
    })
  } catch (err) { next(err) }
}

module.exports = { listMembers, addMember, updateMember, listMemberPendingTasks, toggleMemberActive }
