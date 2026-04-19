const bcrypt = require('bcryptjs')
const crypto = require('crypto')
const prisma = require('../lib/prisma')
const { sendWelcomeEmail, sendInvitationEmail, sendWorkspaceDeletionWarning } = require('../services/email.service')

const MEMBER_SELECT = {
  userId: true,
  role: true,
  teamRole: true,
  active: true,
  vacationDays: true,
  joinedAt: true,
  user: {
    select: { id: true, name: true, email: true, avatar: true },
  },
}

/**
 * GET /api/workspaces/mine
 * Lista todos los workspaces del usuario autenticado.
 */
async function getMine(req, res, next) {
  try {
    const members = await prisma.workspaceMember.findMany({
      where: { userId: req.user.userId, active: true },
      include: { workspace: { select: { id: true, name: true, slug: true, status: true } } },
    })
    res.json(members.map(m => ({
      id:   m.workspace.id,
      name: m.workspace.name,
      slug: m.workspace.slug,
      role: m.role,
    })))
  } catch (err) { next(err) }
}

/**
 * GET /api/workspaces/current
 * Info del workspace actual.
 */
async function getCurrent(req, res, next) {
  try {
    const workspace = req.workspace
    const sub = await prisma.subscription.findUnique({
      where: { workspaceId: workspace.id },
    })
    res.json({ ...workspace, subscription: sub })
  } catch (err) { next(err) }
}

/**
 * PATCH /api/workspaces/current
 * Editar nombre, timezone. Solo admin/owner.
 */
async function updateCurrent(req, res, next) {
  try {
    const { name, timezone } = req.body
    const data = {}
    if (name) data.name = name
    if (timezone) data.timezone = timezone

    const workspace = await prisma.workspace.update({
      where: { id: req.workspace.id },
      data,
    })
    res.json(workspace)
  } catch (err) { next(err) }
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

    const workspaceId = req.workspace.id
    const hashed = await bcrypt.hash(password, 10)

    // Upsert del User global (puede ya existir en otro workspace)
    let user = await prisma.user.findUnique({ where: { email } })
    if (!user) {
      user = await prisma.user.create({
        data: { name, email, password: hashed },
      })
      sendWelcomeEmail(email, name).catch(err =>
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
    const { name, email, password, teamRole, memberRole } = req.body
    const workspaceId = req.workspace.id

    const userUpdates = {}
    if (name) userUpdates.name = name
    if (email) userUpdates.email = email
    if (password) {
      const bcrypt = require('bcryptjs')
      userUpdates.password = await bcrypt.hash(password, 10)
    }

    const memberUpdates = {}
    if (teamRole !== undefined) memberUpdates.teamRole = teamRole
    if (memberRole !== undefined) memberUpdates.role = memberRole

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
    })
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Usuario no encontrado' })
    next(err)
  }
}

/**
 * PATCH /api/workspaces/current/members/:userId/toggle-active
 * Activar / desactivar miembro.
 */
