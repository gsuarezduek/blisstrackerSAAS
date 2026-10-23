/**
 * Arma el VoucherDocument (todo lo que debe mostrar un comprobante impreso,
 * ya resuelto y chequeado por el SDK) para el PDF oficial de una factura con
 * CAE (Etapa 3). Usa `arca.recover(idempotencyKey)` para traer el
 * IssuedVoucher COMPLETO que devolvió ARCA en el momento de la emisión —
 * nunca se reconstruye a mano (evitaría tener que adivinar `header`/`amounts`:
 * concepto, moneda, ajustes, etc., que no persistimos en Etapa 2) — y lo
 * cachea en `FinanceInvoice.arcaResponseRaw.voucher` para no volver a
 * golpear a ARCA en cada vista/descarga posterior de la misma factura.
 */
const prisma = require('./prisma')
const { getArcaClient, toMinorUnits, buildArcaItems, loadSdk } = require('./arcaClient')

function fail(status, message) {
  throw Object.assign(new Error(message), { status, isOperational: true })
}

function fmtDateOnly(d) {
  return d ? new Date(d).toISOString().slice(0, 10) : null
}

async function getIssuedVoucher(invoice, issuer) {
  const cached = invoice.arcaResponseRaw?.voucher
  if (cached) return cached

  const arca = await getArcaClient(issuer)
  const outcome = await arca.recover(invoice.arcaIdempotencyKey)
  if (outcome.kind !== 'authorized') {
    fail(409, 'ARCA todavía no confirma esta factura como autorizada — no se puede generar el PDF por ahora.')
  }
  await prisma.financeInvoice.update({
    where: { id: invoice.id },
    data: { arcaResponseRaw: { ...(invoice.arcaResponseRaw || {}), voucher: outcome.voucher } },
  })
  return outcome.voucher
}

// `invoice` necesita cae/ivaRate/amount/arcaIdempotencyKey/arcaResponseRaw;
// `issuer` el FinanceIssuer completo (con certificate/privateKey para recover());
// `item` el FinanceItem (cliente) con name/address/ivaCondition.
async function buildInvoiceVoucherDocument(invoice, issuer, item) {
  if (!invoice.cae) fail(400, 'Esta factura todavía no tiene CAE — no se puede generar el PDF.')
  if (!issuer.address || !issuer.grossIncome || !issuer.activitiesStartDate) {
    fail(400, 'Completá la dirección, los ingresos brutos y el inicio de actividades del emisor en Configuración antes de generar el PDF.')
  }
  if (item.ivaCondition !== 'consumidor_final' && !item.address) {
    fail(400, 'Este cliente no tiene dirección cargada — hace falta para el PDF oficial (salvo consumidor final).')
  }

  const [{ buildVoucherDocument }, voucher] = await Promise.all([loadSdk(), getIssuedVoucher(invoice, issuer)])
  const amountCents = toMinorUnits(invoice.amount)
  // `description` es opcional para `issue()` (no la pide ARCA) pero obligatoria para
  // imprimir — es el único renglón, así que lleva el concepto de la factura.
  const items = buildArcaItems(issuer, amountCents, invoice.ivaRate).map(i => ({ ...i, description: invoice.concept }))

  try {
    return buildVoucherDocument({
      voucher,
      items,
      issuer: {
        legalName: issuer.name,
        tradeName: issuer.tradeName || undefined,
        address: issuer.address,
        taxId: issuer.cuit.replace(/-/g, ''),
        condition: issuer.taxCondition,
        grossIncome: issuer.grossIncome,
        activitiesStartDate: fmtDateOnly(issuer.activitiesStartDate),
      },
      receiver: { name: item.legalName || item.name, address: item.address || undefined },
      saleConditions: 'Cuenta corriente',
    })
  } catch (err) {
    fail(400, err.message || 'No se pudo armar el comprobante para imprimir.')
  }
}

module.exports = { buildInvoiceVoucherDocument, getIssuedVoucher }
