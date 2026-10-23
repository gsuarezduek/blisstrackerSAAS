const prisma = require('../../lib/prisma')
const { getArcaClient } = require('../../lib/arcaClient')
const { normalizeCuit } = require('./_shared')

const CUIT_RE = /^\d{2}-\d{8}-\d$/

// GET /api/finanzas/padron/:cuit — Etapa 5: busca un CUIT en el padrón de
// ARCA para precargar razón social (`name`) + condición de IVA + dirección al dar de alta un
// cliente. Usa el ArcaClient de cualquier emisor activo del workspace (el
// padrón es un servicio de consulta general, no depende de quién pregunta)
// — si no hay ningún emisor configurado todavía, no hay forma de consultar.
async function lookupCuit(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const normalized = normalizeCuit(req.params.cuit)
    if (!CUIT_RE.test(normalized)) return res.status(400).json({ error: 'CUIT inválido (debe tener 11 dígitos)' })

    const issuer = await prisma.financeIssuer.findFirst({ where: { workspaceId, active: true } })
    if (!issuer) return res.status(400).json({ error: 'Necesitás al menos un emisor configurado para consultar el padrón.' })

    let result
    try {
      const arca = await getArcaClient(issuer)
      result = await arca.padron.getTaxpayerDetails(normalized.replace(/-/g, ''))
    } catch (err) {
      // Error de transporte/infra contra ARCA (ej. el certificado del emisor no
      // tiene asociado el webservice de padrón en AFIP) — no lo dejamos caer
      // como 500 genérico, mismo criterio que arcaErrorData en invoices.controller.js.
      return res.status(502).json({ error: `ARCA rechazó la consulta al padrón: ${err.message || err}` })
    }
    if (!result) return res.status(404).json({ error: 'No se encontró ese CUIT en el padrón de ARCA.' })

    const addressParts = [result.address?.street, result.address?.city, result.address?.province].filter(Boolean)
    res.json({
      name: result.name || null,
      address: addressParts.join(', ') || null,
      ivaCondition: result.condition || null,
    })
  } catch (err) {
    if (err.isOperational) return res.status(err.status || 400).json({ error: err.message })
    next(err)
  }
}

module.exports = { lookupCuit }