async function toggleMemberActive(req, res, next) {
  try {
    const userId = Number(req.params.userId)
    const workspaceId = req.workspace.id

    const member = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
    })
    if (!member) return res.status(404).json({ error: 'Miembro no encontrado' })

    const newActive = !member.active

    await prisma.$transaction(async (tx) => {
      if (!newActive) {
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

    res.json({
      ...user,
      role: updated.teamRole,
      isAdmin: updated.role === 'admin' || updated.role === 'owner',
      active: updated.active,
      vacationDays: updated.vacationDays,
    })
  } catch (err) { next(err) }
}

/**
 * POST /api/workspaces
 * Crear un nuevo workspace (registro público).
 * Body: { workspaceName, slug, ownerName, ownerEmail, ownerPassword }
 */
async function createWorkspace(req, res, next) {
  try {
    const { workspaceName, slug, ownerName, ownerEmail, ownerPassword } = req.body
    if (!workspaceName || !slug || !ownerName || !ownerEmail || !ownerPassword) {
      return res.status(400).json({ error: 'Todos los campos son requeridos' })
    }

    // Validar slug: solo lowercase, números y guiones
    if (!/^[a-z0-9-]{2,30}$/.test(slug)) {
      return res.status(400).json({ error: 'El slug solo puede contener letras minúsculas, números y guiones (2-30 caracteres)' })
    }

    const trialEndsAt = new Date()
    trialEndsAt.setDate(trialEndsAt.getDate() + 14)

    // Si el email ya tiene cuenta, verificar que la contraseña sea correcta
    const existingOwner = await prisma.user.findUnique({ where: { email: ownerEmail } })
    if (existingOwner) {
      const valid = await bcrypt.compare(ownerPassword, existingOwner.password)
      if (!valid) {
        return res.status(401).json({ error: 'Ya existe una cuenta con ese email. La contraseña ingresada es incorrecta.' })
      }
    }

    const hashed = await bcrypt.hash(ownerPassword, 10)

    const result = await prisma.$transaction(async (tx) => {
      // Crear workspace
      const workspace = await tx.workspace.create({
        data: { name: workspaceName, slug, status: 'trialing', trialEndsAt },
      })

      // Upsert owner (puede ya tener cuenta global en otro workspace)
      let owner = await tx.user.findUnique({ where: { email: ownerEmail } })
      if (!owner) {
        owner = await tx.user.create({
          data: { name: ownerName, email: ownerEmail, password: hashed },
        })
      }

      // Crear WorkspaceMember como owner
      await tx.workspaceMember.create({
        data: {
          workspaceId: workspace.id,
          userId: owner.id,
          role: 'owner',
          active: true,
        },
      })

      // Crear suscripción en trial
      await tx.subscription.create({
        data: {
          workspaceId: workspace.id,
          status: 'trialing',
          planName: 'pro',
        },
      })

      // Crear proyecto por defecto con el nombre del workspace
      await tx.project.create({
        data: {
          workspaceId: workspace.id,
          name: workspaceName,
          members: { create: [{ userId: owner.id }] },
        },
      })

      return { workspace, owner }
    })

    sendWelcomeEmail(ownerEmail, ownerName).catch(() => {})

    res.status(201).json({
      workspace: { id: result.workspace.id, name: result.workspace.name, slug: result.workspace.slug },
      user: { id: result.owner.id, name: result.owner.name, email: result.owner.email },
    })
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'El slug o email ya está en uso' })
    next(err)
  }
}

/**
 * GET /api/workspaces/info
 * Información pública del workspace (sin auth). Usada por el frontend en la página de login.
 * Lee el header X-Workspace para identificar el workspace.
 */
async function getInfo(req, res, next) {
  try {
    const slug = req.headers['x-workspace']
    if (!slug) return res.status(400).json({ error: 'Header X-Workspace requerido' })

    const workspace = await prisma.workspace.findUnique({
      where: { slug },
      select: { id: true, name: true, slug: true, status: true },
    })
    if (!workspace) return res.status(404).json({ error: 'Workspace no encontrado' })

    res.json(workspace)
  } catch (err) { next(err) }
}

/**
 * POST /api/workspaces/current/invitations
 * Invitar a alguien por email. Si ya tiene cuenta, se une directamente.
 * Body: { email, memberRole, teamRole }
 */
async function inviteMember(req, res, next) {
  try {
    const { email, memberRole = 'member', teamRole = '' } = req.body
    if (!email) return res.status(400).json({ error: 'Email requerido' })

    const workspaceId = req.workspace.id
    const workspace   = req.workspace
    const inviterId   = req.user.userId

    const inviter = await prisma.user.findUnique({
      where: { id: inviterId },
      select: { name: true },
    })

    // Si el email ya tiene cuenta y ya es miembro activo → error
    const existingUser = await prisma.user.findUnique({ where: { email } })
    if (existingUser) {
      const existingMember = await prisma.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId, userId: existingUser.id } },
      })
      if (existingMember && existingMember.active) {
        return res.status(409).json({ error: 'El usuario ya es miembro de este workspace' })
      }
    }

    // Crear o renovar invitación (eliminar invitaciones previas pendientes para ese email)
    await prisma.workspaceInvitation.deleteMany({
      where: { workspaceId, email, usedAt: null },
    })

    const token = crypto.randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 días

    await prisma.workspaceInvitation.create({
      data: { workspaceId, email, token, memberRole, teamRole, invitedById: inviterId, expiresAt },
    })

    const domain = process.env.APP_DOMAIN || 'blisstracker.app'
    const joinUrl = `https://${domain}/join?token=${token}`

    sendInvitationEmail(email, inviter.name, workspace.name, joinUrl).catch(err =>
      console.error('[sendInvitationEmail] Error:', err.message)
    )

    res.status(201).json({ message: 'Invitación enviada', email })
  } catch (err) { next(err) }
}

