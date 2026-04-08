const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const crypto = require('crypto')
const { sendPasswordReset } = require('../services/email.service')
const { OAuth2Client } = require('google-auth-library')
const prisma = require('../lib/prisma')

async function login(req, res, next) {
  try {
    const { email, password } = req.body
    if (!email || !password) {
      return res.status(400).json({ error: 'Email y contraseña requeridos' })
    }

    const user = await prisma.user.findUnique({ where: { email } })
    if (!user || !user.active) {
      return res.status(401).json({ error: 'Credenciales inválidas' })
    }

    const valid = await bcrypt.compare(password, user.password)
    if (!valid) {
      return res.status(401).json({ error: 'Credenciales inválidas' })
    }

    const token = jwt.sign(
      { id: user.id, role: user.role, isAdmin: user.isAdmin, name: user.name, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '12h' }
    )

    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role, isAdmin: user.isAdmin, avatar: user.avatar },
    })
  } catch (err) {
    next(err)
  }
}

async function me(req, res, next) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, name: true, email: true, role: true, isAdmin: true, avatar: true, dailyInsightEnabled: true },
    })
    res.json(user)
  } catch (err) { next(err) }
}

async function forgotPassword(req, res, next) {
  try {
    const { email } = req.body
    if (!email) return res.status(400).json({ error: 'Email requerido' })

    const user = await prisma.user.findUnique({ where: { email } })
    if (!user || !user.active) {
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

    const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${token}`
    await sendPasswordReset(user.email, user.name, resetUrl)

    res.json({ message: 'Si el email existe, recibirás un correo en breve.' })
  } catch (err) {
    next(err)
  }
}

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

async function googleLogin(req, res, next) {
  try {
    const { credential } = req.body
    if (!credential) return res.status(400).json({ error: 'Token de Google requerido' })

    const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID)
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    })
    const payload = ticket.getPayload()
    if (!payload.email_verified) {
      return res.status(401).json({ error: 'El email de Google no está verificado' })
    }
    const email = payload.email

    const user = await prisma.user.findUnique({ where: { email } })
    if (!user || !user.active) {
      return res.status(404).json({ error: 'No existe una cuenta activa con ese email de Google' })
    }

    const token = jwt.sign(
      { id: user.id, role: user.role, isAdmin: user.isAdmin, name: user.name, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '12h' }
    )

    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role, isAdmin: user.isAdmin, avatar: user.avatar },
    })
  } catch (err) {
    next(err)
  }
}

function logout(req, res) {
  // JWT is stateless — actual token removal happens on the client.
  // This endpoint exists as a clean contract and for future token blacklisting.
  res.json({ ok: true })
}

module.exports = { login, me, forgotPassword, resetPassword, googleLogin, logout }
