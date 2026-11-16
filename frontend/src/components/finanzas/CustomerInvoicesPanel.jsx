import { useEffect, useState, useCallback } from 'react'
import api from '../../api/client'
import InvoicesTable from './InvoicesTable'

const input = 'border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 dark:text-gray-100 rounded-lg px-2.5 py-1.5 text-sm'

// "Facturas" (sección 4.5b): TODAS las facturas del cliente, buscador,
// filtro año/estado, selección múltiple + Descargar (zip si son varias) /
// Enviar por mail. La tabla y sus acciones viven en InvoicesTable, compartida
// con la pestaña Facturas de todo el workspace.
export default function CustomerInvoicesPanel({ itemId, refreshKey, customer, issuers, financeIvaMode }) {
  const [search, setSearch] = useState('')
  const [year, setYear] = useState('')
  const [status, setStatus] = useState('')
  const [invoices, setInvoices] = useState(null)

  const load = useCallback(async () => {
    const params = { itemId }
    if (search.trim()) params.search = search.trim()
    if (year) params.year = year
    if (status) params.status = status
    const res = await api.get('/finanzas/invoices', { params })
    setInvoices(res.data)
  }, [itemId, search, year, status])

  useEffect(() => { load() }, [load, refreshKey])

  if (!invoices) return <p className="text-sm text-gray-400 text-center py-8">Cargando…</p>

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <input className={`${input} flex-1 min-w-[8rem]`} placeholder="N° o concepto…" value={search} onChange={e => setSearch(e.target.value)} />
        <select className={input} value={year} onChange={e => setYear(e.target.value)}>
          <option value="">Todos los años</option>
          {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i).map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <select className={input} value={status} onChange={e => setStatus(e.target.value)}>
          <option value="">Todos</option>
          <option value="pending">Pendiente</option>
          <option value="partial">Parcial</option>
          <option value="overdue">Vencida</option>
          <option value="paid">Pagada</option>
          <option value="rejected">Rechazada</option>
        </select>
      </div>

      <InvoicesTable invoices={invoices} onReload={load} customer={customer} issuers={issuers} financeIvaMode={financeIvaMode} />
    </div>
  )
}
