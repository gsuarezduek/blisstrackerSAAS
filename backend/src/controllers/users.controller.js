const bcrypt = require('bcryptjs')
const { PrismaClient } = require('@prisma/client')
const { sendWelcomeEmail } = require('../services/email.service')

const prisma = new PrismaClient()

async function list(req, res, next) {
  try {
    const users = await prisma.user.findMany({
      select: { id: true, name: true, email: true, role: true, active: true, createdAt: true },
      orderBy: { name: 'asc' },
    })
    res.json(users)
  } catch (err) { next(err) }
}

async function create(req, res, next) {
  try {
    const { name, email, password, role } = req.body
    if (!name || !email || !password || !role) {
      return res.status(400).json({ error: 'Todos los campos son requeridos' })
    }
    const hashed = await bcrypt.hash(password, 10)
    const user = await prisma.user.create({
      data: { name, email, password: hashed, role },
      select: { id: true, name: true, email: true, role: true, active: true },
    })

    // Enviar email de bienvenida (no bloquea si falla)
    sendWelcomeEmail(email, name, password).catch(err =>
      console.error('[sendWelcomeEmail] Error:', err.message)
    )

    res.status(201).json(user)
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'Email ya registrado' })
    next(err)
  }
}

async function update(req, res, next) {
  try {
    const { id } = req.params
    const { name, email, role, active, password } = req.body
    const data = {}
    if (name !== undefined) data.name = name
    if (email !== undefined) data.email = email
    if (role !== undefined) data.role = role
    if (active !== undefined) data.active = active
    if (password) data.password = await bcrypt.hash(password, 10)

    const user = await prisma.user.update({
      where: { id: Number(id) },
      data,
      select: { id: true, name: true, email: true, role: true, active: true },
    })
    res.json(user)
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Usuario no encontrado' })
    next(err)
  }
}

async function remove(req, res, next) {
  try {
    const { id } = req.params
    await prisma.user.update({
      where: { id: Number(id) },
      data: { active: false },
    })
    res.json({ ok: true })
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Usuario no encontrado' })
    next(err)
  }
}

module.exports = { list, create, update, remove }
