/**
 * Puente con el SDK `facturas` (La Pyme) para emitir comprobantes
 * electrónicos reales contra ARCA/AFIP. Ver FinanceIssuer (una instancia de
 * ArcaClient por emisor, credenciales explícitas — confirmado viable en el
 * spike de la Etapa 0, no hace falta `ARCA_*` en variables de entorno) y
 * FinanceInvoice (Etapa 2) en el schema.
 *
 * El paquete es ESM-only (`"type": "module"`) — se carga con `import()`
 * dinámico desde este backend CommonJS, mismo patrón que
 * `pushNotification.service.js` con `expo-server-sdk`.
 */
const prisma = require('./prisma')
const { decrypt } = require('./encryption')
const { toDecimal } = require('./financeMoney')

let sdkPromise = null
function loadSdk() {
  if (!sdkPromise) sdkPromise = import('facturas')
  return sdkPromise
}

// Store de idempotencia (tabla `arca_store`, ver migración finanzas_arca_etapa1)
// — un solo adapter compartido por todos los emisores/workspaces, igual que
// compartimos la conexión de Prisma. El `query(text, params)` que pide el
// adapter corre sobre la misma conexión que el resto del backend.
let sharedStorePromise = null
async function getStore() {
  if (!sharedStorePromise) {
    sharedStorePromise = loadSdk().then(({ createPostgresStore }) =>
      createPostgresStore({
        table: 'arca_store',
        query: (text, params) => prisma.$queryRawUnsafe(text, ...params),
      })
    )
  }
  return sharedStorePromise
}

// Un ArcaClient por emisor, cacheado en memoria mientras no cambie
// (updatedAt) — evita desencriptar el certificado/clave en cada llamada.
// Se invalida solo si el emisor se edita (updatedAt nuevo).
const clientCache = new Map() // issuerId -> { client, updatedAtMs }

async function getArcaClient(issuer) {
  const updatedAtMs = new Date(issuer.updatedAt).getTime()
  const cached = clientCache.get(issuer.id)
  if (cached && cached.updatedAtMs === updatedAtMs) return cached.client

  const certificatePem = decrypt(issuer.certificate)
  const privateKeyPem = decrypt(issuer.privateKey)
  if (!certificatePem || !privateKeyPem) {
    throw Object.assign(new Error('Este emisor todavía no tiene certificado y clave cargados en Configuración.'), { status: 400, isOperational: true })
  }

  const [{ createArcaClient }, store] = await Promise.all([loadSdk(), getStore()])
  const client = createArcaClient({
    taxId: issuer.cuit.replace(/-/g, ''),
    certificatePem,
    privateKeyPem,
    environment: issuer.environment,
    store,
  })
  clientCache.set(issuer.id, { client, updatedAtMs })
  return client
}

// ARCA trabaja en unidades enteras menores (centavos) — confirmado en el
// spike leyendo los tipos del SDK (`issue()`, `IssuedVoucher.totals`). v1 solo
// factura en ARS (2 decimales); otras monedas quedan fuera de alcance.
const MINOR_UNIT_SCALE = 100

function toMinorUnits(decimalAmount) {
  return Number(toDecimal(decimalAmount).times(MINOR_UNIT_SCALE).toDecimalPlaces(0).toString())
}

function fromMinorUnits(n) {
  return toDecimal(n).dividedBy(MINOR_UNIT_SCALE)
}

// "00003-00000041" — mismo formato que IssuedVoucher/VoucherDocument.number del SDK.
function formatVoucherNumber(salesPoint, number) {
  return `${String(salesPoint).padStart(5, '0')}-${String(number).padStart(8, '0')}`
}

// Arma el bloque `items` de `arca.issue()` según la condición fiscal del
// emisor (confirmado en el spike leyendo los tipos del SDK): monotributo/
// exento mandan el monto total sin discriminar IVA (AmountItem, el mismo
// shape que probó el usuario en terminal); responsable_inscripto manda el
// total CON IVA incluido + la alícuota (VatItem, `gross`+`vat`). Se reusa tal
// cual al armar el `VoucherDocumentInput` para el PDF (Etapa 3) — son
// exactamente los mismos items con los que se emitió el comprobante.
function buildArcaItems(issuer, amountCents, ivaRate) {
  if (issuer.taxCondition === 'responsable_inscripto') {
    return [{ gross: amountCents, vat: Number(ivaRate) }]
  }
  return [{ amount: amountCents }]
}

module.exports = { getArcaClient, toMinorUnits, fromMinorUnits, formatVoucherNumber, buildArcaItems, loadSdk }
