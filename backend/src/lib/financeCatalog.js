// Catálogo único del módulo Finanzas.
// Fuente de verdad de todos los campos "tipo enum" guardados como String en el
// schema (ver nota en CLAUDE.md: catálogo de código, no enum de Prisma, para
// que agregar/renombrar un valor sea un cambio de catálogo, no una migración).
// Espejo en el frontend: frontend/src/components/finanzas/financeCatalog.js
// (mantener ambos en sync — el frontend usa labels/colores para el render).
//
// Categorías/Cuentas/Items/Impuestos NO van acá: son catálogos EDITABLES por
// el usuario final (filas de FinanceCategory/FinanceAccount/FinanceItem/
// FinanceTax), no enums cerrados de código.

const ACCOUNT_TYPES = [
  { key: 'bank',          label: 'Banco' },
  { key: 'wallet',        label: 'Billetera' },
  { key: 'cash',          label: 'Caja' },
  { key: 'crypto_wallet', label: 'Wallet cripto' },
]

// Abierto a futuro (no es un enum cerrado): cualquier string de 3 letras sirve
// como moneda, pero estas son las que el frontend sabe formatear con su propio
// prefijo/decimales (ver utils/format.js fmtMoney).
const CURRENCIES = [
  { key: 'ARS', label: 'Pesos' },
  { key: 'USD', label: 'Dólares' },
  { key: 'BTC', label: 'Bitcoin' },
]

const MOVEMENT_TYPES = [
  { key: 'income',  label: 'Ingreso' },
  { key: 'expense', label: 'Egreso' },
]

const TAX_APPLIES_TO = [
  { key: 'income',  label: 'Ingresos' },
  { key: 'expense', label: 'Egresos' },
  { key: 'both',    label: 'Ambos' },
]

const TAX_BASE_TYPES = [
  { key: 'movement',  label: 'El movimiento' },
  { key: 'other_tax', label: 'Otro impuesto' },
]

// Profundidad máxima de encadenamiento de impuesto-sobre-impuesto (A con base
// en B, B con base en C...). Ver assertNoTaxCycle en controllers/finanzas/taxes.controller.js.
const MAX_TAX_CHAIN_DEPTH = 5

const PAYMENT_METHODS = [
  { key: 'transfer', label: 'Transferencia' },
  { key: 'check',    label: 'Cheque' },
]

// Solo aplica a ingresos de un item con tracksAccount=true.
const ACCOUNT_APPLICATIONS = [
  { key: 'invoice',    label: 'Factura' },
  { key: 'on_account', label: 'A cuenta' },
  { key: 'no_effect',  label: 'No afecta la cuenta' },
]

const CHECK_STATUSES = [
  { key: 'pending',  label: 'Pendiente',  color: 'orange' },
  { key: 'credited', label: 'Acreditado', color: 'green' },
  { key: 'rejected', label: 'Rechazado',  color: 'red' },
]

const TRANSFER_REASONS = [
  { key: 'buy_usd',          label: 'Compra de dólares' },
  { key: 'sell_usd',         label: 'Venta de dólares' },
  { key: 'fund_contribution', label: 'Aporte a fondo' },
  { key: 'fund_redemption',  label: 'Rescate de fondo' },
  { key: 'account_transfer', label: 'Transferencia entre cuentas' },
]

// Estado de factura: calculado, nunca persistido (ver invoices.controller.js
// `computeInvoiceStatus`). Vive acá solo para que el frontend tenga las
// mismas labels/colores que cualquier otro estado del catálogo.
const INVOICE_STATUSES = [
  { key: 'paid',     label: 'Pagada',   color: 'green' },
  { key: 'partial',  label: 'Parcial',  color: 'amber' },
  { key: 'overdue',  label: 'Vencida',  color: 'red' },
  { key: 'pending',  label: 'Pendiente', color: 'gray' },
]

// Estado de cliente (cuenta corriente), derivado del set de facturas — ver
// customers.controller.js `computeCustomerStatus`.
const CUSTOMER_STATUSES = [
  { key: 'overdue', label: 'Vencido', color: 'red' },
  { key: 'pending', label: 'Pendiente', color: 'amber' },
  { key: 'current', label: 'Al día',  color: 'green' },
]

const EXTRA_STATUSES = [
  { key: 'in_progress', label: 'En curso',  color: 'blue' },
  { key: 'finished',    label: 'Terminado',  color: 'amber' },
  { key: 'collected',   label: 'Cobrado',    color: 'green' },
]

const NEXT_ACTION_RECURRENCES = [
  { key: 'once',    label: 'Una vez' },
  { key: 'monthly', label: 'Mensual' },
  { key: 'yearly',  label: 'Anual' },
]

const TASK_KINDS = [
  { key: 'manual',    label: 'Manual' },
  { key: 'generated', label: 'Generada' },
]

const TASK_ORIGINS = [
  { key: 'check',          label: 'Cheque',       entityType: 'check' },
  { key: 'invoice',        label: 'Factura',      entityType: 'invoice' },
  { key: 'extra',          label: 'Extra',        entityType: 'extra' },
  { key: 'next_action',    label: 'Recordatorio', entityType: 'nextAction' },
  { key: 'check_rejected', label: 'Cheque',       entityType: 'check' },
  { key: 'manual',         label: 'Manual',       entityType: null },
]

