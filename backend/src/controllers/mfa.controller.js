const bcrypt = require('bcryptjs')
const prisma = require('../lib/prisma')
const {
  generateSecret, buildOtpauthUri, buildQrDataUrl, verifyTotp,
  hasMfa, readSecret, encryptSecret,
  replaceRecoveryCodes, countUnusedRecoveryCodes, verifySecondFactor,
} = require('../lib/mfa')
const { sendMfaEnabledNotice, sendMfaDisabledNotice } = require('../services/email.service')

// Autoadministración del segundo factor, bajo /api/profile/mfa (auth normal de
// sesión). Opt-in personal: nadie se lo activa a nadie, ni el admin del
// workspace ni un super admin.
//
// Las tres operaciones piden la contraseña como re-autenticación, igual que
// change-password y change-email. En el alta importa tanto como en la baja: con
// una sesión robada, activar un 2FA ajeno dejaría al dueño afuera de su propia
// cuenta para siempre (el reset de contraseña también exige el código).

async function requirePassword(req, res) {
  const { password } = req.body
  const user = await prisma.user.findUnique({ where: { id: req.user.userId } })
  if (!user) {
    res.status(404).json({ error: 'Usuario no encontrado' })
    return null
  }
  if (!password || !(await bcrypt.compare(password, user.password))) {
    res.status(400).json({ error: 'La contraseña no es correcta' })
    return null
  }
  return user
}

/**
 * POST /api/profile/mfa/setup
 * Body: { password }
 * Genera (o regenera) el secret y devuelve el QR. Todavía NO activa nada: el
 * login sigue sin pedir código hasta que /confirm valide el primer TOTP.
 */
async function setup(req, res, next) {
  try {
    const user = await requirePassword(req, res)
    if (!user) return

    if (hasMfa(user)) {
      return res.status(409).json({ error: 'Ya tenés la verificación en dos pasos activa', code: 'MFA_ALREADY_ENABLED' })
    }

    // Un setup nuevo pisa el secret del enrolamiento anterior sin confirmar: si
    // alguien abandonó a mitad de camino, lo que vale es el QR que tiene a la vista.
    const secret = generateSecret()
    await prisma.user.update({
      where: { id: user.id },
      data:  { totpSecret: encryptSecret(secret), totpConfirmedAt: null },
    })

    const otpauthUri = buildOtpauthUri(user.email, secret)
    res.json({
      // `secret` va en la respuesta a propósito: para cargarlo a mano en apps de
      // escritorio o cuando la cámara no puede escanear el QR.
      secret,
      otpauthUri,
      qr: await buildQrDataUrl(otpauthUri),
    })
  } catch (err) { next(err) }
}

/**
 * POST /api/profile/mfa/confirm
 * Body: { code }
 * Valida el primer código (prueba que la app quedó bien cargada) y recién
 * entonces activa el 2FA. Devuelve los códigos de recuperación — única vez que
 * se ven en claro.
 */
async function confirm(req, res, next) {
  try {
    const { code } = req.body
    const user = await prisma.user.findUnique({ where: { id: req.user.userId } })
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' })

    if (hasMfa(user)) {
      return res.status(409).json({ error: 'Ya tenés la verificación en dos pasos activa', code: 'MFA_ALREADY_ENABLED' })
    }
    if (!user.totpSecret) {
      return res.status(400).json({ error: 'Primero generá el código QR', code: 'MFA_SETUP_MISSING' })
    }
    if (!verifyTotp(readSecret(user), code)) {
      return res.status(400).json({
        error: 'El código no es correcto. Revisá que sea el que muestra tu app en este momento.',
        code:  'MFA_CODE_INVALID',
      })
    }

    const [, recoveryCodes] = await Promise.all([
      prisma.user.update({ where: { id: user.id }, data: { totpConfirmedAt: new Date() } }),
      replaceRecoveryCodes(user.id),
    ])

    sendMfaEnabledNotice(user.email, user.name, req.workspace?.id)
      .catch(err => console.error('[MFA] Aviso de activación falló:', err.message))

    res.json({ mfaEnabled: true, recoveryCodes, recoveryCodesLeft: recoveryCodes.length })
  } catch (err) { next(err) }
}

/**
 * POST /api/profile/mfa/disable
 * Body: { password, code }
 * Pide los dos factores que está a punto de desactivar — si alcanzara con la
 * contraseña, el 2FA no agregaría nada contra una contraseña filtrada.
 *
 * Es POST y no DELETE porque necesita cuerpo (password + code), y un DELETE con
 * body es incómodo de mandar y de cachear.
 */
async function disable(req, res, next) {
  try {
    const user = await requirePassword(req, res)
    if (!user) return

    if (!hasMfa(user)) {
      return res.json({ mfaEnabled: false, recoveryCodesLeft: 0 })
    }

    const { ok } = await verifySecondFactor(user, req.body.code)
    if (!ok) {
      return res.status(400).json({
        error: 'El código no es correcto. Podés usar un código de recuperación si perdiste el dispositivo.',
        code:  'MFA_CODE_INVALID',
      })
    }

    await prisma.$transaction([
      prisma.user.update({ where: { id: user.id }, data: { totpSecret: null, totpConfirmedAt: null } }),
      prisma.mfaRecoveryCode.deleteMany({ where: { userId: user.id } }),
    ])

    sendMfaDisabledNotice(user.email, user.name, req.workspace?.id)
      .catch(err => console.error('[MFA] Aviso de desactivación falló:', err.message))

    res.json({ mfaEnabled: false, recoveryCodesLeft: 0 })
  } catch (err) { next(err) }
}

/**
 * POST /api/profile/mfa/recovery-codes
 * Body: { password }
 * Regenera los 10 códigos e invalida los anteriores (los que ya se usaron y los
 * que no). Para cuando quedan pocos o se filtró la lista.
 */
async function regenerateRecoveryCodes(req, res, next) {
  try {
    const user = await requirePassword(req, res)
    if (!user) return

    if (!hasMfa(user)) {
      return res.status(400).json({ error: 'No tenés la verificación en dos pasos activa', code: 'MFA_NOT_ENABLED' })
    }

    const recoveryCodes = await replaceRecoveryCodes(user.id)
    res.json({ recoveryCodes, recoveryCodesLeft: recoveryCodes.length })
  } catch (err) { next(err) }
}

/**
 * GET /api/profile/mfa
 * Estado, para refrescar la sección sin recargar el perfil entero.
 */
async function status(req, res, next) {
  try {
    const user = await prisma.user.findUnique({
      where:  { id: req.user.userId },
      select: { id: true, totpSecret: true, totpConfirmedAt: true },
    })
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' })

    res.json({
      mfaEnabled:        hasMfa(user),
      mfaPendingSetup:   !!(user.totpSecret && !user.totpConfirmedAt),
      confirmedAt:       user.totpConfirmedAt,
      recoveryCodesLeft: user.totpConfirmedAt ? await countUnusedRecoveryCodes(user.id) : 0,
    })
  } catch (err) { next(err) }
}

module.exports = { setup, confirm, disable, regenerateRecoveryCodes, status }
