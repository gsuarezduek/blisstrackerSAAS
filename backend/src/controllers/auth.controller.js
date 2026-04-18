const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const crypto = require('crypto')
const { sendPasswordReset } = require('../services/email.service')
const { OAuth2Client } = require('google-auth-library')
const prisma = require('../lib/prisma')

/**
 * Genera un JWT con el contexto workspace.
 * payload: { userId, workspaceId, role (workspace role), isSuperAdmin, name, email }
 */
function signToken(user, member, workspace) {
  return jwt.sign(
    {
      userId: user.id,
      workspaceId: workspace.id,
      role: member.role,           // "owner" | "admin" | "member"
      teamRole: member.teamRole,   // "DESIGNER" | "CM" etc.
      isSuperAdmin: user.isSuperAdmin ?? false,
      name: user.name,
      email: user.email,
    },
    process.env.JWT_SECRET,
    { expiresIn: '12h' }
  )
}

/**
 * POST /api/auth/login
 * Body: { email, password }
 * Header: X-Workspace: slug
 *
 * El slug viene en el header porque el login también necesita contexto de workspace
 * para poder emitir el JWT con workspaceId correcto.
 */
async function login(req, res, next) {
  try {
    const { email, password } = req.body
    const slug = req.headers['x-workspace']

    if (!email || !password) {
      return res.status(400).json({ error: 'Email y contraseña requeridos' })
    }
    if (!slug) {
      return res.status(400).json({ error: 'Header X-Workspace requerido' })
    }

    const [user, workspace] = await Promise.all([
      prisma.user.findUnique({ where: { email } }),
      prisma.workspace.findUnique({ where: { slug } }),
    ])

    if (!workspace) {
      return res.status(404).json({ error: 'Workspace no encontrado' })
    }
    if (!user) {
      return res.status(401).json({ error: 'Credenciales inválidas' })
    }

    const valid = await bcrypt.compare(password, user.password)
    if (!valid) {
      return res.status(401).json({ error: 'Credenciales inválidas' })
    }

    const member = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: workspace.id, userId: user.id } },
    })

    if (!member || !member.active) {
      return res.status(403).json({ error: 'No sos miembro de este workspace' })
    }

    const token = signToken(user, member, workspace)

    prisma.userLogin.create({
      data: { userId: user.id, workspaceId: workspace.id, method: 'email' },
    }).catch(() => {})

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: member.teamRole,
        isAdmin: member.role === 'admin' || member.role === 'owner',
        avatar: user.avatar,
        dailyInsightEnabled: member.dailyInsightEnabled,
      },
    })
  } catch (err) {
    next(err)
  }
}

/**
 * GET /api/auth/me
 * Requiere auth + resolveWorkspace (inyectan req.user y req.workspaceMember).
 */
async function me(req, res, next) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { id: true, name: true, email: true, avatar: true, isSuperAdmin: true },
    })

    const member = req.workspaceMember

    res.json({
      ...user,
      role: member?.teamRole ?? '',
      isAdmin: member?.role === 'admin' || member?.role === 'owner',
      dailyInsightEnabled: member?.dailyInsightEnabled ?? true,
    })
  } catch (err) { next(err) }
}

/**
 * POST /api/auth/forgot-password
 */
async function forgotPassword(req, res, next) {
  try {
    const { email } = req.body
    if (!email) return res.status(400).json({ error: 'Email requerido' })

    const user = await prisma.user.findUnique({ where: { email } })
    if (!user) {
      return res.json({ message: 'Si el email existe, recibirás un correo en breve.' })
    }

    await prisma.passwordResetToken.updateMany({
      where: { userId: user.id, used: false },
      data: { used: true },
    })

    const token = crypto.randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000)

    await prisma.passwordResetToken.create({
      data: { token, userId: user.id, expiresAt },
    })

    const domain = process.env.APP_DOMAIN
    const slug = req.headers['x-workspace']
    const resetUrl = domain && slug
      ? `https://${slug}.${domain}/reset-password?token=${token}`
      : `${process.env.FRONTEND_URL}/reset-password?token=${token}`

    await sendPasswordReset(user.email, user.name, resetUrl)

    res.json({ message: 'Si el email existe, recibirás un correo en breve.' })
  } catch (err) {
    next(err)
  }
}

/**
 * POST /api/auth/reset-password
 */
async function resetPassword(req, res, next) {
  try {
    const { token, password } = req.body
    if (!token || !password) return res.status(400).json({ error: 'Datos incompletos' })
    if (password.length < 12) return res.status(400).json({ error: 'La contraseña debe tener al menos 12 caracteres' })

    const resetToken = await prisma.passwordResetToken.findUnique({ where: { token } })

    if (!resetToken || resetToken.used || resetToken.expiresAt < new Date()) {
      return res.status(400).json({ error: 'El enlace es inválido o ha expirado' })
    }

    const hashed = await bcrypt.hash(password, 10)

    await prisma.$transaction([
      prisma.user.update({ where: { id: resetToken.userId }, data: { password: hashed } }),
      prisma.passwordResetToken.update({ where: { id: resetToken.id }, data: { used: true } }),
    ])

    res.json({ message: 'Contraseña actualizada correctamente' })
  } catch (err) {
    next(err)
  }
}

/**
 * POST /api/auth/google
 * Header: X-Workspace: slug
 */
async function googleLogin(req, res, next) {
  try {
    const { credential } = req.body
    const slug = req.headers['x-workspace']

    if (!credential) return res.status(400).json({ error: 'Token de Google requerido' })
    if (!slug) return res.status(400).json({ error: 'Header X-Workspace requerido' })

    const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID)
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    })
    const payload = ticket.getPayload()
    if (!payload.email_verified) {
      return res.status(401).json({ error: 'El email de Google no está verificado' })
    }

    const [user, workspace] = await Promise.all([
      prisma.user.findUnique({ where: { email: payload.email } }),
      prisma.workspace.findUnique({ where: { slug } }),
    ])

    if (!workspace) {
      return res.status(404).json({ error: 'Workspace no encontrado' })
    }
    if (!user) {
      return res.status(404).json({ error: 'No existe una cuenta activa con ese email de Google' })
    }

    const member = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: workspace.id, userId: user.id } },
    })

    if (!member || !member.active) {
      return res.status(403).json({ error: 'No sos miembro de este workspace' })
    }

    const token = signToken(user, member, workspace)

    prisma.userLogin.create({
      data: { userId: user.id, workspaceId: workspace.id, method: 'google' },
    }).catch(() => {})

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: member.teamRole,
        isAdmin: member.role === 'admin' || member.role === 'owner',
        avatar: user.avatar,
        dailyInsightEnabled: member.dailyInsightEnabled,
      },
    })
  } catch (err) {
    next(err)
  }
}

function logout(req, res) {
  res.json({ ok: true })
}

module.exports = { login, me, forgotPassword, resetPassword, googleLogin, logout }
