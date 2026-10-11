const prisma = require('../../lib/prisma')
const { encrypt } = require('../../lib/encryption')
const { logFinanceAudit } = require('../../lib/financeAudit')
const { isValidIssuerTaxCondition, isValidIssuerEnvironment } = require('../../lib/financeCatalog')
const { businessError, trimmedOrNull, normalizeCuit } = require('./_shared')

const ISSUER_FIELD_LABELS = {
  name:         { label: 'Nombre' },
  cuit:         { label: 'CUIT' },
  taxCondition: { label: 'Condición fiscal' },
  salesPoint:   { label: 'Punto de venta' },
  environment:  { label: 'Ambiente' },
  active:       { label: 'Activo', format: 'boolean' },
}

const CUIT_RE = /^\d{2}-\d{8}-\d$/

// certificate/privateKey son cifrados y NUNCA viajan al frontend — ni
// siquiera el ciphertext (mismo criterio que ProjectAccess.password/twofa,
// que exponen solo hasPassword/hasTwofa). `shapeIssuer` es el único punto por
// el que una fila de FinanceIssuer puede salir de este controller.
function shapeIssuer(issuer) {
  const { certificate, privateKey, ...rest } = issuer
  return { ...rest, hasCertificate: !!certificate, hasPrivateKey: !!privateKey }
}

// Devuelve el CUIT normalizado ("20-32315642-6") — acepta 11 dígitos seguidos
// y les pone los guiones solo, no hace falta que el usuario los tipee.
function validateCuit(cuit) {
  const normalized = normalizeCuit(cuit)
  if (!normalized || !CUIT_RE.test(normalized)) {
    throw businessError(400, 'CUIT inválido (debe tener 11 dígitos)')
  }
  return normalized
}

// GET /api/finanzas/issuers?active=true — lectura abierta a cualquiera con
// acceso al módulo (la necesitan el picker de cliente y, más adelante, el
// modal de nueva factura), solo la escritura es admin/owner (ver router).
async function listIssuers(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const { active } = req.query
    const where = { workspaceId }
    if (active !== undefined) where.active = active === 'true'
    const issuers = await prisma.financeIssuer.findMany({
      where, orderBy: { name: 'asc' },
      include: { _count: { select: { items: true } } },
    })
    res.json(issuers.map(shapeIssuer))
  } catch (err) { next(err) }
}

// GET /api/finanzas/issuers/:id
async function getIssuer(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const issuer = await prisma.financeIssuer.findFirst({
      where: { id: Number(req.params.id), workspaceId },
      include: { _count: { select: { items: true } } },
    })
    if (!issuer) return res.status(404).json({ error: 'Emisor no encontrado' })
    res.json(shapeIssuer(issuer))
  } catch (err) { next(err) }
}

// POST /api/finanzas/issuers — admin/owner (ver router)
async function createIssuer(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const { name, cuit, taxCondition, salesPoint, environment, certificate, privateKey } = req.body

    if (!name?.trim()) return res.status(400).json({ error: 'Nombre requerido' })
    const normalizedCuit = validateCuit(cuit)
    if (!isValidIssuerTaxCondition(taxCondition)) return res.status(400).json({ error: 'Condición fiscal inválida' })
    if (!Number.isInteger(salesPoint) || salesPoint <= 0) return res.status(400).json({ error: 'Punto de venta inválido' })
    const env = environment || 'test'
    if (!isValidIssuerEnvironment(env)) return res.status(400).json({ error: 'Ambiente inválido' })

    const issuer = await prisma.financeIssuer.create({
      data: {
        workspaceId, name: name.trim(), cuit: normalizedCuit, taxCondition, salesPoint, environment: env,
        certificate: encrypt(trimmedOrNull(certificate)), privateKey: encrypt(trimmedOrNull(privateKey)),
        createdById: req.user.userId,
      },
    })
    await logFinanceAudit({
      workspaceId, entityType: 'issuer', entityId: issuer.id, action: 'create',
      userId: req.user.userId, entityLabel: `emisor "${issuer.name}"`,
    })
    res.status(201).json(shapeIssuer(issuer))
  } catch (err) { next(err) }
}

// PATCH /api/finanzas/issuers/:id — admin/owner. certificate/privateKey solo
// se tocan si vienen en el body (reemplazo completo, no hay edición parcial
// de un PEM) — omitirlos conserva los que ya estaban cargados.
async function updateIssuer(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const id = Number(req.params.id)
    const existing = await prisma.financeIssuer.findFirst({ where: { id, workspaceId } })
    if (!existing) return res.status(404).json({ error: 'Emisor no encontrado' })

    const { name, cuit, taxCondition, salesPoint, environment, active, certificate, privateKey } = req.body
    const data = {}
    if (name !== undefined) {
      if (!name.trim()) return res.status(400).json({ error: 'Nombre requerido' })
      data.name = name.trim()
    }
    if (cuit !== undefined) { data.cuit = validateCuit(cuit) }
    if (taxCondition !== undefined) {
      if (!isValidIssuerTaxCondition(taxCondition)) return res.status(400).json({ error: 'Condición fiscal inválida' })
      data.taxCondition = taxCondition
    }
    if (salesPoint !== undefined) {
      if (!Number.isInteger(salesPoint) || salesPoint <= 0) return res.status(400).json({ error: 'Punto de venta inválido' })
      data.salesPoint = salesPoint
    }
    if (environment !== undefined) {
      if (!isValidIssuerEnvironment(environment)) return res.status(400).json({ error: 'Ambiente inválido' })
      data.environment = environment
    }
    if (active !== undefined) data.active = !!active
    if (certificate !== undefined) data.certificate = encrypt(trimmedOrNull(certificate))
    if (privateKey !== undefined) data.privateKey = encrypt(trimmedOrNull(privateKey))

    const issuer = await prisma.financeIssuer.update({ where: { id }, data })
    await logFinanceAudit({
      workspaceId, entityType: 'issuer', entityId: id, action: 'update', userId: req.user.userId,
      entityLabel: `emisor "${existing.name}"`, before: existing, after: issuer, fieldLabels: ISSUER_FIELD_LABELS,
    })
    res.json(shapeIssuer(issuer))
  } catch (err) { next(err) }
}

// DELETE /api/finanzas/issuers/:id — admin/owner, solo si nunca se usó
// (facturas emitidas desde este emisor son un comprobante legal — no se
// puede "deshacer" el emisor que las generó, solo desactivarlo).
async function deleteIssuer(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const id = Number(req.params.id)
    const existing = await prisma.financeIssuer.findFirst({
      where: { id, workspaceId },
      include: { _count: { select: { items: true, invoices: true } } },
    })
    if (!existing) return res.status(404).json({ error: 'Emisor no encontrado' })
    if (existing._count.items > 0) {
      return res.status(409).json({ error: 'Hay clientes que facturan con este emisor por defecto — no se puede eliminar, solo desactivar.' })
    }
    if (existing._count.invoices > 0) {
      return res.status(409).json({ error: 'Hay facturas emitidas con este emisor — no se puede eliminar, solo desactivar.' })
    }

    await prisma.financeIssuer.delete({ where: { id } })
    await logFinanceAudit({
      workspaceId, entityType: 'issuer', entityId: id, action: 'delete', userId: req.user.userId,
      entityLabel: `emisor "${existing.name}"`,
    })
    res.json({ ok: true })
  } catch (err) { next(err) }
}

module.exports = { listIssuers, getIssuer, createIssuer, updateIssuer, deleteIssuer, shapeIssuer }
