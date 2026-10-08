const crypto = require('crypto')
const prisma = require('../../lib/prisma')
const stripe = require('../../lib/stripe')
const { BENEFIT_TYPES, normalizeCode, describeBenefit, createStripeCouponForBenefit } = require('../../lib/invitationCodes')

const CODE_INCLUDE = {
  workspaces: { select: { id: true, name: true, slug: true } },
}

function randomCode() {
  return crypto.randomBytes(6).toString('hex').toUpperCase().slice(0, 8)
}

function shape(ic) {
  return { ...ic, displayLabel: describeBenefit(ic) }
}

/**
 * GET /api/superadmin/invitation-codes
 */
async function list(req, res, next) {
  try {
    const codes = await prisma.invitationCode.findMany({
      orderBy: { createdAt: 'desc' },
      include: CODE_INCLUDE,
    })
    res.json(codes.map(shape))
  } catch (err) { next(err) }
}

/**
 * POST /api/superadmin/invitation-codes
 * Body: { code?, description?, benefitType, benefitValue, currency?, benefitLabel?, maxUses?, expiresAt? }
 */
async function create(req, res, next) {
  try {
    const { code, description, benefitType, benefitValue, currency, benefitLabel, maxUses, expiresAt } = req.body

    if (!BENEFIT_TYPES.includes(benefitType)) {
      return res.status(400).json({ error: 'Tipo de beneficio inválido' })
    }
    const value = Number(benefitValue)
    if (benefitType === 'custom') {
      if (!benefitLabel?.trim()) return res.status(400).json({ error: 'Para un beneficio "otro" el texto a mostrar es requerido' })
    } else if (!Number.isInteger(value) || value <= 0) {
      return res.status(400).json({ error: 'El valor del beneficio debe ser un entero mayor a 0' })
    } else if (benefitType === 'discount_percent' && value > 100) {
      return res.status(400).json({ error: 'El descuento porcentual no puede superar 100%' })
    }
    if (maxUses !== undefined && maxUses !== null && (!Number.isInteger(Number(maxUses)) || Number(maxUses) <= 0)) {
      return res.status(400).json({ error: 'El cupo de usos debe ser un entero mayor a 0' })
    }

    const finalCode = normalizeCode(code) || randomCode()

    const data = {
      code:         finalCode,
      description:  description?.trim() || null,
      benefitType,
      benefitValue: benefitType === 'custom' ? 0 : value,
      currency:     benefitType === 'discount_fixed' ? (currency?.trim().toLowerCase() || 'usd') : null,
      benefitLabel: benefitLabel?.trim() || null,
      maxUses:      maxUses != null ? Number(maxUses) : null,
      expiresAt:    expiresAt ? new Date(expiresAt) : null,
      createdById:  req.user.userId,
    }

    // El cupón de Stripe se crea con los datos ya validados (necesita `code` para el `name`).
    data.stripeCouponId = await createStripeCouponForBenefit(data)

    const created = await prisma.invitationCode.create({ data, include: CODE_INCLUDE })
    res.status(201).json(shape(created))
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'Ya existe un código con ese texto' })
    next(err)
  }
}

/**
 * PATCH /api/superadmin/invitation-codes/:id
 * Body: { description?, benefitLabel?, maxUses?, expiresAt?, active? }
 * No permite editar code/benefitType/benefitValue/currency: el cupón de Stripe ya es
 * inmutable y puede haber workspaces ya asociados — para cambiar el beneficio, crear un
 * código nuevo.
 */
async function update(req, res, next) {
  try {
    const id = Number(req.params.id)
    const { description, benefitLabel, maxUses, expiresAt, active } = req.body

    const data = {}
    if (description !== undefined)  data.description = description?.trim() || null
    if (benefitLabel !== undefined) data.benefitLabel = benefitLabel?.trim() || null
    if (maxUses !== undefined)      data.maxUses = maxUses != null ? Number(maxUses) : null
    if (expiresAt !== undefined)    data.expiresAt = expiresAt ? new Date(expiresAt) : null
    if (active !== undefined)       data.active = Boolean(active)

    const updated = await prisma.invitationCode.update({ where: { id }, data, include: CODE_INCLUDE })
    res.json(shape(updated))
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Código no encontrado' })
    next(err)
  }
}

/**
 * DELETE /api/superadmin/invitation-codes/:id
 * Bloqueado si ya tiene usos — desactivarlo en vez de borrarlo, para no perder el
 * historial de qué workspace redimió qué beneficio.
 */
async function remove(req, res, next) {
  try {
    const id = Number(req.params.id)
    const ic = await prisma.invitationCode.findUnique({ where: { id } })
    if (!ic) return res.status(404).json({ error: 'Código no encontrado' })
    if (ic.usesCount > 0) {
      return res.status(409).json({ error: 'Este código ya tiene usos registrados. Desactivalo en vez de borrarlo.' })
    }

    if (ic.stripeCouponId && stripe) {
      await stripe.coupons.del(ic.stripeCouponId).catch(err =>
        console.error('[InvitationCode] Error al borrar cupón de Stripe:', err.message))
    }

    await prisma.invitationCode.delete({ where: { id } })
    res.json({ ok: true })
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Código no encontrado' })
    next(err)
  }
}

module.exports = { list, create, update, remove }
