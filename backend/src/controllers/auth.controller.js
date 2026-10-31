const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const crypto = require('crypto')
const { sendPasswordReset, sendEmailChangedNotice, sendMfaRecoveryCodeUsedNotice } = require('../services/email.service')
const { triggerLateCheck } = require('../services/lateNotification.service')
const { OAuth2Client } = require('google-auth-library')
const { isSalesUser } = require('../middleware/workspace')
const { getAllModuleAccess } = require('../lib/moduleAccess')
const prisma = require('../lib/prisma')
const { validatePassword } = require('../lib/passwordPolicy')
const { createAndSendVerificationEmail, RESEND_COOLDOWN_MS } = require('../lib/emailVerification')
const { normalizeEmail } = require('../lib/normalizeEmail')
const { hasMfa, verifySecondFactor, countUnusedRecoveryCodes } = require('../lib/mfa')
const { signChallenge, verifyChallenge, assertNotExhausted, registerFailure, consumeChallenge } = require('../lib/mfaChallenge')

/**
 * Genera un JWT con el contexto workspace.
 * payload: { userId, workspaceId, role (workspace role), isSuperAdmin, name, email }
 */
function signToken(user, member, workspace) {
  return jwt.sign(
    {
      userId: user.id,
      workspaceId: workspace.id,
      role: member.role,           // "owner" | "admin" | "member"
      teamRole: member.teamRole,   // "DESIGNER" | "CM" etc.
      isSuperAdmin: user.isSuperAdmin ?? false,
      name: user.name,
      email: user.email,
    },
    process.env.JWT_SECRET,
    { expiresIn: '12h' }
  )
}

// Formatea el objeto user para la respuesta, dado el member del workspace
function formatUser(user, member) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: member.teamRole,
    isAdmin: member.role === 'admin' || member.role === 'owner',
    avatar: user.avatar,
    emailVerified: user.emailVerified,
    dailyInsightEnabled: member.dailyInsightEnabled,
    notesBoardEnabled: member.notesBoardEnabled,
  }
}

// Registro del ingreso + chequeo de tardanza, best-effort (no bloquea el login).
// `method` es el PROVEEDOR de identidad ("email" | "google" | "switch" | "token"),
// no si hubo segundo factor: RRHH → Ingresos lo muestra como chip y sólo
// distingue Google de Email (ver ingresos.jsx), así que agregarle valores nuevos
// rompería esa vista. Que el login pase por 2FA no cambia cómo entró la persona.
function recordLoginEvent(userId, workspaceId, method, req) {
  prisma.userLogin.create({
    data: { userId, workspaceId, method, userAgent: req.headers['user-agent'] || null },
  })
    .then(() => triggerLateCheck(userId, workspaceId))
    .catch(err => console.error(`[Login] Error al registrar userLogin (${method}):`, err.message))
}

/**
 * Emite la sesión una vez que la identidad quedó probada — contraseña + segundo
 * factor, o Google. Único lugar que arma la respuesta del login: lo comparten
 * `login`, `googleLogin` y `verifyMfa`, que antes tenían tres copias de la
 * resolución de workspace, el chequeo de membresía y el registro del ingreso.
 *
 * Con slug (subdominio) → { token, user }. Sin slug (dominio raíz) → el usuario
 * y TODOS sus workspaces, cada uno con su token ya firmado — por eso el segundo
 * factor tiene que resolverse antes de llegar acá.
 */
async function issueSession(req, res, user, method, slug) {
  if (slug) {
    const workspace = await prisma.workspace.findUnique({ where: { slug }, omit: { logoData: true, bannerData: true } })
    if (!workspace) return res.status(404).json({ error: 'Workspace no encontrado' })

    const member = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: workspace.id, userId: user.id } },
    })
    if (!member || !member.active) {
      return res.status(403).json({ error: 'No sos miembro de este workspace' })
    }

    recordLoginEvent(user.id, workspace.id, method, req)
    return res.json({ token: signToken(user, member, workspace), user: formatUser(user, member) })
  }

  const workspaces = await buildWorkspaceList(user)
  if (!workspaces.length) {
    return res.status(403).json({ error: 'No pertenecés a ningún workspace' })
  }

  return res.json({
    user: { id: user.id, name: user.name, email: user.email, avatar: user.avatar },
    workspaces,
  })
}

