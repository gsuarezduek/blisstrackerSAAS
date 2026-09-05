const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const prisma = require('../../lib/prisma')
const stripe  = require('../../lib/stripe')
const { sendPlatformNotification, platformCard } = require('../../services/email.service')
const { getSetting } = require('../../lib/platformSettings')
const { seedWorkspace } = require('../../services/workspaceSeed.service')
const { validatePassword } = require('../../lib/passwordPolicy')
const { createAndSendVerificationEmail } = require('../../lib/emailVerification')

/**
 * GET /api/workspaces/mine
 * Lista todos los workspaces del usuario autenticado.
 */
async function getMine(req, res, next) {
  try {
    const members = await prisma.workspaceMember.findMany({
      where: { userId: req.user.userId, active: true },
      include: { workspace: { select: { id: true, name: true, slug: true, status: true } } },
    })
    res.json(members.map(m => ({
      id:   m.workspace.id,
      name: m.workspace.name,
      slug: m.workspace.slug,
      role: m.role,
    })))
  } catch (err) { next(err) }
}

/**
 * POST /api/workspaces
 * Crear un nuevo workspace. Dos casos, mismo endpoint (usa `optionalAuth`):
 *  - Registro público (sin sesión): Body { workspaceName, slug, ownerName, ownerEmail, ownerPassword }
 *  - Usuario ya logueado crea un workspace ADICIONAL (req.user presente): Body { workspaceName, slug }
 *    — reutiliza la cuenta de la sesión, sin pedir contraseña de nuevo.
 */
async function createWorkspace(req, res, next) {
  try {
    const { workspaceName, slug } = req.body
    const authedUserId = req.user?.userId ?? null

    let ownerName, ownerEmail, ownerPassword
    if (!authedUserId) {
      ;({ ownerName, ownerEmail, ownerPassword } = req.body)
    }

    if (!workspaceName || !slug || (!authedUserId && (!ownerName || !ownerEmail || !ownerPassword))) {
      return res.status(400).json({ error: 'Todos los campos son requeridos' })
    }

    // Validar slug: solo lowercase, números y guiones
    if (!/^[a-z0-9-]{2,30}$/.test(slug)) {
      return res.status(400).json({ error: 'El slug solo puede contener letras minúsculas, números y guiones (2-30 caracteres)' })
    }

    const [trialDays, defaultTokenLimit] = await Promise.all([
      getSetting('trialDays'),
      getSetting('defaultMonthlyTokenLimit'),
    ])
    const trialEndsAt = new Date()
    trialEndsAt.setDate(trialEndsAt.getDate() + trialDays)

    let existingOwner = null
    let hashed = null

    if (authedUserId) {
      // Usuario ya logueado: reutilizamos su cuenta tal cual, sin volver a pedir contraseña.
      existingOwner = await prisma.user.findUnique({ where: { id: authedUserId } })
      if (!existingOwner) {
        return res.status(401).json({ error: 'Tu sesión no es válida. Volvé a iniciar sesión.' })
      }
    } else {
      // Registro público: si el email ya tiene cuenta, verificar que la contraseña sea correcta
      // (autenticación, no alta — no se le aplica la política de largo mínimo de una contraseña nueva).
      existingOwner = await prisma.user.findUnique({ where: { email: ownerEmail } })
      if (existingOwner) {
        const valid = await bcrypt.compare(ownerPassword, existingOwner.password)
        if (!valid) {
          return res.status(401).json({ error: 'Ya existe una cuenta con ese email. La contraseña ingresada es incorrecta.' })
        }
      } else {
        const pwErr = validatePassword(ownerPassword)
        if (pwErr) return res.status(400).json({ error: pwErr })
        hashed = await bcrypt.hash(ownerPassword, 10)
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      // Crear workspace
      const workspace = await tx.workspace.create({
        data: { name: workspaceName, slug, status: 'trialing', trialEndsAt, monthlyTokenLimit: defaultTokenLimit },
      })

      // Reutiliza al owner ya resuelto arriba (sesión activa, o email con cuenta existente);
      // si es una cuenta nueva, la crea ahora.
      let owner = existingOwner
      if (!owner) {
        owner = await tx.user.create({
          data: { name: ownerName, email: ownerEmail, password: hashed, emailVerified: false },
        })
      }

      // Crear WorkspaceMember como owner
      await tx.workspaceMember.create({
        data: {
          workspaceId: workspace.id,
          userId: owner.id,
          role: 'owner',
          active: true,
        },
      })

      // Crear suscripción en trial
      await tx.subscription.create({
        data: {
          workspaceId: workspace.id,
          status: 'trialing',
          planName: 'pro',
        },
      })

      // Crear proyecto por defecto con el nombre del workspace
      await tx.project.create({
        data: {
          workspaceId: workspace.id,
          name: workspaceName,
          members: { create: [{ userId: owner.id }] },
        },
      })

      // Seed: proyecto "Demo — Aprendé BlissTracker" con 8 tareas variadas para que el primer login
      // no sea un dashboard vacío. Si falla, no rompe el registro (proyecto principal ya creado).
      await seedWorkspace(workspace.id, owner.id, tx).catch(err => {
        console.error('[Workspace] Error en seed demo:', err.message)
      })

      return { workspace, owner }
    })

    // El owner ya queda logueado automáticamente (ver token más abajo), así que
    // no hace falta un email que lo mande a un login manual: en su lugar le
    // pedimos confirmar el email. Solo si aún no está verificado (owner nuevo,
    // o una cuenta existente que nunca lo confirmó) — evita reenviar de más.
    if (!result.owner.emailVerified) {
      createAndSendVerificationEmail(result.owner.id, result.owner.email, result.owner.name, {
        slug: result.workspace.slug,
        workspaceId: result.workspace.id,
      }).catch(err => console.error('[Workspace] Error enviando email de verificación:', err.message))
    }

    // Aviso interno al equipo BlissTracker: nuevo workspace registrado.
    sendPlatformNotification('newWorkspace', {
      workspaceId: result.workspace.id,
      subject: `🚀 Nuevo workspace: ${result.workspace.name}`,
      bodyHtml: platformCard('🚀 Nuevo workspace registrado', [
        ['Workspace', result.workspace.name],
        ['Slug',      `${result.workspace.slug}.${process.env.APP_DOMAIN || 'blisstracker.app'}`],
        ['Owner',     `${result.owner.name} (${result.owner.email})${authedUserId ? ' — workspace adicional' : ''}`],
        ['Estado',    'Trial'],
      ], '#16a34a'),
    })

    // Crear Stripe Customer de forma asíncrona (no bloquea el registro si Stripe falla)
    if (stripe) {
      stripe.customers.create({
        name:  workspaceName,
        email: result.owner.email,
        metadata: { workspaceId: String(result.workspace.id), slug },
      }).then(customer =>
        prisma.workspace.update({
          where: { id: result.workspace.id },
          data:  { stripeCustomerId: customer.id },
        })
      ).catch(err => console.error('[Stripe] Error creando customer:', err.message))
    }

    // Auto-login: el owner ya tiene una sesión válida (usuario existente que creó un
    // workspace adicional) o definió su contraseña en el formulario (usuario nuevo), así
    // que lo logueamos directo en su workspace recién creado (el frontend navega a
    // /auth?token=... con esto, el mismo mecanismo que usa el login normal) en vez de
    // mandarlo a una pantalla de login.
    const token = jwt.sign(
      {
        userId:       result.owner.id,
        workspaceId:  result.workspace.id,
        role:         'owner',
        teamRole:     '',
        isSuperAdmin: result.owner.isSuperAdmin ?? false,
        name:         result.owner.name,
        email:        result.owner.email,
      },
      process.env.JWT_SECRET,
      { expiresIn: '12h' }
    )

    res.status(201).json({
      workspace: { id: result.workspace.id, name: result.workspace.name, slug: result.workspace.slug },
      user: { id: result.owner.id, name: result.owner.name, email: result.owner.email },
      token,
    })
  } catch (err) {
    console.error('[createWorkspace] error:', err.message, err.meta ?? '')
    if (err.code === 'P2002') {
      const target = err.meta?.target ?? []
      const fields = Array.isArray(target) ? target : [target]
      if (fields.some(f => String(f).includes('slug'))) {
        return res.status(409).json({ error: 'El subdominio ya está en uso. Elegí otro.', field: 'slug' })
      }
      if (fields.some(f => String(f).includes('email'))) {
        return res.status(409).json({ error: 'El email ya tiene una cuenta asociada.', field: 'email' })
      }
      return res.status(409).json({ error: 'El subdominio o email ya está en uso.', field: 'unknown' })
    }
    next(err)
  }
}

