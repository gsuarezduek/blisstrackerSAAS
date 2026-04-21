const bcrypt = require('bcryptjs')
const prisma = require('../lib/prisma')

// Campos personales globales del User (no dependen del workspace)
const PERSONAL_FIELDS = [
  'name',
  'phone', 'birthday', 'address', 'dni', 'cuit', 'alias', 'bankName',
  'maritalStatus', 'children', 'educationLevel', 'educationTitle',
  'bloodType', 'medicalConditions', 'healthInsurance', 'emergencyContact',
]

const USER_SELECT = {
  id: true, name: true, email: true,
  createdAt: true, avatar: true,
  phone: true, birthday: true, address: true, dni: true,
  cuit: true, alias: true, bankName: true, maritalStatus: true, children: true,
  educationLevel: true, educationTitle: true, bloodType: true,
  medicalConditions: true, healthInsurance: true, emergencyContact: true,
}

// Flags de preferencias que viven en WorkspaceMember
const PREF_FLAGS = ['weeklyEmailEnabled', 'dailyInsightEnabled', 'insightMemoryEnabled', 'taskQualityEnabled']

// La validación de avatares se hace contra la DB (modelo Avatar) en updateAvatar.

/**
 * GET /api/profile
 * Devuelve datos del User + preferencias del WorkspaceMember actual.
 */
async function getProfile(req, res, next) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: USER_SELECT,
    })
    const member = req.workspaceMember

    res.json({
      ...user,
      role: member?.teamRole ?? '',
      isAdmin: member?.role === 'admin' || member?.role === 'owner',
      weeklyEmailEnabled: member?.weeklyEmailEnabled ?? true,
      dailyInsightEnabled: member?.dailyInsightEnabled ?? true,
      insightMemoryEnabled: member?.insightMemoryEnabled ?? true,
      taskQualityEnabled: member?.taskQualityEnabled ?? true,
    })
  } catch (err) { next(err) }
}

/**
 * PATCH /api/profile
 * Actualiza datos personales globales del User.
 */
async function updateProfile(req, res, next) {
  try {
    if ('name' in req.body && !req.body.name?.trim()) {
      return res.status(400).json({ error: 'El nombre no puede estar vacío' })
    }

    const data = {}
    for (const field of PERSONAL_FIELDS) {
      if (field in req.body) {
        if (field === 'name') {
          data.name = req.body.name.trim()
        } else if (field === 'birthday') {
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
      where: { id: req.user.userId },
      data,
      select: USER_SELECT,
    })
    const member = req.workspaceMember
    res.json({
      ...user,
      role: member?.teamRole ?? '',
      isAdmin: member?.role === 'admin' || member?.role === 'owner',
      weeklyEmailEnabled: member?.weeklyEmailEnabled ?? true,
      dailyInsightEnabled: member?.dailyInsightEnabled ?? true,
      insightMemoryEnabled: member?.insightMemoryEnabled ?? true,
      taskQualityEnabled: member?.taskQualityEnabled ?? true,
    })
  } catch (err) { next(err) }
}

/**
 * PATCH /api/profile/avatar
 */
async function updateAvatar(req, res, next) {
  try {
    const { avatar } = req.body
    const avatarRecord = await prisma.avatar.findUnique({ where: { filename: avatar }, select: { active: true } })
    if (!avatarRecord || !avatarRecord.active) {
      return res.status(400).json({ error: 'Avatar no válido' })
    }
    const user = await prisma.user.update({
      where: { id: req.user.userId },
      data: { avatar },
      select: { id: true, name: true, email: true, avatar: true },
    })
    res.json({ ...user, role: req.workspaceMember?.teamRole ?? '' })
  } catch (err) { next(err) }
}

/**
 * POST /api/profile/change-password
 */
async function changePassword(req, res, next) {
  try {
    const { currentPassword, newPassword } = req.body
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Datos incompletos' })
    }
    if (newPassword.length < 12) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 12 caracteres' })
    }

    const user = await prisma.user.findUnique({ where: { id: req.user.userId } })
    const valid = await bcrypt.compare(currentPassword, user.password)
    if (!valid) {
      return res.status(400).json({ error: 'La contraseña actual es incorrecta' })
    }

    const hashed = await bcrypt.hash(newPassword, 10)
    await prisma.user.update({ where: { id: req.user.userId }, data: { password: hashed } })
    res.json({ message: 'Contraseña actualizada correctamente' })
  } catch (err) { next(err) }
}

/**
 * PATCH /api/profile/preferences
 * Actualiza flags de preferencias en WorkspaceMember.
 */
async function updatePreferences(req, res, next) {
  try {
    const data = {}
    for (const flag of PREF_FLAGS) {
      if (flag in req.body) {
        if (typeof req.body[flag] !== 'boolean') {
          return res.status(400).json({ error: `${flag} debe ser un booleano` })
        }
        data[flag] = req.body[flag]
      }
    }
    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: 'No se enviaron preferencias válidas' })
    }

    const member = await prisma.workspaceMember.update({
      where: {
        workspaceId_userId: {
          workspaceId: req.workspace.id,
          userId: req.user.userId,
        },
      },
      data,
    })

    res.json({
      id: req.user.userId,
      weeklyEmailEnabled: member.weeklyEmailEnabled,
      dailyInsightEnabled: member.dailyInsightEnabled,
      insightMemoryEnabled: member.insightMemoryEnabled,
      taskQualityEnabled: member.taskQualityEnabled,
    })
  } catch (err) { next(err) }
}

/**
 * POST /api/profile/weekly-email/send
 */
async function sendTestWeeklyEmail(req, res, next) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { id: true, name: true, email: true },
    })
    const { sendWeeklyReportForUser } = require('../services/weeklyReport.service')
    await sendWeeklyReportForUser(user, req.workspace)
    res.json({ ok: true, message: `Email enviado a ${user.email}` })
  } catch (err) { next(err) }
}

module.exports = { getProfile, updateProfile, changePassword, updateAvatar, updatePreferences, sendTestWeeklyEmail }