// Respuesta del paso intermedio: la contraseña ya validó, falta el código.
// No incluye NADA de sesión (ni token, ni la lista de workspaces).
async function respondMfaRequired(res, user, slug) {
  return res.json({
    mfaRequired: true,
    mfaToken:    signChallenge({ userId: user.id, slug }),
    methods:     ['totp'],
    recoveryCodesLeft: await countUnusedRecoveryCodes(user.id),
  })
}

// Devuelve user + lista de workspaces con token por workspace (para login sin X-Workspace)
async function buildWorkspaceList(user) {
  const members = await prisma.workspaceMember.findMany({
    where: { userId: user.id, active: true },
    include: { workspace: true },
  })
  return members.map(m => ({
    id:   m.workspace.id,
    name: m.workspace.name,
    slug: m.workspace.slug,
    role: m.role,
    token: signToken(user, m, m.workspace),
  }))
}

/**
 * POST /api/auth/login
 * Body: { email, password }
 * Header X-Workspace opcional:
 *   - Con header → responde { token, user } (comportamiento de workspace)
 *   - Sin header  → responde { user, workspaces: [{ id, name, slug, role, token }] }
 *
 * Con 2FA activo responde { mfaRequired, mfaToken, methods } y NADA de sesión:
 * el segundo factor se completa en POST /api/auth/mfa/verify, que termina de
 * emitir exactamente la misma respuesta que este endpoint sin 2FA.
 */
async function login(req, res, next) {
  try {
    const { email, password } = req.body
    const slug = req.headers['x-workspace']

    if (!email || !password) {
      return res.status(400).json({ error: 'Email y contraseña requeridos' })
    }

    const user = await prisma.user.findFirst({ where: { email: { equals: normalizeEmail(email), mode: 'insensitive' } } })
    if (!user) return res.status(401).json({ error: 'Credenciales inválidas' })

    const valid = await bcrypt.compare(password, user.password)
    if (!valid) return res.status(401).json({ error: 'Credenciales inválidas' })

    if (hasMfa(user)) return respondMfaRequired(res, user, slug)

    return issueSession(req, res, user, 'email', slug)
  } catch (err) {
    next(err)
  }
}

/**
 * POST /api/auth/mfa/verify
 * Body: { mfaToken, code }  — `code` es el TOTP de 6 dígitos o un código de
 * recuperación. Público: por definición todavía no hay sesión.
 *
 * El workspace sale del `mfaToken` (quedó fijado al validar la contraseña) y no
 * del header: así nadie cambia de contexto a mitad del flujo.
 */
async function verifyMfa(req, res, next) {
  try {
    const { mfaToken, code } = req.body
    if (!code) return res.status(400).json({ error: 'Código requerido' })

    const challenge = verifyChallenge(mfaToken)

    const user = await prisma.user.findUnique({ where: { id: challenge.userId } })
    // Si el 2FA se desactivó entre el paso 1 y el 2, el desafío ya no aplica:
    // volver a empezar es más claro que emitir la sesión sin segundo factor.
    if (!user || !hasMfa(user)) {
      return res.status(401).json({ error: 'Verificación inválida. Volvé a iniciar sesión.', code: 'MFA_CHALLENGE_INVALID' })
    }

    const { ok, method } = await verifySecondFactor(user, code)
    if (!ok) {
      const attemptsLeft = registerFailure(challenge.jti)
      return res.status(401).json({
        error: attemptsLeft > 0
          ? 'El código no es correcto. Revisá que sea el que muestra tu app en este momento.'
          : 'Demasiados códigos incorrectos. Volvé a iniciar sesión.',
        code: attemptsLeft > 0 ? 'MFA_CODE_INVALID' : 'MFA_TOO_MANY_ATTEMPTS',
        attemptsLeft,
      })
    }

    // De un solo uso: el mfaToken no se puede volver a canjear.
    consumeChallenge(challenge.jti)

    // Un código de recuperación gastado es la señal de que alguien entró sin el
    // dispositivo habitual: se avisa siempre, incluso si fue el dueño.
    if (method === 'recovery') {
      const remaining = await countUnusedRecoveryCodes(user.id)
      sendMfaRecoveryCodeUsedNotice(user.email, user.name, remaining)
        .catch(err => console.error('[MFA] Aviso de código de recuperación falló:', err.message))
    }

    return issueSession(req, res, user, 'email', challenge.slug)
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message, code: err.code })
    next(err)
  }
}

/**
 * GET /api/auth/me
 * Requiere auth + resolveWorkspace (inyectan req.user y req.workspaceMember).
 */
