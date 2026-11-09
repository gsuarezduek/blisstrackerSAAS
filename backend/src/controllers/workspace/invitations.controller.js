const bcrypt = require('bcryptjs')
const crypto = require('crypto')
const jwt = require('jsonwebtoken')
const prisma = require('../../lib/prisma')
const { sendInvitationEmail, sendMfaRecoveryCodeUsedNotice } = require('../../services/email.service')
const { syncSeatsToStripe } = require('../billing.controller')
const { reconcileWorkspaceTier } = require('../../services/billingTier.service')
const { validatePassword } = require('../../lib/passwordPolicy')
const { assertValidMemberRoleAssignment } = require('./_shared')
const { normalizeEmail } = require('../../lib/normalizeEmail')
const { hasMfa, verifySecondFactor, countUnusedRecoveryCodes } = require('../../lib/mfa')
const { assertNotExhausted, registerFailure } = require('../../lib/mfaChallenge')

/**
 * POST /api/workspaces/current/invitations
 * Invitar a alguien por email. Si ya tiene cuenta, se une directamente.
 * Body: { email, memberRole, teamRole }
 */
async function inviteMember(req, res, next) {
  try {
    const { memberRole = 'member', teamRole = '' } = req.body
    const email = normalizeEmail(req.body.email)
    if (!email) return res.status(400).json({ error: 'Email requerido' })
    const roleErr = assertValidMemberRoleAssignment(req, memberRole)
    if (roleErr) return res.status(roleErr.status).json({ error: roleErr.error })

    const workspaceId = req.workspace.id
    const workspace   = req.workspace
    const inviterId   = req.user.userId

    const inviter = await prisma.user.findUnique({
      where: { id: inviterId },
      select: { name: true },
    })

    // Si el email ya tiene cuenta y ya es miembro activo → error
    const existingUser = await prisma.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } } })
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

    sendInvitationEmail(email, inviter.name, workspace.name, joinUrl, workspaceId).catch(err =>
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
    const existingUser = await prisma.user.findFirst({ where: { email: { equals: inv.email, mode: 'insensitive' } } })

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
 * Body: { token, name?, password?, code? }
 *   - Cuenta existente: token + contraseña. Con 2FA, el primer intento sin `code`
 *     responde 401 MFA_REQUIRED (no se avisa antes: el GET de la invitación lo
 *     vería cualquiera con el link).
 *   - Usuario nuevo: token + name + password.
 *
 * El link solo prueba que alguien leyó el mail. No alcanza para abrir sesión:
 * si alcanzara, el 2FA del login y del reset de contraseña se saltearía con
 * una invitación al mismo email.
 */
async function joinWorkspace(req, res, next) {
  try {
    const { token, name, password, code } = req.body
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

    let user = await prisma.user.findFirst({ where: { email: { equals: inv.email, mode: 'insensitive' } } })

    if (!user) {
      // Usuario nuevo — requiere nombre y contraseña
      if (!name || !password) {
        return res.status(400).json({ error: 'Nombre y contraseña requeridos para crear la cuenta' })
      }
      const pwErr = validatePassword(password)
      if (pwErr) return res.status(400).json({ error: pwErr })
      const hashed = await bcrypt.hash(password, 10)
      user = await prisma.user.create({
        data: { name, email: normalizeEmail(inv.email), password: hashed },
      })
    } else {
      // Cuenta que ya existe: la invitación no reemplaza a la contraseña ni al 2FA.
      if (!password) return res.status(400).json({ error: 'Contraseña requerida' })
      const valid = await bcrypt.compare(password, user.password)
      if (!valid) return res.status(401).json({ error: 'Credenciales inválidas' })

      if (hasMfa(user)) {
        const attemptKey = `join:${inv.id}`
        assertNotExhausted(attemptKey)
        if (!code) {
          return res.status(401).json({
            error: 'Esta cuenta tiene verificación en dos pasos. Ingresá el código de tu app de autenticación.',
            code:  'MFA_REQUIRED',
          })
        }
        const { ok, method } = await verifySecondFactor(user, code)
        if (!ok) {
          const attemptsLeft = registerFailure(attemptKey)
          return res.status(401).json({
            error: attemptsLeft > 0
              ? 'El código no es correcto. Revisá que sea el que muestra tu app en este momento.'
              : 'Demasiados códigos incorrectos. Pedí una invitación nueva.',
            code: attemptsLeft > 0 ? 'MFA_CODE_INVALID' : 'MFA_TOO_MANY_ATTEMPTS',
            attemptsLeft,
          })
        }
        if (method === 'recovery') {
          const remaining = await countUnusedRecoveryCodes(user.id)
          sendMfaRecoveryCodeUsedNotice(user.email, user.name, remaining)
            .catch(err => console.error('[MFA] Aviso de código de recuperación falló:', err.message))
        }
      }
    }

    const member = await applyInviteMembership(inv, user)

    // Marcar invitación como usada
    await prisma.workspaceInvitation.update({
      where: { token },
      data: { usedAt: new Date() },
    })

    // Generar JWT para el workspace
    const jwtToken = jwt.sign(
      {
        userId:      user.id,
        workspaceId: inv.workspace.id,
        role:        member.role,
        teamRole:    member.teamRole,
        isSuperAdmin: user.isSuperAdmin ?? false,
        name:        user.name,
        email:       user.email,
      },
      process.env.JWT_SECRET,
      { expiresIn: '12h' }
    )

    // Sincronizar seats en Stripe (fire-and-forget)
    syncSeatsToStripe(workspaceId).catch(err => console.error('[Workspace] Error sincronizando seats (join):', err.message))
    // Reconciliar free tier: sumar un miembro puede superar el límite gratis y pasar a past_due (fire-and-forget)
    reconcileWorkspaceTier(workspaceId).catch(err => console.error('[Workspace] Error reconciliando tier (join):', err.message))

    res.json({
      token:  jwtToken,
      slug:   inv.workspace.slug,
      user:   { id: user.id, name: user.name, email: user.email },
    })
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'Email ya registrado' })
    if (err.status) return res.status(err.status).json({ error: err.message, code: err.code })
    next(err)
  }
}

// Alta o reactivación. Una membresía que ya está activa no cambia de rol: aceptar
// el link no es una vía para bajar a un owner o a un admin. Un owner desactivado
// se reactiva como owner; el rol de la invitación solo aplica al crear la fila o
// al reactivar a quien no era owner.
async function applyInviteMembership(inv, user) {
  const where = { workspaceId_userId: { workspaceId: inv.workspaceId, userId: user.id } }
  const existing = await prisma.workspaceMember.findUnique({ where })
  if (!existing) {
    return prisma.workspaceMember.create({
      data: {
        workspaceId: inv.workspaceId,
        userId: user.id,
        role: inv.memberRole,
        teamRole: inv.teamRole,
        active: true,
      },
    })
  }
  if (existing.active) return existing
  const data = { active: true }
  if (existing.role !== 'owner') {
    data.role = inv.memberRole
    data.teamRole = inv.teamRole
  }
  return prisma.workspaceMember.update({ where, data })
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

module.exports = { inviteMember, getInvitation, joinWorkspace, listInvitations, cancelInvitation }
