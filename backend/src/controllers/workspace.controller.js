const bcrypt = require('bcryptjs')
const prisma = require('../lib/prisma')
const { sendWelcomeEmail } = require('../services/email.service')

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

module.exports = { getCurrent, updateCurrent, listMembers, addMember, updateMember, toggleMemberActive, createWorkspace, getInfo }
