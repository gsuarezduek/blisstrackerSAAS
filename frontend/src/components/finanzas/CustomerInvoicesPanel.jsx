import { useEffect, useState, useCallback } from 'react'
import { Download } from 'lucide-react'
import { Icon } from '../ui/Icon'
import api from '../../api/client'
import { fmtMoney } from '../../utils/format'
import { invoiceStatusMeta, STATUS_BADGE } from './financeCatalog'

const input = 'border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 dark:text-gray-100 rounded-lg px-2.5 py-1.5 text-sm'

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

async function downloadBlob(url, filename) {
  const res = await api.get(url, { responseType: 'blob' })
  const blobUrl = URL.createObjectURL(res.data)
  const a = document.createElement('a')
  a.href = blobUrl; a.download = filename
  document.body.appendChild(a); a.click(); a.remove()
  URL.revokeObjectURL(blobUrl)
}

// "Facturas" (sección 4.5b): TODAS las facturas del cliente, buscador,
// filtro año/estado, selección múltiple + Descargar (zip si son varias) /
// Enviar por mail.
export default function CustomerInvoicesPanel({ itemId, currency, refreshKey, onInvoiceClick }) {
  const [search, setSearch] = useState('')
  const [year, setYear] = useState('')
  const [status, setStatus] = useState('')
  const [invoices, setInvoices] = useState(null)
  const [selected, setSelected] = useState(new Set())
  const [sending, setSending] = useState(false)

  const load = useCallback(async () => {
    const params = { itemId }
    if (search.trim()) params.search = search.trim()
    if (year) params.year = year
    if (status) params.status = status
    const res = await api.get('/finanzas/invoices', { params })
    setInvoices(res.data)
  }, [itemId, search, year, status])

  useEffect(() => { load() }, [load, refreshKey])

  function toggle(id) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  // download-zip es POST (manda `ids` en el body) — downloadBlob asume GET, se maneja aparte.
  async function handleDownloadZip() {
    const res = await api.post('/finanzas/invoices/download-zip', { ids: [...selected] }, { responseType: 'blob' })
    const blobUrl = URL.createObjectURL(res.data)
    const a = document.createElement('a')
    a.href = blobUrl; a.download = 'facturas.zip'
    document.body.appendChild(a); a.click(); a.remove()
    URL.revokeObjectURL(blobUrl)
  }

  async function handleSendEmail() {
    setSending(true)
    try {
      await api.post('/finanzas/invoices/send-email', { ids: [...selected] })
      alert('Factura(s) enviada(s) por mail.')
      setSelected(new Set())
    } catch (err) {
      alert(err.response?.data?.error || 'No se pudo enviar')
    } finally { setSending(false) }
  }

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
        </select>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-gray-400 border-b border-gray-100 dark:border-gray-700">
              <th className="py-2 pr-2 w-6"></th>
              <th className="py-2 pr-2 font-medium">Número</th>
              <th className="py-2 pr-2 font-medium">Emisión</th>
              <th className="py-2 pr-2 font-medium">Concepto</th>
              <th className="py-2 pr-2 font-medium text-right">Monto</th>
              <th className="py-2 pr-2 font-medium">Estado</th>
              <th className="py-2 pl-2 font-medium text-right"></th>
            </tr>
          </thead>
          <tbody>
            {invoices.map(inv => {
              const meta = invoiceStatusMeta(inv.status)
              return (
                <tr key={inv.id} className="border-b border-gray-50 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-900/30">
                  <td className="py-2 pr-2"><input type="checkbox" checked={selected.has(inv.id)} onChange={() => toggle(inv.id)} /></td>
                  <td className="py-2 pr-2 text-gray-900 dark:text-white cursor-pointer" onClick={() => onInvoiceClick?.(inv)}>{inv.number}</td>
                  <td className="py-2 pr-2 text-gray-500 dark:text-gray-400 whitespace-nowrap">{fmtDate(inv.issueDate)}</td>
                  <td className="py-2 pr-2 text-gray-700 dark:text-gray-300">{inv.concept}</td>
                  <td className="py-2 pr-2 text-right font-medium text-gray-900 dark:text-white whitespace-nowrap">{fmtMoney(inv.amount, currency)}</td>
                  <td className="py-2 pr-2"><span className={`text-[11px] rounded-full px-2 py-0.5 ${STATUS_BADGE[meta.color]}`}>{meta.label}</span></td>
                  <td className="py-2 pl-2 text-right">
                    {inv.attachments[0] && (
                      <button onClick={() => downloadBlob(`/finanzas/invoices/${inv.id}/attachments/${inv.attachments[0].id}/download`, inv.attachments[0].name)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                        <Icon as={Download} size={14} />
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
            {invoices.length === 0 && <tr><td colSpan={7} className="text-center text-xs text-gray-400 py-6">Sin facturas.</td></tr>}
          </tbody>
        </table>
      </div>

      {selected.size > 0 && (
        <div className="flex items-center gap-3 bg-gray-50 dark:bg-gray-900/40 rounded-xl px-4 py-2.5 mt-3">
          <span className="text-sm text-gray-600 dark:text-gray-300">{selected.size} factura{selected.size === 1 ? '' : 's'} seleccionada{selected.size === 1 ? '' : 's'}</span>
          <div className="flex-1" />
          <button onClick={handleDownloadZip} className="border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-800 rounded-lg px-3 py-1.5 text-xs font-medium">Descargar</button>
          <button onClick={handleSendEmail} disabled={sending} className="bg-primary-600 hover:bg-primary-700 text-white rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50">Enviar por mail</button>
        </div>
      )}
    </div>
  )
}
