const bcrypt = require('bcryptjs')
const { sendWelcomeEmail } = require('../services/email.service')
const prisma = require('../lib/prisma')

async function list(req, res, next) {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true, name: true, email: true, role: true, isAdmin: true, active: true, createdAt: true,
        phone: true, birthday: true, address: true, dni: true, cuit: true, alias: true,
        maritalStatus: true, children: true, educationLevel: true, educationTitle: true,
        bloodType: true, medicalConditions: true, healthInsurance: true, emergencyContact: true,
      },
      orderBy: { name: 'asc' },
    })
    res.json(users)
  } catch (err) { next(err) }
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

async function create(req, res, next) {
  try {
    const { name, email, password, role, isAdmin = false } = req.body
    if (!name || !email || !password || !role) {
      return res.status(400).json({ error: 'Todos los campos son requeridos' })
    }
    if (!EMAIL_REGEX.test(email)) {
      return res.status(400).json({ error: 'Email inválido' })
    }
    const hashed = await bcrypt.hash(password, 10)
    const user = await prisma.user.create({
      data: { name, email, password: hashed, role, isAdmin: !!isAdmin },
      select: { id: true, name: true, email: true, role: true, isAdmin: true, active: true },
    })

    // Enviar email de bienvenida (no bloquea si falla)
    sendWelcomeEmail(email, name).catch(err =>
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
    const { name, email, role, active, password, isAdmin } = req.body
    const data = {}
    if (name !== undefined) data.name = name
    if (email !== undefined) {
      if (!EMAIL_REGEX.test(email)) return res.status(400).json({ error: 'Email inválido' })
      data.email = email
    }
    if (role !== undefined) data.role = role
    if (active !== undefined) data.active = active
    if (isAdmin !== undefined) data.isAdmin = !!isAdmin
    if (password) data.password = await bcrypt.hash(password, 10)

    const userId = Number(id)
    const [user] = await prisma.$transaction(async (tx) => {
      if (data.active === false) {
        await tx.projectMember.deleteMany({ where: { userId } })
      }
      const updated = await tx.user.update({
        where: { id: userId },
        data,
        select: { id: true, name: true, email: true, role: true, isAdmin: true, active: true },
      })
      return [updated]
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

async function getUserTasks(req, res, next) {
  try {
    const userId = Number(req.params.id)
    const TZ = 'America/Argentina/Buenos_Aires'
    const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: TZ })
    const [y, m, d] = todayStr.split('-').map(Number)
    const today = new Date(y, m - 1, d)
    const dow = today.getDay()
    const daysToMonday = dow === 0 ? 6 : dow - 1
    const monday = new Date(today)
    monday.setDate(today.getDate() - daysToMonday)
    const weekStart = monday.toISOString().slice(0, 10)
    const weekEnd   = todayStr

    const [activeTasks, completedTasks] = await Promise.all([
      prisma.task.findMany({
        where: { userId, status: { not: 'COMPLETED' } },
        include: { project: true, _count: { select: { comments: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.task.findMany({
        where: {
          userId,
          status: 'COMPLETED',
          workDay: { date: { gte: weekStart, lte: weekEnd } },
        },
        include: { project: true },
        orderBy: { completedAt: 'desc' },
      }),
    ])

    const map = {}
    for (const t of activeTasks) {
      const pid = t.project.id
      if (!map[pid]) map[pid] = { project: t.project, tasks: [] }
      map[pid].tasks.push(t)
    }

    res.json({ byProject: Object.values(map), completedThisWeek: completedTasks })
  } catch (err) { next(err) }
}

module.exports = { list, create, update, remove, getUserTasks }