const TASK_STATUSES = [
  { key: 'open',      label: 'Abierta' },
  { key: 'done',      label: 'Hecha' },
  { key: 'postponed', label: 'Pospuesta' },
]

// Tipos de entidad para FinanceAuditLog.entityType — ver lib/financeAudit.js.
const AUDIT_ENTITY_TYPES = [
  'account', 'tax', 'category', 'item', 'movement', 'transfer', 'check',
  'fundValuation', 'invoice', 'extra', 'nextAction', 'task',
]

function keysOf(list) { return list.map(x => x.key) }

const ACCOUNT_TYPE_KEYS          = keysOf(ACCOUNT_TYPES)
const MOVEMENT_TYPE_KEYS         = keysOf(MOVEMENT_TYPES)
const TAX_APPLIES_TO_KEYS        = keysOf(TAX_APPLIES_TO)
const TAX_BASE_TYPE_KEYS         = keysOf(TAX_BASE_TYPES)
const PAYMENT_METHOD_KEYS        = keysOf(PAYMENT_METHODS)
const ACCOUNT_APPLICATION_KEYS   = keysOf(ACCOUNT_APPLICATIONS)
const CHECK_STATUS_KEYS          = keysOf(CHECK_STATUSES)
const TRANSFER_REASON_KEYS       = keysOf(TRANSFER_REASONS)
const EXTRA_STATUS_KEYS          = keysOf(EXTRA_STATUSES)
const NEXT_ACTION_RECURRENCE_KEYS = keysOf(NEXT_ACTION_RECURRENCES)
const TASK_KIND_KEYS             = keysOf(TASK_KINDS)
const TASK_STATUS_KEYS           = keysOf(TASK_STATUSES)
// origin tiene 2 entradas con key 'manual'? no — 'manual' solo aparece una vez arriba
// salvo check_rejected que es distinto de check. Dedup por las dudas:
const TASK_ORIGIN_KEYS = [...new Set(keysOf(TASK_ORIGINS))]

function isValidAccountType(key)        { return ACCOUNT_TYPE_KEYS.includes(key) }
function isValidMovementType(key)       { return MOVEMENT_TYPE_KEYS.includes(key) }
function isValidTaxAppliesTo(key)       { return TAX_APPLIES_TO_KEYS.includes(key) }
function isValidTaxBaseType(key)        { return TAX_BASE_TYPE_KEYS.includes(key) }
function isValidPaymentMethod(key)      { return key == null || PAYMENT_METHOD_KEYS.includes(key) }
function isValidAccountApplication(key) { return key == null || ACCOUNT_APPLICATION_KEYS.includes(key) }
function isValidCheckStatus(key)        { return CHECK_STATUS_KEYS.includes(key) }
function isValidTransferReason(key)     { return TRANSFER_REASON_KEYS.includes(key) }
function isValidExtraStatus(key)        { return EXTRA_STATUS_KEYS.includes(key) }
function isValidNextActionRecurrence(key) { return NEXT_ACTION_RECURRENCE_KEYS.includes(key) }
function isValidTaskKind(key)           { return TASK_KIND_KEYS.includes(key) }
function isValidTaskOrigin(key)         { return key == null || TASK_ORIGIN_KEYS.includes(key) }
function isValidTaskStatus(key)         { return TASK_STATUS_KEYS.includes(key) }
function isValidAuditEntityType(key)    { return AUDIT_ENTITY_TYPES.includes(key) }

module.exports = {
  ACCOUNT_TYPES, ACCOUNT_TYPE_KEYS, isValidAccountType,
  CURRENCIES,
  MOVEMENT_TYPES, MOVEMENT_TYPE_KEYS, isValidMovementType,
  TAX_APPLIES_TO, TAX_APPLIES_TO_KEYS, isValidTaxAppliesTo,
  TAX_BASE_TYPES, TAX_BASE_TYPE_KEYS, isValidTaxBaseType,
  MAX_TAX_CHAIN_DEPTH,
  PAYMENT_METHODS, PAYMENT_METHOD_KEYS, isValidPaymentMethod,
  ACCOUNT_APPLICATIONS, ACCOUNT_APPLICATION_KEYS, isValidAccountApplication,
  CHECK_STATUSES, CHECK_STATUS_KEYS, isValidCheckStatus,
  TRANSFER_REASONS, TRANSFER_REASON_KEYS, isValidTransferReason,
  INVOICE_STATUSES,
  CUSTOMER_STATUSES,
  EXTRA_STATUSES, EXTRA_STATUS_KEYS, isValidExtraStatus,
  NEXT_ACTION_RECURRENCES, NEXT_ACTION_RECURRENCE_KEYS, isValidNextActionRecurrence,
  TASK_KINDS, TASK_KIND_KEYS, isValidTaskKind,
  TASK_ORIGINS, TASK_ORIGIN_KEYS, isValidTaskOrigin,
  TASK_STATUSES, TASK_STATUS_KEYS, isValidTaskStatus,
  AUDIT_ENTITY_TYPES, isValidAuditEntityType,
}