async function me(req, res, next) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { id: true, name: true, email: true, avatar: true, isSuperAdmin: true, emailVerified: true },
    })

    const member = req.workspaceMember

    res.json({
      ...user,
      role: member?.teamRole ?? '',
      isAdmin: member?.role === 'admin' || member?.role === 'owner',
      isSales: isSalesUser(req), // módulo Ventas: admin o teamRole habilitado (ver moduleAccess)
      moduleAccess: getAllModuleAccess(req), // { rrhh, gamification, ventas, marketing, contenido, eos }
      dailyInsightEnabled: member?.dailyInsightEnabled ?? true,
      notesBoardEnabled: member?.notesBoardEnabled ?? true,
    })
  } catch (err) { next(err) }
}

/**
 * POST /api/auth/forgot-password
 */
async function forgotPassword(req, res, next) {
  try {
    const { email } = req.body
    if (!email) return res.status(400).json({ error: 'Email requerido' })

    const user = await prisma.user.findFirst({ where: { email: { equals: normalizeEmail(email), mode: 'insensitive' } } })
    if (!user) {
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

    const domain = process.env.APP_DOMAIN
    const slug = req.headers['x-workspace']
    const resetUrl = domain && slug
      ? `https://${slug}.${domain}/reset-password?token=${token}`
      : `${process.env.FRONTEND_URL}/reset-password?token=${token}`

    await sendPasswordReset(user.email, user.name, resetUrl)

    res.json({ message: 'Si el email existe, recibirás un correo en breve.' })
  } catch (err) {
    next(err)
  }
}

/**
 * POST /api/auth/reset-password
 * Body: { token, password, code? }
 *
 * Con 2FA activo el `code` es obligatorio. Sin esto el segundo factor sería
 * decorativo: alcanzaría con tener acceso al email para resetear la contraseña y
 * entrar, que es exactamente el ataque del que el 2FA tiene que proteger. El
 * frontend no sabe de antemano si la cuenta del enlace tiene 2FA (no se lo
 * decimos: eso filtraría quién lo tiene activo a cualquiera), así que el primer
 * intento vuelve con 401 MFA_REQUIRED y recién entonces pide el código.
 */
async function resetPassword(req, res, next) {
  try {
    const { token, password, code } = req.body
    if (!token || !password) return res.status(400).json({ error: 'Datos incompletos' })
    const pwErr = validatePassword(password)
    if (pwErr) return res.status(400).json({ error: pwErr })

    const resetToken = await prisma.passwordResetToken.findUnique({ where: { token } })

    if (!resetToken || resetToken.used || resetToken.expiresAt < new Date()) {
      return res.status(400).json({ error: 'El enlace es inválido o ha expirado' })
    }

    const user = await prisma.user.findUnique({ where: { id: resetToken.userId } })
    if (!user) return res.status(400).json({ error: 'El enlace es inválido o ha expirado' })

    let usedRecoveryCode = false
    if (hasMfa(user)) {
      // Mismo tope de 5 intentos que el login, keyeado por el enlace: el token
      // vive 1 hora, suficiente para probar 6 dígitos a mano si no se limita.
      const attemptKey = `reset:${resetToken.id}`
      assertNotExhausted(attemptKey)

      if (!code) {
        return res.status(401).json({
          error: 'Esta cuenta tiene verificación en dos pasos. Ingresá el código de tu app de autenticación.',
          code:  'MFA_REQUIRED',
        })
      }

      const { ok, method } = await verifySecondFactor(user, code)
      if (!ok) {
        const attemptsLeft = registerFailure(attemptKey)
        return res.status(401).json({
          error: attemptsLeft > 0
            ? 'El código no es correcto. Revisá que sea el que muestra tu app en este momento.'
            : 'Demasiados códigos incorrectos. Pedí un enlace nuevo.',
          code: attemptsLeft > 0 ? 'MFA_CODE_INVALID' : 'MFA_TOO_MANY_ATTEMPTS',
          attemptsLeft,
        })
      }
      usedRecoveryCode = method === 'recovery'
    }

    const hashed = await bcrypt.hash(password, 10)

    await prisma.$transaction([
      prisma.user.update({ where: { id: resetToken.userId }, data: { password: hashed } }),
      prisma.passwordResetToken.update({ where: { id: resetToken.id }, data: { used: true } }),
    ])

    if (usedRecoveryCode) {
      const remaining = await countUnusedRecoveryCodes(user.id)
      sendMfaRecoveryCodeUsedNotice(user.email, user.name, remaining)
        .catch(err => console.error('[MFA] Aviso de código de recuperación falló:', err.message))
    }

    res.json({ message: 'Contraseña actualizada correctamente' })
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message, code: err.code })
    next(err)
  }
}

