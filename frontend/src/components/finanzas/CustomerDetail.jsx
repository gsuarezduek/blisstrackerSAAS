import { useEffect, useState, useCallback } from 'react'
import api from '../../api/client'
import { TextButton } from '../../pages/project-detail/ui.jsx'
import { fmtMoney } from '../../utils/format'
import CustomerLedgerPanel from './CustomerLedgerPanel'
import CustomerInvoicesPanel from './CustomerInvoicesPanel'
import NextActionsList from './NextActionsList'
import PendingInvoicesList from './PendingInvoicesList'
import CustomerInfoCard from './CustomerInfoCard'
import NewInvoiceModal from './NewInvoiceModal'
import LoadMovementModal from './LoadMovementModal'

const SUBTABS = [{ id: 'movimientos', label: 'Movimientos' }, { id: 'facturas', label: 'Facturas' }]

// Detalle del cliente (sección 4.5): header + saldo + pestañas Movimientos/
// Facturas + columna lateral (Próximas acciones, Facturas pendientes, Datos).
export default function CustomerDetail({ itemId, accounts, categoriesList, items, taxes, onBack }) {
  const [customer, setCustomer] = useState(null)
  const [actions, setActions] = useState([])
  const [subtab, setSubtab] = useState('movimientos')
  const [refreshKey, setRefreshKey] = useState(0)
  const [showNewInvoice, setShowNewInvoice] = useState(false)
  const [paymentContext, setPaymentContext] = useState(null) // { item, invoiceId } | null | 'new'

  const load = useCallback(async () => {
    const [custRes, actionsRes] = await Promise.all([
      api.get(`/finanzas/customers/${itemId}`),
      api.get('/finanzas/next-actions', { params: { itemId } }),
    ])
    setCustomer(custRes.data)
    setActions(actionsRes.data)
  }, [itemId])

  useEffect(() => { load() }, [load])

  function handleChanged() {
    load()
    setRefreshKey(k => k + 1)
  }

  if (!customer) return <p className="text-sm text-gray-400 text-center py-10">Cargando…</p>

  // El ledger del cliente se expresa en la moneda de facturación — Factura.currency
  // default ARS (spec 4.8), no hay multi-moneda por cliente en v1.
  const currency = 'ARS'

  return (
    <div>
      <TextButton onClick={onBack} className="mb-2">← Volver a Clientes</TextButton>
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{customer.name}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Cuenta corriente · {customer.category?.name}</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button onClick={() => setPaymentContext('new')} className="border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-xl px-4 py-2 text-sm font-medium">+ Registrar cobro</button>
          <button onClick={() => setShowNewInvoice(true)} className="bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-xl px-4 py-2 text-sm">+ Factura</button>
        </div>
      </div>

      <div className="bg-gray-900 dark:bg-black text-white rounded-2xl p-4 mb-5 w-fit">
        <p className="text-xs text-gray-300">Saldo a cobrar</p>
        <p className="text-2xl font-bold">{fmtMoney(customer.saldo, currency)}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2">
          <div className="flex gap-1 bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl p-1 w-fit mb-4">
            {SUBTABS.map(t => (
              <button key={t.id} onClick={() => setSubtab(t.id)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${subtab === t.id ? 'bg-primary-600 text-white' : 'text-gray-600 dark:text-gray-400'}`}>
                {t.label}
              </button>
            ))}
          </div>
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-4">
            {subtab === 'movimientos' ? (
              <CustomerLedgerPanel itemId={itemId} currency={currency} refreshKey={refreshKey} />
            ) : (
              <CustomerInvoicesPanel itemId={itemId} currency={currency} refreshKey={refreshKey} />
            )}
          </div>
        </div>

        <div className="space-y-5">
          <NextActionsList itemId={itemId} actions={actions} onChanged={handleChanged} />
          <PendingInvoicesList invoices={customer.invoices} currency={currency} onRegisterPayment={(inv) => setPaymentContext({ invoiceId: inv.id })} />
          <CustomerInfoCard customer={customer} onChanged={handleChanged} />
        </div>
      </div>

      {showNewInvoice && (
        <NewInvoiceModal items={items} defaultItemId={itemId}
          onClose={() => setShowNewInvoice(false)}
          onSaved={() => { setShowNewInvoice(false); handleChanged() }} />
      )}

      {paymentContext && (
        <LoadMovementModal
          accounts={accounts} categories={categoriesList} items={items} taxes={taxes}
          prefill={{ item: { id: customer.id, name: customer.name, tracksAccount: true, categoryId: customer.category?.id }, invoiceId: paymentContext === 'new' ? undefined : paymentContext.invoiceId }}
          onClose={() => setPaymentContext(null)}
          onSaved={() => { setPaymentContext(null); handleChanged() }}
        />
      )}
    </div>
  )
}