/**
 * GET /api/workspaces/check-slug?slug=mi-empresa
 * Verifica en tiempo real si un slug está disponible.
 */
async function checkSlug(req, res, next) {
  try {
    const { slug } = req.query
    if (!slug || !/^[a-z0-9-]{2,30}$/.test(slug)) {
      return res.json({ available: false, reason: 'format' })
    }
    const existing = await prisma.workspace.findUnique({ where: { slug }, select: { id: true } })
    res.json({ available: !existing })
  } catch (err) { next(err) }
}

/**
 * GET /api/workspaces/info
 * Información pública del workspace (sin auth). Usada por el frontend en la página de login.
 * Lee el header X-Workspace para identificar el workspace.
 */
async function getInfo(req, res, next) {
  try {
    const slug = req.headers['x-workspace']
    if (!slug) return res.status(400).json({ error: 'Header X-Workspace requerido' })

    const workspace = await prisma.workspace.findUnique({
      where: { slug },
      select: { id: true, name: true, slug: true, status: true, timezone: true, attendanceTrackingEnabled: true, productivityEnabled: true, lateToleranceMins: true, onboardingCompletedAt: true, marketingDisabledSections: true },
    })
    if (!workspace) return res.status(404).json({ error: 'Workspace no encontrado' })

    res.json({
      ...workspace,
      marketingDisabledSections: JSON.parse(workspace.marketingDisabledSections || '[]'),
    })
  } catch (err) { next(err) }
}

module.exports = { getMine, createWorkspace, checkSlug, getInfo }
