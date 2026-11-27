import { AlertTriangle } from 'lucide-react'
import { Icon } from '../ui/Icon'
import { fmtMoney } from '../../utils/format'

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', timeZone: 'UTC' })
}

function invoiceLabel(inv) {
  const kind = inv.kind === 'credit_note' ? 'NC' : inv.kind === 'debit_note' ? 'ND' : 'Factura'
  return inv.number ? `${kind} ${inv.number}` : `${kind} sin número`
}

function Stat({ label, value, hint, tone = 'text-gray-900 dark:text-white' }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-xs text-gray-500 dark:text-gray-400">{label}{hint && <span className="text-gray-400"> · {hint}</span>}</span>
      <span className={`text-sm font-semibold whitespace-nowrap ${tone}`}>{value}</span>
    </div>
  )
}

function EntityCard({ entity, currency }) {
  const none = entity.issuerId === null
  const net = Number(entity.net)
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-4 flex flex-col">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="min-w-0">
          <h4 className={`text-sm font-semibold truncate ${none ? 'text-gray-500 dark:text-gray-400' : 'text-gray-900 dark:text-white'}`}>{entity.name}</h4>
          {entity.cuit && <p className="text-[11px] text-gray-400">CUIT {entity.cuit}</p>}
          {none && <p className="text-[11px] text-gray-400">Facturas informativas y cuentas sin entidad</p>}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {!entity.active && <span className="text-[10px] bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400 rounded-full px-1.5 py-0.5">Desactivada</span>}
          {entity.crossCount > 0 && (
            <span className="inline-flex items-center gap-0.5 text-[10px] bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 rounded-full px-1.5 py-0.5"
              title="Cobros cruzados entre entidades este mes (ver el aviso de arriba)">
              <Icon as={AlertTriangle} size={10} />{entity.crossCount}
            </span>
          )}
        </div>
      </div>

      <div className="space-y-1.5">
        <Stat label="Facturó" hint={`${entity.invoiceCount} comprobante${entity.invoiceCount === 1 ? '' : 's'}`} value={fmtMoney(entity.invoiced, currency)} />
        <Stat label="Ingresó" value={fmtMoney(entity.income, currency)} tone="text-primary-600 dark:text-primary-400" />
        <Stat label="Salió" value={fmtMoney(entity.expense, currency)} tone="text-orange-600 dark:text-orange-400" />
        <div className="border-t border-gray-100 dark:border-gray-700 pt-1.5">
          <Stat label="Ingresos − egresos" value={fmtMoney(entity.net, currency)}
            tone={net < 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-white'} />
        </div>
      </div>

      {entity.pendingChecks.count > 0 && (
        <p className="text-[11px] text-gray-400 mt-2">
          + {fmtMoney(entity.pendingChecks.amount, currency)} en {entity.pendingChecks.count} cheque{entity.pendingChecks.count === 1 ? '' : 's'} sin acreditar
        </p>
      )}

      <p className="text-[11px] text-gray-400 mt-auto pt-3">
        {entity.accounts.length > 0
          ? <>Cuentas: {entity.accounts.map(a => a.name).join(', ')}</>
          : none ? 'Ninguna cuenta sin entidad' : 'Sin cuentas asociadas en esta moneda — se asocian en Configuración'}
      </p>
    </div>
  )
}

// Resumen → por entidad de facturación: lo facturado en el mes vs. lo que
// entró y salió por las cuentas de cada entidad, y el aviso de cobros que
// entraron en la cuenta de otra entidad (los datos vienen de
// GET /finanzas/summary/entities). `onOpenMovement(id)` abre el movimiento
// para corregirlo (por ejemplo, cambiarle la cuenta).
export default function EntitySummaryCards({ data, currency, onOpenMovement }) {
  if (!data) return <p className="text-sm text-gray-400 text-center py-6">Cargando…</p>
  const { entities, crossCollections } = data

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Por entidad de facturación</h3>

      {crossCollections.length > 0 && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl p-4">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-amber-800 dark:text-amber-300">
            <Icon as={AlertTriangle} size={14} />
            {crossCollections.length === 1 ? 'Un cobro entró' : `${crossCollections.length} cobros entraron`} en la cuenta de otra entidad
          </p>
          <p className="text-xs text-amber-700/80 dark:text-amber-400/80 mt-0.5 mb-2">La factura la emitió una razón social y la plata entró en una cuenta de otra. Tocá uno para revisarlo.</p>
          <ul className="divide-y divide-amber-200/60 dark:divide-amber-800/60">
            {crossCollections.map(c => (
              <li key={c.movementId}>
                <button type="button" onClick={() => onOpenMovement?.(c.movementId)}
                  className="w-full text-left py-2 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-sm hover:bg-amber-100/60 dark:hover:bg-amber-900/30 rounded-lg px-1 -mx-1">
                  <span className="text-xs text-amber-700 dark:text-amber-400 w-10 shrink-0">{fmtDate(c.date)}</span>
                  <span className="font-medium text-gray-900 dark:text-white">{c.itemName || '—'}</span>
                  <span className="font-semibold text-gray-900 dark:text-white whitespace-nowrap">{fmtMoney(c.amount, c.currency)}</span>
                  <span className="text-xs text-gray-600 dark:text-gray-300 basis-full sm:basis-auto">
                    {invoiceLabel(c.invoice)} de <strong>{c.invoice.issuerName}</strong> → entró en {c.account.name} (<strong>{c.account.issuerName}</strong>)
                    {c.pendingCheck && ' · cheque sin acreditar'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {entities.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-6 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl">
          Sin entidades de facturación ni movimientos este mes. Las entidades se cargan en Configuración → Emisores.
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {entities.map(e => <EntityCard key={e.issuerId ?? 'none'} entity={e} currency={currency} />)}
        </div>
      )}
    </div>
  )
}
