import { useEffect, useState, useCallback } from 'react'
import api from '../../api/client'
import { fmtMoney } from '../../utils/format'
import { customerStatusMeta, STATUS_BADGE } from './financeCatalog'
import CustomerDetail from './CustomerDetail'
import NewCustomerModal from './NewCustomerModal'

const input = 'border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500'

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// Pestaña Clientes (sección 4.4): tarjetas Total a cobrar/Vencido, buscador
// (nombre o razón social) + "Solo con saldo" + orden (A-Z por defecto, o por
// saldo: vencidos primero — lo ordena el backend). Clic en una fila → CustomerDetail.
const SORT_KEY = 'bliss_finanzas_customers_sort'
function readSort() {
  try { return localStorage.getItem(SORT_KEY) === 'balance' ? 'balance' : 'name' } catch { return 'name' }
}
export default function CustomersTab({ accounts, categories, items, taxes, issuers, financeIvaMode, onDataChange }) {
  const [search, setSearch] = useState('')
  const [onlyWithBalance, setOnlyWithBalance] = useState(false)
  const [sort, setSort] = useState(readSort)
  const [customers, setCustomers] = useState(null)
  const [openId, setOpenId] = useState(null)
  const [showNew, setShowNew] = useState(false)

  const load = useCallback(async () => {
    const params = {}
    if (search.trim()) params.search = search.trim()
    if (onlyWithBalance) params.onlyWithBalance = 'true'
    params.sort = sort
    const res = await api.get('/finanzas/customers', { params })
    setCustomers(res.data)
  }, [search, onlyWithBalance, sort])

  function changeSort(value) {
    setSort(value)
    try { localStorage.setItem(SORT_KEY, value) } catch { /* sin storage: queda en memoria */ }
  }

  useEffect(() => { load() }, [load])

  if (openId) {
    return (
      <CustomerDetail itemId={openId} accounts={accounts} categoriesList={categories} items={items} taxes={taxes} issuers={issuers} financeIvaMode={financeIvaMode}
        onBack={() => { setOpenId(null); load(); onDataChange?.() }} />
    )
  }

  const totalToCollect = (customers || []).reduce((s, c) => s + Number(c.saldo), 0)
  const totalOverdue = (customers || []).filter(c => c.status === 'overdue').reduce((s, c) => s + Number(c.saldo), 0)

  return (
    <div>
      <div className="grid grid-cols-2 gap-3 mb-5 max-w-md">
        <div className="bg-gray-900 dark:bg-black text-white rounded-2xl p-4">
          <p className="text-xs text-gray-300">Total a cobrar</p>
          <p className="text-xl font-bold">{fmtMoney(totalToCollect, 'ARS')}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-4">
          <p className="text-xs text-gray-400">Vencido</p>
          <p className="text-xl font-bold text-red-600 dark:text-red-400">{fmtMoney(totalOverdue, 'ARS')}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <input className={`${input} flex-1 max-w-xs`} placeholder="Buscar cliente…" value={search} onChange={e => setSearch(e.target.value)} />
        <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
          <input type="checkbox" checked={onlyWithBalance} onChange={e => setOnlyWithBalance(e.target.checked)} /> Solo con saldo
        </label>
        <select className={`${input} py-1.5`} value={sort} onChange={e => changeSort(e.target.value)} aria-label="Ordenar clientes">
          <option value="name">Ordenar: A-Z</option>
          <option value="balance">Ordenar: por saldo</option>
        </select>
        <div className="flex-1" />
        <button onClick={() => setShowNew(true)} className="bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-xl px-4 py-2 text-sm">+ Nuevo cliente</button>
      </div>

      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-gray-400 border-b border-gray-100 dark:border-gray-700">
              <th className="px-4 py-2 font-medium">Cliente</th>
              <th className="px-4 py-2 font-medium text-right">Facturado</th>
              <th className="px-4 py-2 font-medium text-right">Cobrado</th>
              <th className="px-4 py-2 font-medium text-right">Saldo</th>
              <th className="px-4 py-2 font-medium">Estado</th>
              <th className="px-4 py-2 font-medium">Última factura</th>
            </tr>
          </thead>
          <tbody>
            {(customers || []).map(c => {
              const meta = customerStatusMeta(c.status)
              return (
                <tr key={c.id} onClick={() => setOpenId(c.id)} className="border-b border-gray-50 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-900/30 cursor-pointer">
                  <td className="px-4 py-2.5 text-gray-900 dark:text-white font-medium">
                    {c.name}
                    {c.legalName && c.legalName !== c.name && <p className="text-xs text-gray-400 font-normal">{c.legalName}</p>}
                  </td>
                  <td className="px-4 py-2.5 text-right text-gray-500 dark:text-gray-400">{fmtMoney(c.facturado, 'ARS')}</td>
                  <td className="px-4 py-2.5 text-right text-gray-500 dark:text-gray-400">{fmtMoney(c.cobrado, 'ARS')}</td>
                  <td className="px-4 py-2.5 text-right font-medium text-gray-900 dark:text-white">{fmtMoney(c.saldo, 'ARS')}</td>
                  <td className="px-4 py-2.5"><span className={`text-[11px] rounded-full px-2 py-0.5 ${STATUS_BADGE[meta.color]}`}>{meta.label}</span></td>
                  <td className="px-4 py-2.5 text-gray-500 dark:text-gray-400">{c.lastInvoice ? `${c.lastInvoice.number} · ${fmtDate(c.lastInvoice.issueDate)}` : '—'}</td>
                </tr>
              )
            })}
            {customers !== null && customers.length === 0 && (
              <tr><td colSpan={6} className="text-center text-sm text-gray-400 py-8">Sin clientes todavía — creá el primero con "+ Nuevo cliente".</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {showNew && (
        <NewCustomerModal categories={categories} issuers={issuers}
          onClose={() => setShowNew(false)}
          onCreated={(created) => { setShowNew(false); load(); onDataChange?.(); setOpenId(created.id) }}
        />
      )}
    </div>
  )
}
