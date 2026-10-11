// Espejo del catálogo de Finanzas del backend (backend/src/lib/financeCatalog.js).
// El frontend usa labels + colores para el render de badges/selects/filtros.
// Mantener en sync con el backend al agregar valores nuevos.
//
// Categorías/Cuentas/Items/Impuestos NO van acá: son catálogos editables por
// el usuario final (filas en DB), no enums cerrados de código.

export const ACCOUNT_TYPES = [
  { key: 'bank',          label: 'Banco' },
  { key: 'wallet',        label: 'Billetera' },
  { key: 'cash',          label: 'Caja' },
  { key: 'crypto_wallet', label: 'Wallet cripto' },
]

// Condición fiscal del EMISOR (FinanceIssuer.taxCondition) — mismo vocabulario
// que usa `arca.issue({ issuer: ... })` del SDK `facturas`.
export const ISSUER_TAX_CONDITIONS = [
  { key: 'responsable_inscripto', label: 'Responsable Inscripto' },
  { key: 'monotributo',           label: 'Monotributo' },
  { key: 'exento',                label: 'Exento' },
]

export const ISSUER_ENVIRONMENTS = [
  { key: 'test',       label: 'Homologación (test)' },
  { key: 'production', label: 'Producción' },
]

// Condición de IVA del RECEPTOR (FinanceItem.ivaCondition).
export const ITEM_IVA_CONDITIONS = [
  { key: 'responsable_inscripto', label: 'Responsable Inscripto' },
  { key: 'monotributo',           label: 'Monotributo' },
  { key: 'consumidor_final',      label: 'Consumidor Final' },
  { key: 'exento',                label: 'Exento' },
]

// Alícuotas que acepta ARCA para un emisor responsable_inscripto.
export const ARCA_VAT_RATES = [0, 2.5, 5, 10.5, 21, 27]

// Resultado de una emisión vía ARCA (FinanceInvoice.arcaStatus).
export const ARCA_STATUSES = [
  { key: 'authorized',    label: 'Autorizada',    color: 'green' },
  { key: 'rejected',      label: 'Rechazada',     color: 'red' },
  { key: 'indeterminate', label: 'A reconciliar', color: 'amber' },
  { key: 'conflict',      label: 'Conflicto',     color: 'amber' },
]

// FinanceInvoice.kind (Etapa 4) — 'invoice' es el comprobante normal.
export const INVOICE_KINDS = [
  { key: 'invoice',     label: 'Factura',          short: null },
  { key: 'credit_note', label: 'Nota de crédito',  short: 'NC' },
  { key: 'debit_note',  label: 'Nota de débito',   short: 'ND' },
]

export const CURRENCIES = [
  { key: 'ARS', label: 'Pesos' },
  { key: 'USD', label: 'Dólares' },
  { key: 'BTC', label: 'Bitcoin' },
]

export const MOVEMENT_TYPES = [
  { key: 'income',  label: 'Ingreso' },
  { key: 'expense', label: 'Egreso' },
]

export const TAX_APPLIES_TO = [
  { key: 'income',  label: 'Ingresos' },
  { key: 'expense', label: 'Egresos' },
  { key: 'both',    label: 'Ambos' },
]

export const TAX_BASE_TYPES = [
  { key: 'movement',  label: 'El movimiento' },
  { key: 'other_tax', label: 'Otro impuesto' },
]

export const PAYMENT_METHODS = [
  { key: 'transfer', label: 'Transferencia' },
  { key: 'check',    label: 'Cheque' },
]

export const ACCOUNT_APPLICATIONS = [
  { key: 'invoice',    label: 'Factura' },
  { key: 'on_account', label: 'A cuenta' },
  { key: 'no_effect',  label: 'No afecta la cuenta' },
]

export const CHECK_STATUSES = [
  { key: 'pending',  label: 'Pendiente',  color: 'orange' },
  { key: 'credited', label: 'Acreditado', color: 'green' },
  { key: 'rejected', label: 'Rechazado',  color: 'red' },
]

export const TRANSFER_REASONS = [
  { key: 'buy_usd',           label: 'Compra de dólares' },
  { key: 'sell_usd',          label: 'Venta de dólares' },
  { key: 'fund_contribution', label: 'Aporte a fondo' },
  { key: 'fund_redemption',   label: 'Rescate de fondo' },
  { key: 'account_transfer',  label: 'Transferencia entre cuentas' },
]

