const bcrypt = require('bcryptjs')
const crypto = require('crypto')
const jwt = require('jsonwebtoken')
const prisma = require('../lib/prisma')
const { resolveLegajoFields, coerceCustomValue } = require('../lib/legajoCatalog')
const { sendEmailChangeVerification } = require('../services/email.service')
const { validatePassword } = require('../lib/passwordPolicy')
const { validateImageUpload } = require('../lib/imageType')
const objectStorage = require('../services/objectStorage.service')

// Mismo mapeo mime→extensión que objectStorage.service.js (no exportado ahí, así
// que se replica acá para nombrar el archivo cuando cae al fallback de DB).
const AVATAR_EXT_BY_MIME = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Campos personales globales del User (no dependen del workspace)
const PERSONAL_FIELDS = [
  'name',
  'phone', 'birthday', 'address', 'dni', 'cuit', 'alias', 'bankName',
  'maritalStatus', 'children', 'educationLevel', 'educationTitle',
  'bloodType', 'medicalConditions', 'healthInsurance', 'emergencyContact',
]

const USER_SELECT = {
  id: true, name: true, email: true,
  googleId: true,
  createdAt: true, avatar: true,
  customAvatar: { select: { filename: true, label: true } }, // foto propia, si tiene una cargada
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
  const { googleId, ...rest } = user
  return {
    ...rest,
    googleConnected: !!googleId,
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
 * Selecciona un avatar del catálogo compartido (ownerId null, activo) o la
 * foto propia del usuario (ownerId === el propio usuario).
 */
async function updateAvatar(req, res, next) {
  try {
    const { avatar } = req.body
    const avatarRecord = await prisma.avatar.findUnique({ where: { filename: avatar }, select: { active: true, ownerId: true } })
    const valid = avatarRecord && (
      (avatarRecord.ownerId === null && avatarRecord.active) ||
      avatarRecord.ownerId === req.user.userId
    )
    if (!valid) {
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
 * POST /api/profile/avatar/upload
 * Sube (o reemplaza) la foto propia del usuario y la selecciona como avatar
 * activo. Guarda en R2 si está configurado (services/objectStorage), si no
 * cae al fallback de bytes en DB — mismo patrón dual que SocialImage. Cada
 * subida genera un filename nuevo (contenido inmutable por key) y borra la
 * fila/objeto anterior, para no dejar huérfanos ni fotos viejas cacheadas.
 */
async function uploadAvatarImage(req, res, next) {
  try {
    if (!req.file) return res.status(400).json({ error: 'No se recibió ninguna imagen' })

    const check = validateImageUpload(req.file.buffer, ['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
    if (!check.ok) {
      return res.status(400).json({ error: 'Formato no soportado. Usá PNG, JPG, WEBP o GIF.' })
    }
    const mimeType = check.mimeType
    const buffer   = req.file.buffer
    const ext      = AVATAR_EXT_BY_MIME[mimeType] || 'bin'
    const filename = `custom-${crypto.randomUUID()}.${ext}`
    const userId   = req.user.userId

    const storageData = objectStorage.isConfigured()
      ? await objectStorage.putObject(buffer, mimeType, { prefix: 'avatars' })
          .then(({ key, size }) => ({ objectKey: key, sizeBytes: size, imageData: null }))
      : { imageData: buffer, sizeBytes: buffer.length, objectKey: null }

    const previous = await prisma.avatar.findUnique({ where: { ownerId: userId }, select: { id: true, objectKey: true } })

    await prisma.$transaction(async (tx) => {
      if (previous) await tx.avatar.delete({ where: { id: previous.id } })
      await tx.avatar.create({
        data: { filename, label: 'Mi foto', order: 0, active: true, mimeType, ownerId: userId, ...storageData },
      })
      await tx.user.update({ where: { id: userId }, data: { avatar: filename } })
    })

    // Best-effort, después de confirmar la transacción: borra el objeto viejo en R2 si tenía.
    if (previous?.objectKey) objectStorage.deleteObject(previous.objectKey).catch(() => {})

    const user = await prisma.user.findUnique({ where: { id: userId }, select: USER_SELECT })
    res.json(buildProfileResponse(user, req.workspaceMember))
  } catch (err) { next(err) }
}

/**
 * DELETE /api/profile/avatar/upload
 * Elimina la foto propia del usuario. Si estaba seleccionada como avatar
 * activo, vuelve al default.
 */
async function deleteAvatarImage(req, res, next) {
  try {
    const userId = req.user.userId
    const existing = await prisma.avatar.findUnique({ where: { ownerId: userId } })
    if (!existing) return res.status(404).json({ error: 'No tenés una foto propia cargada' })

    await prisma.$transaction(async (tx) => {
      await tx.avatar.delete({ where: { id: existing.id } })
      await tx.user.updateMany({ where: { id: userId, avatar: existing.filename }, data: { avatar: '2bee.png' } })
    })

    if (existing.objectKey) objectStorage.deleteObject(existing.objectKey).catch(() => {})

    const user = await prisma.user.findUnique({ where: { id: userId }, select: USER_SELECT })
    res.json(buildProfileResponse(user, req.workspaceMember))
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
    const pwErr = validatePassword(newPassword)
    if (pwErr) return res.status(400).json({ error: pwErr })

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
 * POST /api/profile/change-email
 * Body: { newEmail, password }
 * Pide la contraseña actual como re-autenticación y envía un link de verificación
 * al NUEVO correo. El email solo se cambia cuando se confirma ese link.
 */
async function requestEmailChange(req, res, next) {
  try {
    const { newEmail, password } = req.body
    if (!newEmail || !password) {
      return res.status(400).json({ error: 'Datos incompletos' })
    }
    const email = newEmail.trim()
    if (!EMAIL_RE.test(email)) {
      return res.status(400).json({ error: 'El email no es válido' })
    }

    const user = await prisma.user.findUnique({ where: { id: req.user.userId } })
    const valid = await bcrypt.compare(password, user.password)
    if (!valid) {
      return res.status(400).json({ error: 'La contraseña es incorrecta' })
    }

    if (email.toLowerCase() === user.email.toLowerCase()) {
      return res.status(400).json({ error: 'Ese ya es tu email actual' })
    }

    const taken = await prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      select: { id: true },
    })
    if (taken) {
      return res.status(409).json({ error: 'Ya existe una cuenta con ese email' })
    }

    // Invalida pedidos previos pendientes del mismo usuario.
    await prisma.emailChangeToken.updateMany({
      where: { userId: user.id, used: false },
      data: { used: true },
    })

    const token = crypto.randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000)
    await prisma.emailChangeToken.create({
      data: { token, userId: user.id, newEmail: email, expiresAt },
    })

    const domain = process.env.APP_DOMAIN
    const slug = req.headers['x-workspace']
    const verifyUrl = domain && slug
      ? `https://${slug}.${domain}/verify-email-change?token=${token}`
      : `${process.env.FRONTEND_URL}/verify-email-change?token=${token}`

    await sendEmailChangeVerification(email, user.name, verifyUrl, req.workspace?.id)

    res.json({ message: `Te enviamos un correo de confirmación a ${email}. Abrí el link para aplicar el cambio.` })
  } catch (err) { next(err) }
}

/**
 * POST /api/profile/google-link-token
 * Devuelve un token corto (5 min) que identifica al usuario, para vincular su
 * cuenta de Google desde el popup servido en el dominio raíz (único origen
 * registrado en Google). El popup lo presenta junto al credential de Google a
 * POST /api/auth/connect-google, evitando depender de window.opener (COOP).
 */
async function googleLinkToken(req, res, next) {
  try {
    const linkToken = jwt.sign(
      { userId: req.user.userId, purpose: 'google-link' },
      process.env.JWT_SECRET,
      { expiresIn: '5m' }
    )
    res.json({ linkToken })
  } catch (err) { next(err) }
}

/**
 * DELETE /api/profile/connect-google
 * Desvincula la cuenta de Google. La contraseña sigue siendo método de acceso.
 */
async function disconnectGoogle(req, res, next) {
  try {
    await prisma.user.update({
      where: { id: req.user.userId },
      data: { googleId: null },
    })
    res.json({ googleConnected: false })
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

module.exports = { getProfile, updateProfile, changePassword, requestEmailChange, googleLinkToken, disconnectGoogle, updateAvatar, uploadAvatarImage, deleteAvatarImage, updatePreferences, sendTestWeeklyEmail }
