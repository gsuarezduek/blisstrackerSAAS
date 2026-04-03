const bcrypt = require('bcryptjs')
const prisma = require('../lib/prisma')

const PERSONAL_FIELDS = [
  'phone', 'birthday', 'address', 'dni', 'cuit', 'alias',
  'maritalStatus', 'children', 'educationLevel', 'educationTitle',
  'bloodType', 'medicalConditions', 'healthInsurance', 'emergencyContact',
]

const PROFILE_SELECT = {
  id: true, name: true, email: true, role: true,
  createdAt: true, avatar: true, weeklyEmailEnabled: true,
  phone: true, birthday: true, address: true, dni: true,
  cuit: true, alias: true, maritalStatus: true, children: true,
  educationLevel: true, educationTitle: true, bloodType: true,
  medicalConditions: true, healthInsurance: true, emergencyContact: true,
}

const ALLOWED_AVATARS = ['bee.png', 'bee2.png', 'beeartist.png', 'beecoffee.png', 'beecorp.png', 'beefitness.png', 'beehacker.png', 'beeloween.png', 'beepunk.png', 'beezen.png']

async function getProfile(req, res, next) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: PROFILE_SELECT,
    })
    res.json(user)
  } catch (err) { next(err) }
}

async function updateAvatar(req, res, next) {
  try {
    const { avatar } = req.body
    if (!ALLOWED_AVATARS.includes(avatar)) {
      return res.status(400).json({ error: 'Avatar no válido' })
    }
    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: { avatar },
      select: { id: true, name: true, email: true, role: true, avatar: true },
    })
    res.json(user)
  } catch (err) { next(err) }
}

async function updateProfile(req, res, next) {
  try {
    const data = {}
    for (const field of PERSONAL_FIELDS) {
      if (field in req.body) {
        if (field === 'birthday') {
          data.birthday = req.body.birthday ? new Date(req.body.birthday) : null
        } else if (field === 'children') {
          data.children = req.body.children !== '' && req.body.children !== null
            ? Number(req.body.children)
            : null
        } else {
          data[field] = req.body[field] || null
        }
      }
    }

    const user = await prisma.user.update({
      where: { id: req.user.id },
      data,
      select: PROFILE_SELECT,
    })
    res.json(user)
  } catch (err) { next(err) }
}

async function changePassword(req, res, next) {
  try {
    const { currentPassword, newPassword } = req.body
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Datos incompletos' })
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' })
    }

    const user = await prisma.user.findUnique({ where: { id: req.user.id } })
    const valid = await bcrypt.compare(currentPassword, user.password)
    if (!valid) {
      return res.status(400).json({ error: 'La contraseña actual es incorrecta' })
    }

    const hashed = await bcrypt.hash(newPassword, 10)
    await prisma.user.update({ where: { id: req.user.id }, data: { password: hashed } })
    res.json({ message: 'Contraseña actualizada correctamente' })
  } catch (err) { next(err) }
}

async function updatePreferences(req, res, next) {
  try {
    const { weeklyEmailEnabled } = req.body
    if (typeof weeklyEmailEnabled !== 'boolean') {
      return res.status(400).json({ error: 'weeklyEmailEnabled debe ser un booleano' })
    }
    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: { weeklyEmailEnabled },
      select: { id: true, weeklyEmailEnabled: true },
    })
    res.json(user)
  } catch (err) { next(err) }
}

async function sendTestWeeklyEmail(req, res, next) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, name: true, email: true },
    })
    const { sendWeeklyReportForUser } = require('../services/weeklyReport.service')
    await sendWeeklyReportForUser(user)
    res.json({ ok: true, message: `Email enviado a ${user.email}` })
  } catch (err) { next(err) }
}

module.exports = { getProfile, updateProfile, changePassword, updateAvatar, updatePreferences, sendTestWeeklyEmail }
