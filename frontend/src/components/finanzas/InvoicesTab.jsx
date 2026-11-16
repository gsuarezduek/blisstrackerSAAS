import { useEffect, useState, useCallback } from 'react'
import api from '../../api/client'
import { fmtMoney } from '../../utils/format'
import { currentMonthKey, shiftMonth, monthLabel } from './financeMonths'
import { movementDateParams } from './MovementsFilterBar'
import { invoiceTotals } from './financeCatalog'
import InvoicesTable from './InvoicesTable'

const input = 'border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500'
const label = 'block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1'

const MONTHS_IN_SELECT = 24
const PERIOD_ALL = 'all'
const PERIOD_CUSTOM = 'custom'
// Valor del selector de emisor para las facturas informativas (sin emisor de
// ARCA, número tipeado a mano) — el backend lo entiende como `issuerId IS NULL`.
const ISSUER_NONE = 'none'

function emptyFilters() {
  return { period: currentMonthKey(), from: '', to: '', issuerId: '', itemId: '', status: '', search: '' }
}

// Pestaña Facturas: todas las facturas del workspace (no de un cliente), por
// período de emisión y por emisor, con los totales del período. Las acciones
// de cada fila son las mismas que en el detalle del cliente (InvoicesTable).
export default function InvoicesTab({ items, financeIvaMode, refreshKey }) {
  const [filters, setFilters] = useState(emptyFilters)
  const [invoices, setInvoices] = useState(null)
  const [error, setError] = useState(null)
  // Todos los emisores, también los desactivados: sus facturas siguen
  // existiendo y hay que poder filtrarlas (Finanzas.jsx solo carga los activos,
  // que son los que sirven para emitir).
  const [allIssuers, setAllIssuers] = useState([])

  useEffect(() => {
    api.get('/finanzas/issuers').then(res => setAllIssuers(res.data)).catch(() => setAllIssuers([]))
  }, [])

  const load = useCallback(async () => {
    const params = { ...movementDateParams(filters) }
    if (filters.issuerId) params.issuerId = filters.issuerId
    if (filters.itemId) params.itemId = filters.itemId
    if (filters.status) params.status = filters.status
    if (filters.search.trim()) params.search = filters.search.trim()
    try {
      const res = await api.get('/finanzas/invoices', { params })
      setInvoices(res.data)
      setError(null)
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudieron cargar las facturas')
    }
  }, [filters])

  useEffect(() => { load() }, [load, refreshKey])

  function set(patch) { setFilters(f => ({ ...f, ...patch })) }

  function handlePeriodChange(period) {
    // Al pasar a personalizada arranca del período que se estaba viendo, para ajustarlo.
    const start = period === PERIOD_CUSTOM ? movementDateParams(filters) : {}
    set({ period, from: start.from || '', to: start.to || '' })
  }

  const thisMonth = currentMonthKey()
  const months = Array.from({ length: MONTHS_IN_SELECT }, (_, i) => shiftMonth(thisMonth, -i))
  const defaults = emptyFilters()
  const isDefault = Object.keys(defaults).every(k => filters[k] === defaults[k])
  // Los clientes inactivos también: pueden tener facturas en el período.
  const customers = items.filter(i => i.tracksAccount).sort((a, b) => a.name.localeCompare(b.name, 'es'))
  const activeIssuers = allIssuers.filter(i => i.active)
  const inactiveIssuers = allIssuers.filter(i => !i.active)

  const totals = invoiceTotals(invoices)

  return (
    <div>
      <div className="flex flex-wrap items-end gap-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 mb-4">
        <div>
          <label htmlFor="invoices-period" className={label}>Emisión</label>
          <select id="invoices-period" className={input} value={filters.period} onChange={e => handlePeriodChange(e.target.value)}>
            {months.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
            <option value={PERIOD_ALL}>Todas las fechas</option>
            <option value={PERIOD_CUSTOM}>Fecha personalizada</option>
          </select>
        </div>
        {filters.period === PERIOD_CUSTOM && (
          <>
            <div>
              <label htmlFor="invoices-from" className={label}>Desde</label>
              <input id="invoices-from" type="date" className={input} value={filters.from} onChange={e => set({ from: e.target.value })} />
            </div>
            <div>
              <label htmlFor="invoices-to" className={label}>Hasta</label>
              <input id="invoices-to" type="date" className={input} value={filters.to} onChange={e => set({ to: e.target.value })} />
            </div>
          </>
        )}
        <div>
          <label htmlFor="invoices-issuer" className={label}>Emisor</label>
          <select id="invoices-issuer" className={input} value={filters.issuerId} onChange={e => set({ issuerId: e.target.value })}>
            <option value="">Todos</option>
            {activeIssuers.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
            {inactiveIssuers.length > 0 && (
              <optgroup label="Desactivados">
                {inactiveIssuers.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
              </optgroup>
            )}
            <option value={ISSUER_NONE}>Sin emisor (informativas)</option>
          </select>
        </div>
        <div>
          <label htmlFor="invoices-customer" className={label}>Cliente</label>
          <select id="invoices-customer" className={`${input} max-w-[14rem]`} value={filters.itemId} onChange={e => set({ itemId: e.target.value })}>
            <option value="">Todos</option>
            {customers.map(c => <option key={c.id} value={c.id}>{c.name}{c.active ? '' : ' (inactivo)'}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="invoices-status" className={label}>Estado</label>
          <select id="invoices-status" className={input} value={filters.status} onChange={e => set({ status: e.target.value })}>
            <option value="">Todos</option>
            <option value="pending">Pendiente</option>
            <option value="partial">Parcial</option>
            <option value="overdue">Vencida</option>
            <option value="paid">Pagada</option>
            <option value="rejected">Rechazada</option>
          </select>
        </div>
        <div className="flex-1 min-w-[10rem]">
          <label htmlFor="invoices-search" className={label}>Buscar</label>
          <input id="invoices-search" className={`${input} w-full`} placeholder="N° o concepto…" value={filters.search} onChange={e => set({ search: e.target.value })} />
        </div>
        {!isDefault && (
          <button onClick={() => setFilters(emptyFilters())} className="text-sm font-medium text-primary-600 dark:text-primary-400 hover:underline pb-2">Limpiar</button>
        )}
      </div>

      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-4">
        <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
          <div className="space-y-2">
            {totals.currencies.length === 0 ? (
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide">Facturado neto</p>
                <p className="text-xl font-bold text-gray-900 dark:text-white">{invoices ? fmtMoney(0, 'ARS') : '—'}</p>
              </div>
            ) : totals.currencies.map(t => (
              <div key={t.currency}>
                <p className="text-xs text-gray-400 uppercase tracking-wide">Facturado neto{totals.currencies.length > 1 ? ` · ${t.currency}` : ''}</p>
                <p className="text-xl font-bold text-gray-900 dark:text-white">{fmtMoney(t.net, t.currency)}</p>
                {(t.credit > 0 || t.debit > 0) && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    Facturas {fmtMoney(t.invoiced, t.currency)}
                    {t.debit > 0 && <> · + ND {fmtMoney(t.debit, t.currency)}</>}
                    {t.credit > 0 && <> · − NC {fmtMoney(t.credit, t.currency)}</>}
                  </p>
                )}
              </div>
            ))}
          </div>
          <div className="text-right text-xs text-gray-400">
            {invoices && <p>{invoices.length} comprobante{invoices.length === 1 ? '' : 's'}</p>}
            {totals.rejected > 0 && <p className="mt-0.5">{totals.rejected} rechazado{totals.rejected === 1 ? '' : 's'} por ARCA, no suma{totals.rejected === 1 ? '' : 'n'}</p>}
          </div>
        </div>

        {error ? (
          <p className="text-sm text-red-600 dark:text-red-400 text-center py-8">{error}</p>
        ) : invoices === null ? (
          <p className="text-sm text-gray-400 text-center py-8">Cargando…</p>
        ) : (
          <InvoicesTable invoices={invoices} onReload={load} showCustomer issuers={activeIssuers} financeIvaMode={financeIvaMode} />
        )}
      </div>
    </div>
  )
}