/**
 * GET /api/workspaces/invitations/:token
 * Info pública de una invitación (para mostrar en la página de join).
 */
async function getInvitation(req, res, next) {
  try {
    const { token } = req.params

    const inv = await prisma.workspaceInvitation.findUnique({
      where: { token },
      include: {
        workspace: { select: { id: true, name: true, slug: true } },
        invitedBy: { select: { name: true } },
      },
    })

    if (!inv) return res.status(404).json({ error: 'Invitación no encontrada' })
    if (inv.usedAt) return res.status(410).json({ error: 'Esta invitación ya fue utilizada' })
    if (inv.expiresAt < new Date()) return res.status(410).json({ error: 'Esta invitación expiró' })

    // ¿El email ya tiene cuenta?
    const existingUser = await prisma.user.findUnique({ where: { email: inv.email } })

    res.json({
      email:         inv.email,
      workspace:     inv.workspace,
      invitedBy:     inv.invitedBy.name,
      memberRole:    inv.memberRole,
      teamRole:      inv.teamRole,
      hasAccount:    !!existingUser,
      expiresAt:     inv.expiresAt,
    })
  } catch (err) { next(err) }
}

/**
 * POST /api/workspaces/join
 * Aceptar invitación.
 * Body: { token, name?, password? }
 *   - Si tiene cuenta existente: solo token (o token + password para verificar)
 *   - Si es usuario nuevo: token + name + password
 */
async function joinWorkspace(req, res, next) {
  try {
    const { token, name, password } = req.body
    if (!token) return res.status(400).json({ error: 'Token requerido' })

    const inv = await prisma.workspaceInvitation.findUnique({
      where: { token },
      include: {
        workspace: true,
        invitedBy: { select: { name: true } },
      },
    })

    if (!inv) return res.status(404).json({ error: 'Invitación no encontrada' })
    if (inv.usedAt) return res.status(410).json({ error: 'Esta invitación ya fue utilizada' })
    if (inv.expiresAt < new Date()) return res.status(410).json({ error: 'Esta invitación expiró' })

    const workspaceId = inv.workspaceId

    let user = await prisma.user.findUnique({ where: { email: inv.email } })

    if (!user) {
      // Usuario nuevo — requiere nombre y contraseña
      if (!name || !password) {
        return res.status(400).json({ error: 'Nombre y contraseña requeridos para crear la cuenta' })
      }
      if (password.length < 8) {
        return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' })
      }
      const hashed = await bcrypt.hash(password, 10)
      user = await prisma.user.create({
        data: { name, email: inv.email, password: hashed },
      })
    }

    // Upsert WorkspaceMember
    await prisma.workspaceMember.upsert({
      where: { workspaceId_userId: { workspaceId, userId: user.id } },
      create: { workspaceId, userId: user.id, role: inv.memberRole, teamRole: inv.teamRole, active: true },
      update: { role: inv.memberRole, teamRole: inv.teamRole, active: true },
    })

    // Marcar invitación como usada
    await prisma.workspaceInvitation.update({
      where: { token },
      data: { usedAt: new Date() },
    })

    // Generar JWT para el workspace
    const jwt = require('jsonwebtoken')
    const jwtToken = jwt.sign(
      {
        userId:      user.id,
        workspaceId: inv.workspace.id,
        role:        inv.memberRole,
        teamRole:    inv.teamRole,
        isSuperAdmin: user.isSuperAdmin ?? false,
        name:        user.name,
        email:       user.email,
      },
      process.env.JWT_SECRET,
      { expiresIn: '12h' }
    )

    res.json({
      token:  jwtToken,
      slug:   inv.workspace.slug,
      user:   { id: user.id, name: user.name, email: user.email },
    })
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'Email ya registrado' })
    next(err)
  }
}

/**
 * GET /api/workspaces/current/invitations
 * Lista las invitaciones pendientes del workspace.
 */