/**
 * POST /api/auth/verify-email-change
 * Body: { token }
 * Confirma el cambio de email primario desde el link enviado al nuevo correo.
 * Público (el usuario puede abrirlo desde otro dispositivo / sin sesión).
 */
async function verifyEmailChange(req, res, next) {
  try {
    const { token } = req.body
    if (!token) return res.status(400).json({ error: 'Token requerido' })

    const record = await prisma.emailChangeToken.findUnique({ where: { token } })
    if (!record || record.used || record.expiresAt < new Date()) {
      return res.status(400).json({ error: 'El enlace es inválido o ha expirado' })
    }

    // Revalida que el email siga libre (alguien pudo tomarlo entre el pedido y la confirmación).
    const taken = await prisma.user.findFirst({
      where: { email: { equals: record.newEmail, mode: 'insensitive' }, NOT: { id: record.userId } },
      select: { id: true },
    })
    if (taken) {
      await prisma.emailChangeToken.update({ where: { id: record.id }, data: { used: true } })
      return res.status(409).json({ error: 'Ese email ya fue tomado por otra cuenta' })
    }

    const before = await prisma.user.findUnique({ where: { id: record.userId }, select: { email: true, name: true } })

    // Haber abierto el link en la casilla nueva ya prueba que es suya: el email queda
    // verificado acá mismo (si no, el banner de verificación sobrevive al cambio). Los
    // `EmailVerificationToken` pendientes se invalidan porque apuntan al email anterior
    // — típicamente uno mal escrito, inaccesible — y confirmarlos no probaría nada.
    await prisma.$transaction([
      prisma.user.update({
        where: { id: record.userId },
        data: { email: record.newEmail, emailVerified: true },
      }),
      prisma.emailChangeToken.update({ where: { id: record.id }, data: { used: true } }),
      prisma.emailVerificationToken.updateMany({
        where: { userId: record.userId, used: false },
        data: { used: true },
      }),
    ])

    // Aviso de seguridad al email anterior (best-effort).
    if (before?.email) {
      sendEmailChangedNotice(before.email, before.name, record.newEmail)
        .catch(err => console.error('[EmailChange] Aviso al email anterior falló:', err.message))
    }

    res.json({ message: 'Email actualizado correctamente', email: record.newEmail })
  } catch (err) { next(err) }
}

/**
 * POST /api/auth/verify-email
 * Body: { token }
 * Confirma el email primario (signup, ver `createAndSendVerificationEmail`).
 * Público: se abre desde el link del correo, con o sin sesión activa.
 */
async function verifyEmail(req, res, next) {
  try {
    const { token } = req.body
    if (!token) return res.status(400).json({ error: 'Token requerido' })

    const record = await prisma.emailVerificationToken.findUnique({ where: { token } })
    if (!record || record.used || record.expiresAt < new Date()) {
      return res.status(400).json({ error: 'El enlace es inválido o ha expirado' })
    }

    await prisma.$transaction([
      prisma.user.update({ where: { id: record.userId }, data: { emailVerified: true } }),
      prisma.emailVerificationToken.update({ where: { id: record.id }, data: { used: true } }),
    ])

    res.json({ message: 'Email verificado correctamente' })
  } catch (err) { next(err) }
}

/**
 * POST /api/auth/resend-verification
 * Requiere auth. Reenvía el email de verificación del usuario actual (cooldown 60s).
 */
async function resendVerificationEmail(req, res, next) {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.userId } })
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' })
    if (user.emailVerified) return res.json({ message: 'Tu email ya está verificado' })

    const last = await prisma.emailVerificationToken.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    })
    if (last && Date.now() - last.createdAt.getTime() < RESEND_COOLDOWN_MS) {
      return res.status(429).json({ error: 'Esperá unos segundos antes de reenviar el email' })
    }

    const slug = req.headers['x-workspace']
    await createAndSendVerificationEmail(user.id, user.email, user.name, { slug, workspaceId: req.workspace?.id })

    res.json({ message: `Te reenviamos el correo de verificación a ${user.email}.` })
  } catch (err) { next(err) }
}

