const bcrypt = require('bcryptjs')
const prisma = require('../lib/prisma')

const PERSONAL_FIELDS = [
  'phone', 'birthday', 'address', 'dni', 'cuit', 'alias', 'bankName',
  'maritalStatus', 'children', 'educationLevel', 'educationTitle',
  'bloodType', 'medicalConditions', 'healthInsurance', 'emergencyContact',
]

const PROFILE_SELECT = {
  id: true, name: true, email: true, role: true,
  createdAt: true, avatar: true, weeklyEmailEnabled: true, dailyInsightEnabled: true, insightMemoryEnabled: true, taskQualityEnabled: true,
  phone: true, birthday: true, address: true, dni: true,
  cuit: true, alias: true, bankName: true, maritalStatus: true, children: true,
  educationLevel: true, educationTitle: true, bloodType: true,
  medicalConditions: true, healthInsurance: true, emergencyContact: true,
}

const ALLOWED_AVATARS = [
  '1babee.png', '2bee.png',
  '11beeartist.png', '12beecoffee.png', '13beecorp.png', '14beefitness.png',
  '15futbee.png', '16beeloween.png', '17beepunk.png', '18golfbee.png',
  '19beenfluencer.png', '20beecypher.png', '21beegamer.png', '22beehacker.png',
  '30harleybee.png', '31beezen.png', '32beezombie.png', '33darthbee.png',
]

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
    if (newPassword.length < 12) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 12 caracteres' })
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
    const data = {}
    if ('weeklyEmailEnabled' in req.body) {
      if (typeof req.body.weeklyEmailEnabled !== 'boolean') {
        return res.status(400).json({ error: 'weeklyEmailEnabled debe ser un booleano' })
      }
      data.weeklyEmailEnabled = req.body.weeklyEmailEnabled
    }
    if ('dailyInsightEnabled' in req.body) {
      if (typeof req.body.dailyInsightEnabled !== 'boolean') {
        return res.status(400).json({ error: 'dailyInsightEnabled debe ser un booleano' })
      }
      data.dailyInsightEnabled = req.body.dailyInsightEnabled
    }
    if ('insightMemoryEnabled' in req.body) {
      if (typeof req.body.insightMemoryEnabled !== 'boolean') {
        return res.status(400).json({ error: 'insightMemoryEnabled debe ser un booleano' })
      }
      data.insightMemoryEnabled = req.body.insightMemoryEnabled
    }
    if ('taskQualityEnabled' in req.body) {
      if (typeof req.body.taskQualityEnabled !== 'boolean') {
        return res.status(400).json({ error: 'taskQualityEnabled debe ser un booleano' })
      }
      data.taskQualityEnabled = req.body.taskQualityEnabled
    }
    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: 'No se enviaron preferencias válidas' })
    }
    const user = await prisma.user.update({
      where: { id: req.user.id },
      data,
      select: { id: true, weeklyEmailEnabled: true, dailyInsightEnabled: true, insightMemoryEnabled: true, taskQualityEnabled: true },
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