async function listInvitations(req, res, next) {
  try {
    const invitations = await prisma.workspaceInvitation.findMany({
      where: { workspaceId: req.workspace.id, usedAt: null, expiresAt: { gt: new Date() } },
      include: { invitedBy: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    })
    res.json(invitations.map(inv => ({
      id:         inv.id,
      email:      inv.email,
      memberRole: inv.memberRole,
      teamRole:   inv.teamRole,
      invitedBy:  inv.invitedBy.name,
      expiresAt:  inv.expiresAt,
      createdAt:  inv.createdAt,
    })))
  } catch (err) { next(err) }
}

/**
 * DELETE /api/workspaces/current/invitations/:id
 * Cancelar una invitación pendiente.
 */
async function cancelInvitation(req, res, next) {
  try {
    const id = Number(req.params.id)
    const inv = await prisma.workspaceInvitation.findUnique({ where: { id } })
    if (!inv || inv.workspaceId !== req.workspace.id) {
      return res.status(404).json({ error: 'Invitación no encontrada' })
    }
    await prisma.workspaceInvitation.delete({ where: { id } })
    res.json({ ok: true })
  } catch (err) { next(err) }
}

/**
 * GET /api/workspaces/current/deletion-request
 * Devuelve la solicitud de eliminación activa (si existe).
 */
async function getDeletionRequest(req, res, next) {
  try {
    const req_ = await prisma.workspaceDeletionRequest.findUnique({
      where: { workspaceId: req.workspace.id },
      include: {
        requestedBy: { select: { name: true } },
        cancelledBy: { select: { name: true } },
      },
    })
    res.json(req_ ?? null)
  } catch (err) { next(err) }
}

/**
 * POST /api/workspaces/current/deletion-request
 * Programa la eliminación del workspace en 48 horas.
 * Solo owners.
 */
async function scheduleDeletion(req, res, next) {
  try {
    const workspace   = req.workspace
    const requesterId = req.user.userId

    // Solo el owner puede solicitar la eliminación
    const member = req.workspaceMember
    if (!member || member.role !== 'owner') {
      return res.status(403).json({ error: 'Solo el owner puede eliminar el workspace' })
    }

    // Si ya hay una solicitud activa (no cancelada), rechazar
    const existing = await prisma.workspaceDeletionRequest.findUnique({
      where: { workspaceId: workspace.id },
    })
    if (existing && !existing.cancelledAt) {
      return res.status(409).json({ error: 'Ya hay una solicitud de eliminación activa' })
    }

    const scheduledAt = new Date(Date.now() + 48 * 60 * 60 * 1000)

    // Upsert: si había una cancelada, la reemplazamos
    await prisma.workspaceDeletionRequest.upsert({
      where: { workspaceId: workspace.id },
      create: { workspaceId: workspace.id, requestedById: requesterId, scheduledAt },
      update: { requestedById: requesterId, scheduledAt, cancelledAt: null, cancelledById: null },
    })
    const deletionReq = await prisma.workspaceDeletionRequest.findUnique({
      where: { workspaceId: workspace.id },
      include: {
        requestedBy: { select: { name: true } },
        cancelledBy: { select: { name: true } },
      },
    })

    // Obtener todos los admins/owners activos del workspace
    const admins = await prisma.workspaceMember.findMany({
      where: { workspaceId: workspace.id, active: true, role: { in: ['owner', 'admin'] } },
      include: { user: { select: { name: true, email: true } } },
    })

    const requester = admins.find(a => a.userId === requesterId)
    const requesterName = requester?.user.name ?? 'Un administrador'
    const domain = process.env.APP_DOMAIN || 'blisstracker.app'
    const cancelUrl = `https://${workspace.slug}.${domain}/preferences`

    sendWorkspaceDeletionWarning(
      admins.map(a => a.user.email),
      workspace.name,
      requesterName,
      cancelUrl,
      scheduledAt,
    ).catch(err => console.error('[sendWorkspaceDeletionWarning]', err.message))

    res.status(201).json(deletionReq)
  } catch (err) { next(err) }
}

/**
 * DELETE /api/workspaces/current/deletion-request
 * Cancela la solicitud de eliminación. Cualquier admin puede cancelar.
 */
async function cancelDeletion(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const cancelById  = req.user.userId

    const existing = await prisma.workspaceDeletionRequest.findUnique({
      where: { workspaceId },
    })
    if (!existing || existing.cancelledAt) {
      return res.status(404).json({ error: 'No hay solicitud de eliminación activa' })
    }
    if (existing.scheduledAt < new Date()) {
      return res.status(410).json({ error: 'El plazo ya venció, no se puede cancelar' })
    }

    const updated = await prisma.workspaceDeletionRequest.update({
      where: { workspaceId },
      data: { cancelledAt: new Date(), cancelledById: cancelById },
    })
    res.json(updated)
  } catch (err) { next(err) }
}

