const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const crypto = require('crypto')
const { PrismaClient } = require('@prisma/client')
const { sendPasswordReset } = require('../services/email.service')

const prisma = new PrismaClient()

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
      { id: user.id, role: user.role, name: user.name, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '12h' }
    )

    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    })
  } catch (err) {
    next(err)
  }
}

async function me(req, res) {
  res.json(req.user)
}

async function forgotPassword(req, res, next) {
  try {
    const { email } = req.body
    console.log('[forgotPassword] email recibido:', email)
    if (!email) return res.status(400).json({ error: 'Email requerido' })

    const user = await prisma.user.findUnique({ where: { email } })
    console.log('[forgotPassword] usuario encontrado:', user ? `id=${user.id}` : 'no encontrado')
    if (!user || !user.active) {
      return res.json({ message: 'Si el email existe, recibirás un correo en breve.' })
    }

    await prisma.passwordResetToken.updateMany({
      where: { userId: user.id, used: false },
      data: { used: true },
    })
    console.log('[forgotPassword] tokens anteriores invalidados')

    const token = crypto.randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000)

    await prisma.passwordResetToken.create({
      data: { token, userId: user.id, expiresAt },
    })
    console.log('[forgotPassword] token creado en DB')

    const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${token}`
    console.log('[forgotPassword] FRONTEND_URL:', process.env.FRONTEND_URL)
    console.log('[forgotPassword] enviando email a:', user.email)

    await sendPasswordReset(user.email, user.name, resetUrl)
    console.log('[forgotPassword] email enviado OK')

    res.json({ message: 'Si el email existe, recibirás un correo en breve.' })
  } catch (err) {
    console.error('[forgotPassword] ERROR:', err.message)
    console.error(err)
    next(err)
  }
}

async function resetPassword(req, res, next) {
  try {
    const { token, password } = req.body
    if (!token || !password) return res.status(400).json({ error: 'Datos incompletos' })
    if (password.length < 6) return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' })

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

module.exports = { login, me, forgotPassword, resetPassword }