// Estado de factura: lo calcula el backend (nunca persistido), acá solo labels/colores.
export const INVOICE_STATUSES = [
  { key: 'paid',    label: 'Pagada',    color: 'green' },
  { key: 'partial', label: 'Parcial',   color: 'amber' },
  { key: 'overdue', label: 'Vencida',   color: 'red' },
  { key: 'pending', label: 'Pendiente', color: 'gray' },
]

export const CUSTOMER_STATUSES = [
  { key: 'overdue', label: 'Vencido',  color: 'red' },
  { key: 'pending', label: 'Pendiente', color: 'amber' },
  { key: 'current', label: 'Al día',   color: 'green' },
]

export const EXTRA_STATUSES = [
  { key: 'in_progress', label: 'En curso',  color: 'blue' },
  { key: 'finished',    label: 'Terminado',  color: 'amber' },
  { key: 'collected',   label: 'Cobrado',    color: 'green' },
]

export const NEXT_ACTION_RECURRENCES = [
  { key: 'once',    label: 'Una vez' },
  { key: 'monthly', label: 'Mensual' },
  { key: 'yearly',  label: 'Anual' },
]

export const TASK_ORIGIN_LABELS = {
  check:             'Cheque',
  invoice:           'Factura',
  extra:             'Extra',
  next_action:       'Recordatorio',
  check_rejected:    'Cheque',
  invoice_reconcile: 'ARCA',
  manual:            'Manual',
}

export const TASK_STATUSES = [
  { key: 'open',      label: 'Abierta' },
  { key: 'done',      label: 'Hecha' },
  { key: 'postponed', label: 'Pospuesta' },
]

function metaOf(list, key, fallbackLabel) {
  return list.find(x => x.key === key) || { key, label: fallbackLabel ?? key, color: 'gray' }
}

export function accountTypeLabel(key)        { return metaOf(ACCOUNT_TYPES, key).label }
export function issuerTaxConditionLabel(key) { return metaOf(ISSUER_TAX_CONDITIONS, key).label }
export function issuerEnvironmentLabel(key)  { return metaOf(ISSUER_ENVIRONMENTS, key).label }
export function itemIvaConditionLabel(key)   { return key ? metaOf(ITEM_IVA_CONDITIONS, key).label : '—' }

// Acepta un CUIT con o sin guiones ("20323156426" o "20-32315642-6") y lo
// formatea solo — mismo helper que `normalizeCuit` del backend
// (controllers/finanzas/_shared.js), no hace falta tipear los guiones.
export function normalizeCuit(raw) {
  const trimmed = String(raw || '').trim()
  if (/^\d{2}-\d{8}-\d$/.test(trimmed)) return trimmed
  const digits = trimmed.replace(/\D/g, '')
  if (digits.length === 11) return `${digits.slice(0, 2)}-${digits.slice(2, 10)}-${digits.slice(10)}`
  return trimmed
}
export function currencyLabel(key)           { return metaOf(CURRENCIES, key).label }
export function taxBaseTypeLabel(key)        { return metaOf(TAX_BASE_TYPES, key).label }
export function paymentMethodLabel(key)      { return metaOf(PAYMENT_METHODS, key).label }
export function accountApplicationLabel(key) { return metaOf(ACCOUNT_APPLICATIONS, key).label }
export function checkStatusMeta(key)         { return metaOf(CHECK_STATUSES, key) }
export function transferReasonLabel(key)     { return metaOf(TRANSFER_REASONS, key).label }
export function invoiceStatusMeta(key)       { return metaOf(INVOICE_STATUSES, key) }
export function arcaStatusMeta(key)          { return metaOf(ARCA_STATUSES, key) }
export function invoiceKindMeta(key)         { return metaOf(INVOICE_KINDS, key) }
export function customerStatusMeta(key)      { return metaOf(CUSTOMER_STATUSES, key) }
export function extraStatusMeta(key)         { return metaOf(EXTRA_STATUSES, key) }
export function taskOriginLabel(key)         { return TASK_ORIGIN_LABELS[key] || key || '—' }

// Clases Tailwind por color de badge — misma paleta que components/ventas/salesCatalog.js.
export const STATUS_BADGE = {
  gray:   'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200',
  orange: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  blue:   'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  amber:  'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  green:  'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  red:    'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
}