/**
 * Ejecuta la eliminación de un workspace y todos sus datos.
 * Llamado desde el cron job.
 */
async function executeWorkspaceDeletion(workspaceId) {
  console.log(`[deletion] Eliminando workspace ${workspaceId}...`)

  // Obtener IDs de proyectos y workdays para borrar tasks
  const [projectIds, workdayIds] = await Promise.all([
    prisma.project.findMany({ where: { workspaceId }, select: { id: true } }).then(r => r.map(p => p.id)),
    prisma.workDay.findMany({ where: { workspaceId }, select: { id: true } }).then(r => r.map(w => w.id)),
  ])

  const taskIds = await prisma.task.findMany({
    where: { OR: [{ workDayId: { in: workdayIds } }, { projectId: { in: projectIds } }] },
    select: { id: true },
  }).then(r => r.map(t => t.id))

  await prisma.$transaction([
    // Nivel más profundo: sessions y comments de tasks
    prisma.taskSession.deleteMany({ where: { taskId: { in: taskIds } } }),
    prisma.taskComment.deleteMany({ where: { taskId: { in: taskIds } } }),
    // Notificaciones y feedbacks
    prisma.notification.deleteMany({ where: { workspaceId } }),
    prisma.feedback.deleteMany({ where: { workspaceId } }),
    // AI logs
    prisma.aiTokenLog.deleteMany({ where: { workspaceId } }),
    prisma.dailyInsight.deleteMany({ where: { workspaceId } }),
    prisma.userInsightMemory.deleteMany({ where: { workspaceId } }),
    // Login history
    prisma.userLogin.deleteMany({ where: { workspaceId } }),
    // Invitaciones
    prisma.workspaceInvitation.deleteMany({ where: { workspaceId } }),
  ])

  // Tasks (después de sus dependencias)
  await prisma.task.deleteMany({ where: { id: { in: taskIds } } })

  await prisma.$transaction([
    // Workdays y proyecto-level
    prisma.workDay.deleteMany({ where: { workspaceId } }),
    prisma.projectMember.deleteMany({ where: { projectId: { in: projectIds } } }),
    prisma.projectService.deleteMany({ where: { projectId: { in: projectIds } } }),
    prisma.projectLink.deleteMany({ where: { projectId: { in: projectIds } } }),
    prisma.project.deleteMany({ where: { workspaceId } }),
    // Roles y servicios
    prisma.roleExpectation.deleteMany({ where: { workspaceId } }),
    prisma.userRole.deleteMany({ where: { workspaceId } }),
    prisma.service.deleteMany({ where: { workspaceId } }),
    // Miembros y suscripción
    prisma.workspaceMember.deleteMany({ where: { workspaceId } }),
    prisma.subscription.deleteMany({ where: { workspaceId } }),
    // Solicitud de eliminación (ON DELETE CASCADE, pero por las dudas)
    prisma.workspaceDeletionRequest.deleteMany({ where: { workspaceId } }),
  ])

  // Finalmente el workspace
  await prisma.workspace.delete({ where: { id: workspaceId } })

  console.log(`[deletion] Workspace ${workspaceId} eliminado.`)
}

module.exports = {
  getMine, getCurrent, updateCurrent, listMembers, addMember, updateMember, toggleMemberActive,
  createWorkspace, getInfo,
  inviteMember, getInvitation, joinWorkspace, listInvitations, cancelInvitation,
  getDeletionRequest, scheduleDeletion, cancelDeletion, executeWorkspaceDeletion,
}