/**
 * POST /api/auth/connect-google
 * Body: { linkToken, credential }
 * Vincula la cuenta de Google al usuario identificado por el linkToken (emitido
 * por POST /api/profile/google-link-token). Público: lo invoca el popup servido
 * desde el dominio raíz, que no tiene la sesión del subdominio. El linkToken
 * (JWT corto, purpose 'google-link') es la credencial.
 */
async function connectGoogleWithToken(req, res, next) {
  try {
    const { linkToken, credential } = req.body
    if (!linkToken || !credential) return res.status(400).json({ error: 'Datos incompletos' })

    let claims
    try {
      claims = jwt.verify(linkToken, process.env.JWT_SECRET)
    } catch {
      return res.status(401).json({ error: 'El enlace de conexión expiró. Volvé a intentar.' })
    }
    if (claims.purpose !== 'google-link' || !claims.userId) {
      return res.status(401).json({ error: 'Enlace de conexión inválido' })
    }

    const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID)
    const ticket = await client.verifyIdToken({ idToken: credential, audience: process.env.GOOGLE_CLIENT_ID })
    const gp = ticket.getPayload()
    if (!gp?.sub) return res.status(401).json({ error: 'Token de Google inválido' })

    const inUse = await prisma.user.findUnique({ where: { googleId: gp.sub }, select: { id: true } })
    if (inUse && inUse.id !== claims.userId) {
      return res.status(409).json({ error: 'Esa cuenta de Google ya está vinculada a otro usuario' })
    }

    await prisma.user.update({ where: { id: claims.userId }, data: { googleId: gp.sub } })
    res.json({ googleConnected: true })
  } catch (err) { next(err) }
}

/**
 * POST /api/auth/google
 * Header X-Workspace opcional — mismo comportamiento que login.
 */
async function googleLogin(req, res, next) {
  try {
    const { credential } = req.body
    const slug = req.headers['x-workspace']

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

    // Preferimos el vínculo explícito por googleId (sobrevive a cambios de email y
    // funciona aunque el email de Google difiera del primario). Si no hay vínculo,
    // caemos al match por email (cuentas que entran con Google sin haberlo conectado).
    let user = await prisma.user.findUnique({ where: { googleId: payload.sub } })
    if (!user) user = await prisma.user.findFirst({ where: { email: { equals: normalizeEmail(payload.email), mode: 'insensitive' } } })
    if (!user) return res.status(404).json({ error: 'No existe una cuenta con ese email de Google' })

    // Entrar con Google NO pide además el TOTP propio: Google ya aplicó el
    // segundo factor de esa cuenta y acá se exige `email_verified`. Pedir los dos
    // sería doble 2FA para el mismo login — el camino seguro a que la gente
    // desactive el nuestro.
    return issueSession(req, res, user, 'google', slug)
  } catch (err) {
    next(err)
  }
}

/**
 * POST /api/auth/switch-workspace
 * Requiere auth. Genera un token para otro workspace del mismo usuario.
 */
async function switchWorkspace(req, res, next) {
  try {
    const { targetSlug } = req.body
    if (!targetSlug) return res.status(400).json({ error: 'targetSlug requerido' })

    const [user, workspace] = await Promise.all([
      prisma.user.findUnique({ where: { id: req.user.userId } }),
      prisma.workspace.findUnique({ where: { slug: targetSlug }, omit: { logoData: true, bannerData: true } }),
    ])

    if (!workspace) return res.status(404).json({ error: 'Workspace no encontrado' })

    const member = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: workspace.id, userId: user.id } },
    })
    if (!member || !member.active) {
      return res.status(403).json({ error: 'No sos miembro de este workspace' })
    }

    recordLoginEvent(user.id, workspace.id, 'switch', req)

    res.json({ token: signToken(user, member, workspace), slug: targetSlug })
  } catch (err) {
    next(err)
  }
}

/**
 * POST /api/auth/record-login
 * Registra un ingreso para el workspace actual.
 * Usado por AuthCallback después de aterrizar con token pre-firmado.
 */
async function recordLogin(req, res, next) {
  try {
    await prisma.userLogin.create({
      data: {
        userId:      req.user.userId,
        workspaceId: req.workspace.id,
        method:      'token',
        userAgent:   req.headers['user-agent'] || null,
      },
    })
    triggerLateCheck(req.user.userId, req.workspace.id)
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
}

function logout(req, res) {
  res.json({ ok: true })
}

module.exports = { login, verifyMfa, me, forgotPassword, resetPassword, verifyEmailChange, verifyEmail, resendVerificationEmail, connectGoogleWithToken, googleLogin, switchWorkspace, recordLogin, logout }
