const bcrypt = require('bcryptjs')
const prisma = require('../lib/prisma')
const { resolveLegajoFields, coerceCustomValue } = require('../lib/legajoCatalog')

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
const PREF_FLAGS = ['weeklyEmailEnabled', 'dailyInsightEnabled', 'insightMemoryEnabled', 'taskQualityEnabled', 'notesBoardEnabled']

// La validación de avatares se hace contra la DB (modelo Avatar) en updateAvatar.

// Arma la respuesta de perfil (datos del User + preferencias y legajoData del WorkspaceMember).
function buildProfileResponse(user, member) {
  return {
    ...user,
    role: member?.teamRole ?? '',
    isAdmin: member?.role === 'admin' || member?.role === 'owner',
    weeklyEmailEnabled: member?.weeklyEmailEnabled ?? true,
    dailyInsightEnabled: member?.dailyInsightEnabled ?? true,
    insightMemoryEnabled: member?.insightMemoryEnabled ?? true,
    taskQualityEnabled: member?.taskQualityEnabled ?? true,
    notesBoardEnabled: member?.notesBoardEnabled ?? true,
    legajoData: member?.legajoData ?? {},
  }
}

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
    res.json(buildProfileResponse(user, req.workspaceMember))
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

    let member = req.workspaceMember
    // Campos custom del legajo → se guardan en WorkspaceMember.legajoData (workspace-scoped).
    if (req.body.legajoData && typeof req.body.legajoData === 'object' && member) {
      const fields = resolveLegajoFields(req.workspace.legajoFields)
      const customByKey = Object.fromEntries(fields.filter(f => !f.builtin).map(f => [f.key, f]))
      const next = { ...(member.legajoData || {}) }
      for (const [key, raw] of Object.entries(req.body.legajoData)) {
        const field = customByKey[key]
        if (!field) continue // ignora claves desconocidas o builtins (esos van en columnas de User)
        const val = coerceCustomValue(field, raw)
        if (val === undefined) delete next[key]
        else next[key] = val
      }
      member = await prisma.workspaceMember.update({
        where: { workspaceId_userId: { workspaceId: req.workspace.id, userId: req.user.userId } },
        data: { legajoData: next },
      })
    }

    res.json(buildProfileResponse(user, member))
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
      notesBoardEnabled: member.notesBoardEnabled,
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
